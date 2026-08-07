import { NextResponse } from 'next/server';
import { createBooking, validateBooking, type PaymentMode, type BookingKind } from '@/lib/bookings';
import { stripe, stripeConfigured, siteUrl } from '@/lib/stripe';
import { currentUser } from '@/lib/supabase';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: 'Payments are not configured yet. Set STRIPE_SECRET_KEY to take bookings.' },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

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
  const check = validateBooking(input);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const user = await currentUser();

  let bookingId: string;
  try {
    const created = await createBooking({ ...input, hostUserId: user?.id ?? null });
    bookingId = created.bookingId;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not create booking.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const seatWord = check.seatsToChargeNow === 1 ? 'seat' : 'seats';

  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: input.hostEmail,
      line_items: [
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
      ],
      success_url: `${siteUrl()}/booking/${bookingId}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/book/${input.gameSlug}?cancelled=1`,
      metadata: {
        rte_booking_id: bookingId,
        rte_kind: 'host_checkout',
        rte_seats_paid: String(check.seatsToChargeNow),
      },
    });

    await adminClient().from('rte_payments').insert({
      booking_id: bookingId,
      stripe_checkout_session_id: session.id,
      amount_cents: check.amountCents,
      status: 'pending',
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Stripe rejected the request.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
