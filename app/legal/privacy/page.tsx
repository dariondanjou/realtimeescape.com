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

        <S t="Session recording">
          Because we resolve qualifying problems with account credit rather than refunds, we need to
          be able to see what actually happened in a session. We record three things, each with its
          own setting, all shown to you in the lobby before the game starts:
          <ul style={{ paddingLeft: 20, marginTop: 10, display: 'grid', gap: 8 }}>
            <li>
              <strong>Gameplay and controls — always recorded.</strong> Puzzles solved, hints
              requested, when the team split up, every burn attempted, and which controls each
              player operated. It records <em>which</em> control you used, never what you typed.
            </li>
            <li>
              <strong>Images and video — recorded by default, with an opt-out.</strong> Session
              footage and the team image, which we may use publicly including on social media. You
              can switch this off in the lobby. Doing so also removes the visual record we would use
              to investigate a problem, which we tell you at the point of choosing.
            </li>
            <li>
              <strong>Team voice — off unless you opt in.</strong> We do not record your microphone
              unless every player in your group agrees. It is obvious in the HUD whenever it is
              active, and declining does not affect your ability to play or to report a problem.
            </li>
          </ul>
        </S>

        <S t="How long recordings are kept">
          Gameplay and input records are kept for 24 months so we can reproduce bugs and audit issue
          determinations. Voice recordings are deleted after 90 days. Images and video are kept for
          24 months, or indefinitely where a clip has been published with consent. You can ask us to
          delete any recording of your session at any time.
        </S>

        <S t="Feedback you send us">
          Written and spoken feedback is stored, grouped with similar feedback from other players
          into a single topic, and used to decide what we build and fix next. The collated topics
          are public on our roadmap; what you personally wrote or said is not. If you include your
          email we may reply to it; you can leave feedback anonymously.
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
