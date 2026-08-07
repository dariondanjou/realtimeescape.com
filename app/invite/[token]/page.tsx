import type { Metadata } from 'next';
import { adminClient } from '@/lib/supabase';
import { formatPrice } from '@/lib/catalog';
import ClaimButton from './ClaimButton';

export const metadata: Metadata = { title: 'Your invitation', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = adminClient();

  const { data: invite } = await db
    .from('rte_invitations')
    .select('id, token, state, expires_at, booking_id, seat_id')
    .eq('token', token)
    .maybeSingle();

  if (!invite) return <Message title="This invitation could not be found." body="Double-check the link, or ask whoever invited you to send it again." />;

  const expired = new Date(invite.expires_at).getTime() < Date.now();
  if (invite.state === 'revoked') return <Message title="This invitation was withdrawn." body="Ask the person who organised the game for a new link." />;
  if (expired && invite.state !== 'claimed') return <Message title="This invitation has expired." body="Invitations expire when the game starts. Ask the organiser to reissue yours." />;

  const { data: booking } = await db
    .from('rte_bookings')
    .select('id, seat_count, price_cents, kind, scheduled_for, host_email, rte_games(title)')
    .eq('id', invite.booking_id)
    .single();

  const { data: seat } = await db
    .from('rte_booking_seats')
    .select('id, seat_index, paid')
    .eq('id', invite.seat_id!)
    .maybeSingle();

  if (!booking || !seat) return <Message title="This booking is no longer available." body="It may have been cancelled." />;

  const title = (booking.rte_games as { title?: string } | null)?.title ?? 'Burn Window';
  const when = booking.scheduled_for
    ? new Date(booking.scheduled_for).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })
    : 'As soon as the group is ready';

  if (seat.paid) {
    return (
      <Message
        title="Your seat is confirmed."
        body={`You are in seat ${seat.seat_index + 1} for ${title}. We will email you when the lobby opens.`}
        ok
      />
    );
  }

  return (
    <section className="section">
      <div className="wrap narrow">
        <span className="eyebrow">You have been invited</span>
        <h1 style={{ fontSize: 36, margin: '14px 0 10px' }}>{title}</h1>
        <p className="lede">
          {booking.host_email} has reserved you a seat. Claim it by paying for your own place.
        </p>

        <div className="panel" style={{ marginTop: 30 }}>
          <dl>
            <div className="kv"><dt>Game</dt><dd>{title}</dd></div>
            <div className="kv"><dt>When</dt><dd>{when}</dd></div>
            <div className="kv"><dt>Your seat</dt><dd>Seat {seat.seat_index + 1} of {booking.seat_count}</dd></div>
            <div className="kv"><dt>Your share</dt><dd>{formatPrice(booking.price_cents)}</dd></div>
          </dl>

          <ClaimButton token={token} amount={formatPrice(booking.price_cents)} />

          <p className="tiny" style={{ marginTop: 14 }}>
            Payment is handled by Stripe. We never see your card details.
          </p>
        </div>

        <div className="panel" style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: 17, marginBottom: 10 }}>What you need</h3>
          <ul className="small" style={{ paddingLeft: 18, display: 'grid', gap: 7 }}>
            <li>A desktop or laptop computer — not a phone.</li>
            <li>Chrome or Edge, up to date.</li>
            <li>A microphone. The last fifteen minutes of this game are unwinnable without one.</li>
            <li>Headphones, ideally, so you do not echo into everyone else&rsquo;s audio.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Message({ title, body, ok = false }: { title: string; body: string; ok?: boolean }) {
  return (
    <section className="section">
      <div className="wrap narrow">
        <div className={`panel ${ok ? '' : 'panel-accent'}`}>
          <h1 style={{ fontSize: 26, marginBottom: 10 }}>{title}</h1>
          <p className="small">{body}</p>
        </div>
      </div>
    </section>
  );
}
