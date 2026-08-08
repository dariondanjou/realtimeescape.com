import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadBooking } from '@/lib/bookings';
import ReadinessChecks from './ReadinessChecks';
import RecordingConsent from './RecordingConsent';
import { gameClientAvailable } from '@/lib/demo';

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
  const canEnter = gameClientAvailable();

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

            <h2 style={{ fontSize: 20, margin: '34px 0 14px' }}>When everyone is ready</h2>
            {canEnter ? (
              <div className="panel">
                <p className="small" style={{ marginBottom: 16 }}>
                  Once every player has run their checks, the room opens itself and the sixty-minute
                  clock starts. You do not need to press anything at a particular moment — the last
                  person to mark ready starts it for the group.
                </p>
                <Link
                  href={`/play/${booking.id}`}
                  className={`btn ${allPaid ? 'btn-primary' : 'btn-ghost'}`}
                  aria-disabled={!allPaid}
                >
                  {allPaid ? 'Enter the ship' : 'Waiting on your group'}
                </Link>
              </div>
            ) : (
              /* Honest dead-end state. The 3D client and game server are not deployed, and a
                 start button that goes nowhere is worse than saying so. */
              <div className="panel panel-accent">
                <span className="badge">Not open yet</span>
                <h3 style={{ fontSize: 17, margin: '12px 0 10px' }}>
                  The ship is not accepting boarders yet
                </h3>
                <p className="small" style={{ marginBottom: 12 }}>
                  Everything up to this point is real — your booking, your seats, these checks. The
                  3D room itself is still in production, so there is nothing to enter from here yet.
                  We would rather tell you that than hand you a button that goes nowhere.
                </p>
                <p className="small" style={{ marginBottom: 16 }}>
                  The part that <em>is</em> finished is the ending: the synchronized manual burn that
                  closes the hour, running the same validation the real game server uses. It is worth
                  five minutes of your time.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link href="/demo" className="btn btn-primary btn-sm">Play the final manoeuvre</Link>
                  <Link href="/games/burn-window" className="btn btn-ghost btn-sm">Read the briefing</Link>
                </div>
              </div>
            )}
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
