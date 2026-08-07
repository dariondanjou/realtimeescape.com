import Link from 'next/link';
import type { Metadata } from 'next';
import ReportForm from './ReportForm';

export const metadata: Metadata = {
  title: 'Report a problem',
  description: 'Tell us something went wrong in your session. We check it against the session record.',
};

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;

  return (
    <section className="section">
      <div className="wrap narrow">
        <span className="eyebrow eyebrow-dim">Support</span>
        <h1 style={{ fontSize: 34, margin: '14px 0 12px' }}>Something went wrong</h1>
        <p className="lede" style={{ marginBottom: 30 }}>
          Tell us what happened. We check it against the actual recording of your session, not just
          against your description — which means a real defect gets taken seriously without you
          having to argue for it.
        </p>

        <ReportForm sessionId={session ?? ''} />

        <div className="panel" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>How this gets decided</h2>
          <div className="stack">
            <div>
              <strong className="small">Major — the experience was significantly compromised</strong>
              <p className="small" style={{ marginTop: 4 }}>
                You could not finish, a puzzle became unsolvable, the server failed, or a defect cost
                you enough of the clock to change the outcome. Everyone in the session gets credit
                equal to what they paid.
              </p>
            </div>
            <div>
              <strong className="small">Moderate — a real disruption, but the game held together</strong>
              <p className="small" style={{ marginTop: 4 }}>
                Where we can, we compensate during the game itself — freezing the clock or adding
                back time a fault consumed. Where we could not, partial credit after the fact.
              </p>
            </div>
            <div>
              <strong className="small">Minor — a rough edge</strong>
              <p className="small" style={{ marginTop: 4 }}>
                A cosmetic glitch or brief hitch. We log it against the exact moment it happened and
                fix it. It does not carry credit, and we would rather say that plainly than pretend
                otherwise.
              </p>
            </div>
          </div>
          <p className="small" style={{ marginTop: 16 }}>
            Every major determination is made by a person, not automatically. Full detail in the{' '}
            <Link href="/legal/terms" style={{ color: 'var(--accent-bright)' }}>terms</Link>.
          </p>
        </div>

        <div className="notice notice-warn" style={{ marginTop: 20 }}>
          <strong>All sales are final.</strong> Qualifying issues are resolved with account credit,
          which you can spend on a replay or any other game. We do not return money.
        </div>
      </div>
    </section>
  );
}
