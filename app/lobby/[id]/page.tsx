import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadBooking } from '@/lib/bookings';
import ReadinessChecks from './ReadinessChecks';
import RecordingConsent from './RecordingConsent';

export const metadata: Metadata = { title: 'Lobby', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function LobbyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const data = await loadBooking(id);
  if (!data) notFound();

  const { booking, seats } = data;
  const paidSeats = seats.filter((s) => s.paid).length;
  const allPaid = paidSeats === seats.length && seats.length > 0;

  const opensAt = booking.scheduled_for
    ? new Date(new Date(booking.scheduled_for).getTime() - 15 * 60_000)
    : null;

  return (
    <section className="section">
      <div className="wrap">
        <span className="eyebrow">{allPaid ? 'Lobby open' : 'Lobby locked'}</span>
        <h1 style={{ fontSize: 34, margin: '12px 0 8px' }}>
          {(booking.rte_games as { title?: string } | null)?.title ?? 'Burn Window'}
        </h1>
        <p className="lede">
          {allPaid
            ? 'Run the checks below while you wait for the rest of your group. The room starts itself when everyone is ready.'
            : `${paidSeats} of ${seats.length} seats are paid. The lobby unlocks when the group is complete.`}
        </p>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 40, marginTop: 40 }}>
          <div>
            <h2 style={{ fontSize: 20, marginBottom: 14 }}>Before you fly</h2>
            <ReadinessChecks enabled={allPaid} />

            <h2 style={{ fontSize: 20, margin: '34px 0 14px' }}>Recording</h2>
            <RecordingConsent sessionId={booking.id} />
          </div>

          <aside>
            <div className="panel">
              <h3 style={{ fontSize: 17, marginBottom: 14 }}>Your group</h3>
              <div className="stack" style={{ marginTop: 4 }}>
                {seats.map((s) => (
                  <div key={s.id} className="spread" style={{ fontSize: 14 }}>
                    <span>
                      Seat {s.seat_index + 1}
                      <span className="tiny"> · {s.claimed_email ?? 'unclaimed'}</span>
                    </span>
                    <span className={`badge ${s.paid ? 'badge-live' : ''}`}>{s.paid ? 'ready' : 'pending'}</span>
                  </div>
                ))}
              </div>

              {opensAt && (
                <>
                  <hr className="rule" style={{ margin: '18px 0' }} />
                  <div className="kv"><dt>Lobby opens</dt><dd>{opensAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
                  <div className="kv"><dt>Game starts</dt><dd>{new Date(booking.scheduled_for!).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
                </>
              )}

              <Link href={`/booking/${booking.id}`} className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 18 }}>
                Back to the booking
              </Link>
            </div>

            <div className="panel" style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>Nobody is watching</h3>
              <p className="small">
                No employee joins your session. If something breaks badly enough that the game
                cannot continue, the system detects it and issues you a replay credit
                automatically — you never have to find a human.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
