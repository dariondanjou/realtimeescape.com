import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createBooking, validateBooking, type PaymentMode, type BookingKind } from '@/lib/bookings';
import { stripe, stripeConfigured, siteUrl } from '@/lib/stripe';
import { currentUser, adminClient } from '@/lib/supabase';
import { planApplication, spendCredit } from '@/lib/credit';
import { isDemoMode } from '@/lib/demo';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const demo = await isDemoMode();

  const input = {
    gameSlug: String(body.gameSlug ?? ''),
    seatCount: Number(body.seatCount ?? 0),
    paymentMode: String(body.paymentMode ?? '') as PaymentMode,
    kind: String(body.kind ?? '') as BookingKind,
    scheduledFor: body.scheduledFor ? String(body.scheduledFor) : null,
    hostEmail: String(body.hostEmail ?? '').trim().toLowerCase(),
  };

  if (!['host_pays_all', 'split'].includes(input.paymentMode)) {
    return NextResponse.json({ error: 'Invalid payment mode.' }, { status: 400 });
  }
  if (!['instant', 'scheduled'].includes(input.kind)) {
    return NextResponse.json({ error: 'Invalid booking kind.' }, { status: 400 });
  }

  // Server-side validation is authoritative — the browser's numbers are only a suggestion.
  const check = validateBooking(input, { demo });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // Payments must be configured unless this is a free booking (demo, or fully credit-covered).
  const creditPlan = demo
    ? { playerId: null, balanceCents: 0, appliedCents: check.amountCents, remainingDueCents: 0 }
    : await planApplication(input.hostEmail, check.amountCents);

  const isFree = creditPlan.remainingDueCents <= 0;

  if (!isFree && !stripeConfigured()) {
    return NextResponse.json(
      { error: 'Payments are not configured yet. Set STRIPE_SECRET_KEY to take bookings.' },
      { status: 503 },
    );
  }

  const user = await currentUser();

  let bookingId: string;
  try {
    const created = await createBooking({ ...input, hostUserId: user?.id ?? null }, { demo });
    bookingId = created.bookingId;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not create booking.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const db = adminClient();

  // ---- Free path: demo mode, or credit covers the whole amount ----
  if (isFree) {
    if (!demo && creditPlan.playerId && creditPlan.appliedCents > 0) {
      const spent = await spendCredit(
        creditPlan.playerId,
        creditPlan.appliedCents,
        bookingId,
        `Applied to booking ${bookingId.slice(0, 8)}`,
      );
      if (!spent) {
        return NextResponse.json(
          { error: 'Your credit balance changed while we were checking out. Please try again.' },
          { status: 409 },
        );
      }
    }

    const now = new Date().toISOString();
    await db
      .from('rte_booking_seats')
      .update({ paid: true, paid_at: now, amount_cents: 0 })
      .eq('booking_id', bookingId);

    await db
      .from('rte_bookings')
      .update({ status: 'confirmed', updated_at: now })
      .eq('id', bookingId);

    const { data: existing } = await db
      .from('rte_game_sessions')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (!existing) {
      await db.from('rte_game_sessions').insert({
        booking_id: bookingId,
        random_seed: cryptoSeed(),
        phase: 'created',
      });
    }

    return NextResponse.json({
      url: `${siteUrl()}/booking/${bookingId}?paid=1${demo ? '&demo=1' : '&credit=1'}`,
      free: true,
      demo,
      creditAppliedCents: demo ? 0 : creditPlan.appliedCents,
    });
  }

  // ---- Paid path, possibly part-covered by credit ----
  const seatWord = check.seatsToChargeNow === 1 ? 'seat' : 'seats';

  try {
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: check.seatsToChargeNow,
        price_data: {
          currency: 'usd',
          unit_amount: check.game.pricePerSeatCents,
          product_data: {
            name: `${check.game.title} — 1 player seat`,
            description: `${check.game.durationMinutes}-minute private session · ${check.seatsToChargeNow} ${seatWord}`,
          },
        },
      },
    ];

    // Credit is applied as a Stripe coupon so the customer sees the discount on the receipt
    // rather than an unexplained lower price.
    let discounts: { coupon: string }[] | undefined;
    if (creditPlan.appliedCents > 0 && creditPlan.playerId) {
      const spent = await spendCredit(
        creditPlan.playerId,
        creditPlan.appliedCents,
        bookingId,
        `Applied to booking ${bookingId.slice(0, 8)}`,
      );
      if (!spent) {
        return NextResponse.json(
          { error: 'Your credit balance changed while we were checking out. Please try again.' },
          { status: 409 },
        );
      }
      const coupon = await stripe().coupons.create({
        amount_off: creditPlan.appliedCents,
        currency: 'usd',
        duration: 'once',
        name: 'RealTimeEscape account credit',
        max_redemptions: 1,
      });
      discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: input.hostEmail,
      line_items: lineItems,
      discounts,
      success_url: `${siteUrl()}/booking/${bookingId}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/book/${input.gameSlug}?cancelled=1`,
      metadata: {
        rte_booking_id: bookingId,
        rte_kind: 'host_checkout',
        rte_seats_paid: String(check.seatsToChargeNow),
        rte_credit_applied: String(creditPlan.appliedCents),
      },
    });

    await db.from('rte_payments').insert({
      booking_id: bookingId,
      stripe_checkout_session_id: session.id,
      amount_cents: creditPlan.remainingDueCents,
      status: 'pending',
    });

    return NextResponse.json({ url: session.url, creditAppliedCents: creditPlan.appliedCents });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Stripe rejected the request.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function cryptoSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
