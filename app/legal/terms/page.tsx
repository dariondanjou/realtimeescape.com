import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'RealTimeEscape terms of service. All sales are final and non-refundable; qualifying issues are ' +
    'resolved with account credit.',
};

export default function Terms() {
  return (
    <section className="section">
      <div className="wrap narrow">
        <span className="eyebrow eyebrow-dim">Legal</span>
        <h1 style={{ fontSize: 34, margin: '14px 0 8px' }}>Terms of service</h1>
        <p className="small" style={{ marginBottom: 30 }}>Last updated 7 August 2026.</p>

        {/* The commercial term customers most need to understand, stated before anything else. */}
        <div className="panel" style={{ borderColor: 'var(--accent)', borderLeftWidth: 3, marginBottom: 34 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--accent-bright)' }}>
            All sales are final. We do not issue refunds.
          </h2>
          <p className="small" style={{ marginBottom: 12 }}>
            <strong>Every payment made to RealTimeEscape is non-refundable.</strong> This applies to
            every seat, every booking, every payment method and every circumstance — including a
            game that does not work properly.
          </p>
          <p className="small" style={{ marginBottom: 12 }}>
            If something goes wrong badly enough that the experience is significantly compromised,
            we make it right with <strong>account credit</strong>, not money back. Credit lets you
            play the game again once the problem is fixed, or spend it on any other game in our
            catalog, now or later.
          </p>
          <p className="small" style={{ marginBottom: 0 }}>
            <strong>Credit is never converted to cash, and money is never returned to your card.</strong>{' '}
            If that is not acceptable to you, please do not purchase. By completing checkout you are
            agreeing to this specific term.
          </p>
        </div>

        <S t="1. What you are buying, and why it works this way">
          <p style={{ marginBottom: 12 }}>
            You are buying a seat in a <strong>premium beta experience</strong>. RealTimeEscape runs
            real-time multiplayer 3D worlds inside an ordinary web browser, with live voice, an
            authoritative game server and an automated operator — and it does that at the frontier
            of what browser-based interactive entertainment can currently do.
          </p>
          <p style={{ marginBottom: 12 }}>
            Work of this kind, at this stage, sometimes has problems. A puzzle can behave in a way we
            did not anticipate. A connection can drop. A piece of audio can fail to play. We test
            hard and we fix fast, but we are not going to pretend to you that a product on this
            frontier is flawless, and we price and structure the offer honestly on that basis.
          </p>
          <p style={{ marginBottom: 0 }}>
            That is the trade. You get access to something genuinely new, earlier than you otherwise
            would, at $20 a seat. We get the freedom to build ambitiously without every rough edge
            becoming a chargeback. <strong>A no-refund policy is the term that makes that trade
            possible</strong>, and every remedy we offer sits inside it.
          </p>
        </S>

        <S t="2. What we do when something goes wrong">
          <p style={{ marginBottom: 12 }}>
            Our obligation to you is not a refund. It is to get you a working, enjoyable game.
          </p>
          <p style={{ marginBottom: 12 }}>
            Every session is recorded in detail (see{' '}
            <Link href="/legal/privacy" style={{ color: 'var(--accent-bright)' }}>Privacy</Link>{' '}
            and section 4 below). When you report a problem, we replay what actually happened in your
            session and assess how much it affected your experience. That assessment produces one of
            three outcomes:
          </p>

          <div className="stack" style={{ margin: '18px 0' }}>
            <div className="panel" style={{ padding: 16 }}>
              <div className="spread" style={{ marginBottom: 6 }}>
                <strong>Major issue</strong>
                <span className="badge badge-live">full credit</span>
              </div>
              <p className="small" style={{ margin: 0 }}>
                The experience was significantly compromised — you could not finish, a puzzle became
                unsolvable, the game server failed, or a defect cost you enough of the clock to
                change the outcome. Every player in the session receives credit equal to what they
                paid, usable on a replay or on any other game.
              </p>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <div className="spread" style={{ marginBottom: 6 }}>
                <strong>Moderate issue</strong>
                <span className="badge">in-game compensation, partial credit</span>
              </div>
              <p className="small" style={{ margin: 0 }}>
                Something disrupted you but the game remained winnable. Where we can, we compensate
                inside the session as it happens — freezing the clock while a problem is resolved, or
                adding back time a defect consumed. Where that was not possible, we may issue partial
                credit after the fact.
              </p>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <div className="spread" style={{ marginBottom: 6 }}>
                <strong>Minor issue</strong>
                <span className="badge">logged and fixed</span>
              </div>
              <p className="small" style={{ margin: 0 }}>
                A cosmetic glitch, a brief hitch, an audio line that did not fire. We are genuinely
                sorry, we log it against the exact moment it happened, and we fix it — but it does
                not carry credit. Small imperfections are part of what a premium beta is.
              </p>
            </div>
          </div>

          <p style={{ marginBottom: 0 }}>
            Report an issue from your debrief page or by emailing support within 7 days of the
            session. We aim to respond within one business day. Our determination of severity is
            final, but tell us if you think we got it wrong — we would rather look again than lose
            you.
          </p>
        </S>

        <S t="3. How credit works">
          <ul style={{ paddingLeft: 20, display: 'grid', gap: 8, margin: 0 }}>
            <li>Credit is issued in dollars and applies against the price of any seat.</li>
            <li>It can be spent on a replay of the same game or on any other game we release.</li>
            <li>It does not expire.</li>
            <li>It can be used to cover seats for other people in your group.</li>
            <li>
              <strong>It has no cash value, cannot be withdrawn, cannot be transferred to another
              account, and will never be paid out as money</strong> — including if you close your
              account.
            </li>
          </ul>
        </S>

        <S t="4. We record your sessions">
          <p style={{ marginBottom: 12 }}>
            To make section 2 work, we record what happens in your game: every puzzle interaction,
            every input, the full state of the ship, and — where you have consented — your team voice
            audio. This is what lets us prove what went wrong instead of guessing, fix it properly,
            and judge your report fairly rather than on vibes.
          </p>
          <p style={{ marginBottom: 12 }}>
            <strong>Voice recording is opt-in and is confirmed by every player before the game
            starts.</strong> You will always know when it is on, and you can decline it and still
            play. If you decline, we can still investigate an issue from your gameplay and input
            records — voice simply makes the picture more complete.
          </p>
          <p style={{ marginBottom: 0 }}>
            Recordings are used for troubleshooting, for assessing issue reports, and for improving
            the games. They are not sold, not used for marketing without separate explicit consent,
            and are deleted on the schedule described in our{' '}
            <Link href="/legal/privacy" style={{ color: 'var(--accent-bright)' }}>Privacy policy</Link>.
          </p>
        </S>

        <S t="5. Cancelling and rescheduling">
          <p style={{ marginBottom: 12 }}>
            You can reschedule a booked game to a different time at no charge, as often as you like,
            up until it starts. Rescheduling moves your seats; it does not refund them.
          </p>
          <p style={{ marginBottom: 0 }}>
            If you cancel outright, or simply do not show up, the payment is not returned. It stays
            on your account as credit and you can use it whenever you are ready.
          </p>
        </S>

        <S t="6. What we require of you">
          <p style={{ marginBottom: 12 }}>
            Do not attempt to break, reverse-engineer or interfere with the game server or another
            player&rsquo;s session. Do not resell seats. Do not use credit or issue reports
            dishonestly — reports we determine to be fraudulent forfeit the credit and may close your
            account.
          </p>
          <p style={{ marginBottom: 0 }}>
            Be decent to the people you are playing with. Team voice is between you and your own
            group, and we are not moderating it.
          </p>
        </S>

        <S t="7. What we do not promise">
          <p style={{ marginBottom: 12 }}>
            We do not promise the game will run on every computer ever made. The{' '}
            <Link href="/requirements" style={{ color: 'var(--accent-bright)' }}>requirements page</Link>{' '}
            and the lobby checks tell you the truth about your machine <em>before</em> you play —
            please use them. A machine that fails those checks and then performs badly is not a
            qualifying issue.
          </p>
          <p style={{ marginBottom: 0 }}>
            We do not promise your group will escape. That is rather the point.
          </p>
        </S>

        <S t="8. Age">
          You must be 13 or older to play and 18 or older to purchase. Burn Window contains suspense
          and a brief non-graphic scene involving deceased characters.
        </S>

        <S t="9. Changes">
          We may update games, including puzzles and difficulty, between sessions. Your result
          records the exact room version you played, so what happened to you stays reproducible. If
          we materially change these terms, the terms in force when you paid govern that purchase.
        </S>

        <S t="10. Contact">
          <a href="mailto:support@realtimeescape.com" style={{ color: 'var(--accent-bright)' }}>
            support@realtimeescape.com
          </a>
        </S>
      </div>
    </section>
  );
}

function S({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 30 }}>
      <h2 style={{ fontSize: 19, marginBottom: 10 }}>{t}</h2>
      <div className="small">{children}</div>
    </div>
  );
}
