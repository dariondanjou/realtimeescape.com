import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms' };

export default function Terms() {
  return (
    <section className="section">
      <div className="wrap narrow">
        <span className="eyebrow eyebrow-dim">Legal</span>
        <h1 style={{ fontSize: 34, margin: '14px 0 8px' }}>Terms of service</h1>
        <p className="small" style={{ marginBottom: 34 }}>Last updated 7 August 2026.</p>

        <S t="What you are buying">
          A seat in a private, scheduled or instant online game session. A seat entitles one person
          to one playthrough of the booked game. Seats are tied to a booking, not to a person, until
          they are claimed.
        </S>

        <S t="Refunds and reschedules">
          Cancel a scheduled game more than 24 hours before it starts for a full refund. Inside 24
          hours we will reschedule you once at no charge. If our platform causes a failure that
          makes your session unplayable, the system issues you a replay credit automatically — you
          do not have to ask anyone.
        </S>

        <S t="What we require of you">
          Do not attempt to break, reverse-engineer or interfere with the game server or another
          player&rsquo;s session. Do not resell seats. Be decent to the people you are playing with;
          team voice is between you and your own group, and we are not moderating it.
        </S>

        <S t="What we do not promise">
          We do not promise the game will run on every computer ever made. The requirements page and
          the lobby checks tell you the truth about your machine before you play — please use them.
          We do not promise your group will escape.
        </S>

        <S t="Age">
          You must be 13 or older to play and 18 or older to purchase. Burn Window contains
          suspense and a brief non-graphic scene involving deceased characters.
        </S>

        <S t="Changes">
          We may update games, including puzzles and difficulty, between sessions. Your result
          records the exact room version you played, so what happened to you stays reproducible.
        </S>

        <S t="Contact">support@realtimeescape.com</S>
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
