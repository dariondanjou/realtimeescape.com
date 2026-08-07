import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Common problems and how to fix them, plus how to reach a human when you need one.',
};

export default function Support() {
  return (
    <section className="section">
      <div className="wrap narrow">
        <span className="eyebrow eyebrow-dim">Support</span>
        <h1 style={{ fontSize: 34, margin: '14px 0 12px' }}>Something went wrong</h1>
        <p className="lede" style={{ marginBottom: 34 }}>
          Games run without a host, which means most problems have a fix you can apply yourself
          right now. Start here.
        </p>

        <Q q="Somebody's link does not work">
          Invite links are single-use and expire when the game starts. If a link has been claimed
          or has expired, the host can reissue it from the booking page.
        </Q>

        <Q q="I got disconnected mid-game">
          Reopen the same link. Your seat is held for two minutes and you come back to exactly the
          state the ship is in. The team clock does not stop for you — sorry, that is the game.
        </Q>

        <Q q="Nobody can hear me">
          Check that your browser has microphone permission for this site, and that the right input
          device is selected in your operating system&rsquo;s sound settings. The lobby has a
          microphone meter — if the bar moves when you talk, we can hear you.
        </Q>

        <Q q="The game is running slowly">
          Close other tabs, especially anything playing video. Run the check on the{' '}
          <Link href="/requirements" style={{ color: 'var(--accent-bright)' }}>requirements page</Link>{' '}
          to see what your machine is actually managing. The game drops its own quality tier
          automatically, but it cannot fix a laptop on battery-saver mode.
        </Q>

        <Q q="Our session broke and we could not finish">
          If our platform caused it, the system detects it and issues a replay credit to the host
          automatically — check your email and your booking page. If it did not, email us.
        </Q>

        <Q q="I need a refund">
          More than 24 hours before a scheduled game, cancel from your booking page for a full
          refund. Inside 24 hours, email us and we will reschedule you once at no charge.
        </Q>

        <div className="panel" style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Reach a person</h2>
          <p className="small" style={{ marginBottom: 14 }}>
            We answer email within one business day. Include your booking ID — it is in the URL of
            your booking page and in your confirmation email.
          </p>
          <a href="mailto:support@realtimeescape.com" className="btn btn-primary btn-sm">
            support@realtimeescape.com
          </a>
        </div>
      </div>
    </section>
  );
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="panel panel-accent" style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 17, marginBottom: 8 }}>{q}</h2>
      <p className="small">{children}</p>
    </div>
  );
}
