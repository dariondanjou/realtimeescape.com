import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadBooking } from '@/lib/bookings';
import { siteUrl } from '@/lib/stripe';
import { formatPrice } from '@/lib/catalog';
import CopyField from './CopyField';

export const metadata: Metadata = { title: 'Your booking', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function BookingPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  const { paid } = await searchParams;

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const data = await loadBooking(id);
  if (!data) notFound();

  const { booking, seats, invites } = data;
  const paidSeats = seats.filter((s) => s.paid).length;
  const allPaid = paidSeats === seats.length;
  const inviteFor = (seatId: string) => invites.find((i) => i.seat_id === seatId);

  const when = booking.scheduled_for
    ? new Date(booking.scheduled_for).toLocaleString(undefined, {
        dateStyle: 'full', timeStyle: 'short',
      })
    : 'As soon as your group is ready';

  return (
    <section className="section">
      <div className="wrap narrow">
        {paid === '1' && (
          <div className="notice notice-ok" style={{ marginBottom: 26 }}>
            Payment received. {allPaid
              ? 'Every seat is paid — your group is ready to play.'
              : 'Now send the invite links below so the rest of your group can claim their seats.'}
          </div>
        )}

        <span className="eyebrow eyebrow-dim">Booking {booking.id.slice(0, 8)}</span>
        <h1 style={{ fontSize: 34, margin: '12px 0 6px' }}>
          {(booking.rte_games as { title?: string } | null)?.title ?? 'Burn Window'}
        </h1>
        <p className="lede">{when}</p>

        <div className="panel" style={{ marginTop: 28 }}>
          <dl>
            <div className="kv"><dt>Status</dt><dd>{statusLabel(booking.status, allPaid)}</dd></div>
            <div className="kv"><dt>Seats</dt><dd>{paidSeats} of {booking.seat_count} paid</dd></div>
            <div className="kv"><dt>Payment</dt><dd>{booking.payment_mode === 'split' ? 'Each player pays their own' : 'Host paid for everyone'}</dd></div>
            <div className="kv"><dt>Per seat</dt><dd>{formatPrice(booking.price_cents)}</dd></div>
            <div className="kv"><dt>Host</dt><dd>{booking.host_email}</dd></div>
          </dl>
        </div>

        <h2 style={{ fontSize: 22, margin: '40px 0 8px' }}>Seats</h2>
        <p className="small" style={{ marginBottom: 18 }}>
          {booking.payment_mode === 'split'
            ? 'Send each unclaimed link to one person. Each link is private and can only be used once.'
            : 'Every seat is already paid. Send the join link to anyone in your group.'}
        </p>

        <div className="stack">
          {seats.map((seat) => {
            const invite = inviteFor(seat.id);
            const url = seat.seat_index === 0
              ? `${siteUrl()}/booking/${booking.id}`
              : invite
                ? `${siteUrl()}/invite/${invite.token}`
                : null;

            return (
              <div key={seat.id} className="panel" style={{ padding: 18 }}>
                <div className="spread" style={{ marginBottom: url ? 12 : 0 }}>
                  <div>
                    <strong>Seat {seat.seat_index + 1}</strong>
                    {seat.seat_index === 0 && <span className="tiny"> · you</span>}
                    <div className="tiny">{seat.claimed_email ?? 'Unclaimed'}</div>
                  </div>
                  <span className={`badge ${seat.paid ? 'badge-live' : ''}`}>
                    {seat.paid ? 'Paid' : 'Awaiting payment'}
                  </span>
                </div>
                {url && seat.seat_index > 0 && !seat.paid && <CopyField value={url} />}
              </div>
            );
          })}
        </div>

        <div className="panel" style={{ marginTop: 34 }}>
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>When it is time to play</h3>
          <p className="small" style={{ marginBottom: 16 }}>
            {allPaid
              ? 'Your lobby is ready. Everyone opens the same link — pick an avatar, test your microphone, and the room starts itself.'
              : 'The lobby unlocks once every seat is paid.'}
          </p>
          <Link
            href={`/lobby/${booking.id}`}
            className={`btn ${allPaid ? 'btn-primary' : 'btn-ghost'}`}
            aria-disabled={!allPaid}
          >
            {allPaid ? 'Open the lobby' : 'Lobby locked'}
          </Link>
        </div>

        <p className="tiny" style={{ marginTop: 28 }}>
          Bookmark this page — it is how you get back to your booking. We also emailed it to{' '}
          {booking.host_email}.
        </p>
      </div>
    </section>
  );
}

function statusLabel(status: string, allPaid: boolean) {
  if (allPaid) return 'Confirmed';
  switch (status) {
    case 'awaiting_seats': return 'Waiting on your group';
    case 'created': return 'Awaiting payment';
    case 'cancelled': return 'Cancelled';
    case 'completed': return 'Played';
    default: return status;
  }
}
