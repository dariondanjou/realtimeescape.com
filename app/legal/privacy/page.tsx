import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy' };

export default function Privacy() {
  return (
    <section className="section">
      <div className="wrap narrow">
        <span className="eyebrow eyebrow-dim">Legal</span>
        <h1 style={{ fontSize: 34, margin: '14px 0 8px' }}>Privacy</h1>
        <p className="small" style={{ marginBottom: 34 }}>Last updated 7 August 2026.</p>

        <S t="What we collect">
          Your email address, your bookings and payments, your game results and the gameplay events
          the room records so it can decide what happened and show you a debrief. If you create an
          account we store a display name and your accessibility preferences.
        </S>

        <S t="Payments">
          Card payments are processed by Stripe. We never receive, handle or store card numbers. We
          keep Stripe&rsquo;s references to your payment so we can match it to your booking and
          issue refunds.
        </S>

        <S t="Voice">
          We do not record your microphone. Team voice is carried live between players and is not
          written to disk. If we ever build a product that includes recorded voice, it will be
          opt-in, obvious while it is happening, and off by default.
        </S>

        <S t="Gameplay telemetry">
          We log the events that make a game reconstructable: puzzles solved, hints requested, when
          the team split up, every burn attempted and its result. This drives your debrief and tells
          us which puzzles are badly designed. It is tied to your session, not sold to anybody.
        </S>

        <S t="Selfie avatars">
          Not implemented. If and when we add avatar generation from a photo, we will publish the
          retention and deletion policy before we accept the first image.
        </S>

        <S t="Who we share with">
          Our infrastructure providers, and nobody else: Stripe for payment, Supabase for the
          database and accounts, Vercel for hosting, and the voice provider for live audio
          transport. We do not sell personal data.
        </S>

        <S t="Your choices">
          You can ask us to delete your account and its data at any time by emailing
          support@realtimeescape.com. We will keep payment records where tax law requires it, and
          nothing else.
        </S>
      </div>
    </section>
  );
}

function S({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 19, marginBottom: 8 }}>{t}</h2>
      <p className="small">{children}</p>
    </div>
  );
}
