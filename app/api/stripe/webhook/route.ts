import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe, stripeConfigured } from '@/lib/stripe';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook. This — not the browser redirect — is what provisions paid access.
 *
 * Two properties matter more than anything else here:
 *   1. The signature is verified before a single byte of the payload is trusted.
 *   2. Fulfillment is idempotent. Stripe retries; a replayed event must not double-provision.
 */
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not set' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'bad signature';
    return NextResponse.json({ error: `Signature verification failed: ${message}` }, { status: 400 });
  }

  const db = adminClient();

  // Idempotency gate. Insert wins the race; a duplicate insert means we already handled it.
  const { error: dupeErr } = await db
    .from('rte_stripe_events')
    .insert({ event_id: event.id, type: event.type });
  if (dupeErr) {
    // Unique violation => already processed. Acknowledge so Stripe stops retrying.
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== 'paid') break;
        await fulfil(db, session, event.id);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        await db
          .from('rte_payments')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('stripe_checkout_session_id', session.id);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent) {
          await db
            .from('rte_payments')
            .update({ status: 'refunded', updated_at: new Date().toISOString() })
            .eq('stripe_payment_intent_id', String(charge.payment_intent));
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    // Report failure so Stripe retries, and drop the idempotency row so the retry can run.
    await db.from('rte_stripe_events').delete().eq('event_id', event.id);
    const message = e instanceof Error ? e.message : 'fulfilment failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

type Db = ReturnType<typeof adminClient>;

async function fulfil(db: Db, session: Stripe.Checkout.Session, eventId: string) {
  const bookingId = session.metadata?.rte_booking_id;
  if (!bookingId) return;

  const seatsPaid = Number(session.metadata?.rte_seats_paid ?? '1');
  const claimSeatId = session.metadata?.rte_seat_id ?? null;
  const paidEmail =
    session.customer_details?.email ?? session.customer_email ?? null;
  const now = new Date().toISOString();

  await db
    .from('rte_payments')
    .update({
      status: 'paid',
      stripe_payment_intent_id:
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
      raw_event_id: eventId,
      updated_at: now,
    })
    .eq('stripe_checkout_session_id', session.id);

  if (claimSeatId) {
    // An invited guest paid for their own seat.
    await db
      .from('rte_booking_seats')
      .update({ paid: true, paid_at: now, amount_cents: session.amount_total ?? null, claimed_email: paidEmail })
      .eq('id', claimSeatId);

    await db
      .from('rte_invitations')
      .update({ state: 'claimed', claimed_at: now })
      .eq('seat_id', claimSeatId);
  } else {
    // The host paid — mark the first `seatsPaid` seats paid, lowest index first.
    const { data: seats } = await db
      .from('rte_booking_seats')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('paid', false)
      .order('seat_index')
      .limit(seatsPaid);

    if (seats?.length) {
      await db
        .from('rte_booking_seats')
        .update({ paid: true, paid_at: now, amount_cents: session.amount_total ? Math.round(session.amount_total / seats.length) : null })
        .in('id', seats.map((s) => s.id));
    }
  }

  // Confirm the booking once every seat is paid; otherwise it is awaiting the rest of the group.
  const { data: allSeats } = await db
    .from('rte_booking_seats')
    .select('paid')
    .eq('booking_id', bookingId);

  const everyonePaid = Boolean(allSeats?.length) && allSeats!.every((s) => s.paid);

  await db
    .from('rte_bookings')
    .update({ status: everyonePaid ? 'confirmed' : 'awaiting_seats', updated_at: now })
    .eq('id', bookingId);

  // A confirmed booking gets its game session shell so the lobby has something to open.
  if (everyonePaid) {
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
  }
}

function cryptoSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
