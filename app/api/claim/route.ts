import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { stripe, stripeConfigured, siteUrl } from '@/lib/stripe';
import { getGame } from '@/lib/catalog';

export const runtime = 'nodejs';

/** An invited guest claims and pays for their own seat. */
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 });
  }

  let body: { token?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const token = String(body.token ?? '');
  const email = String(body.email ?? '').trim().toLowerCase();

  if (!token) return NextResponse.json({ error: 'Missing invitation.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const db = adminClient();

  const { data: invite } = await db
    .from('rte_invitations')
    .select('id, state, expires_at, booking_id, seat_id')
    .eq('token', token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: 'This invitation is not valid.' }, { status: 404 });
  if (invite.state === 'revoked') return NextResponse.json({ error: 'This invitation was withdrawn.' }, { status: 410 });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This invitation has expired.' }, { status: 410 });
  }

  const { data: seat } = await db
    .from('rte_booking_seats')
    .select('id, seat_index, paid')
    .eq('id', invite.seat_id!)
    .maybeSingle();

  if (!seat) return NextResponse.json({ error: 'That seat no longer exists.' }, { status: 404 });
  if (seat.paid) return NextResponse.json({ error: 'This seat has already been paid for.' }, { status: 409 });

  const { data: booking } = await db
    .from('rte_bookings')
    .select('id, price_cents, rte_games(slug, title)')
    .eq('id', invite.booking_id)
    .single();
  if (!booking) return NextResponse.json({ error: 'That booking no longer exists.' }, { status: 404 });

  const gameRow = booking.rte_games as { slug?: string; title?: string } | null;
  const game = getGame(gameRow?.slug ?? 'burn-window');
  // Price comes from the booking row, not from the request — the client cannot set its own price.
  const unitAmount = booking.price_cents;

  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: {
              name: `${game?.title ?? gameRow?.title ?? 'Burn Window'} — 1 player seat`,
              description: `Seat ${seat.seat_index + 1} · private session`,
            },
          },
        },
      ],
      success_url: `${siteUrl()}/invite/${token}?paid=1`,
      cancel_url: `${siteUrl()}/invite/${token}?cancelled=1`,
      metadata: {
        rte_booking_id: booking.id,
        rte_seat_id: seat.id,
        rte_kind: 'seat_claim',
        rte_seats_paid: '1',
      },
    });

    await db.from('rte_payments').insert({
      booking_id: booking.id,
      seat_id: seat.id,
      stripe_checkout_session_id: session.id,
      amount_cents: unitAmount,
      status: 'pending',
    });

    await db.from('rte_invitations').update({ state: 'viewed' }).eq('id', invite.id);

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Stripe rejected the request.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
