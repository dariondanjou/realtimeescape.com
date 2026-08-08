import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'What a RealTimeEscape game actually is, what you need, and what happens from booking to debrief.',
};

export default function HowItWorks() {
  return (
    <section className="section">
      <div className="wrap narrow">
        <span className="eyebrow eyebrow-dim">How it works</span>
        <h1 style={{ fontSize: 38, margin: '14px 0 14px' }}>An escape room that ships to you</h1>
        <p className="lede">
          Everyone in your group opens a link. You all end up inside the same 3D spacecraft, each
          with your own view of it, able to talk to each other. Sixty minutes later you have either
          flown it home or you have not.
        </p>

        <Block title="It is a real game, not a video call">
          You move through the ship yourself. You can walk into a compartment nobody else is in,
          pick something up, and describe it to people who cannot see it. Your teammates appear as
          avatars in the world and you can watch them work. There is no shared screen and no host
          pointing a webcam at things for you.
        </Block>

        <Block title="Nobody has all the information — on purpose">
          Clues are split across people and places. In Burn Window the cockpit can read the
          instruments but cannot reach the thrusters; the people at the thrusters can work the
          controls but cannot see what to set them to. The only thing connecting them is your
          voices. That is the game.
        </Block>

        <Block title="No employee runs your session">
          The room opens itself, tracks every puzzle, notices when you are stuck, gives you a hint
          in the ship&rsquo;s own voice, decides whether you made it and emails you the results.
          There is no game master watching. That is why you can play at 2am on a Tuesday and why
          your whole group can be in different cities.
        </Block>

        <Block title="Paying for it">
          $20 a player. Either you pay for everyone and send them a link, or you pay for your own
          seat and each friend gets a private link to pay for theirs. Payment goes through Stripe
          — we never see a card number.
        </Block>

        <h2 style={{ fontSize: 24, margin: '48px 0 16px' }}>What you need</h2>
        <div className="panel">
          <dl>
            <div className="kv"><dt>Device</dt><dd>Computer or phone — touch controls on mobile</dd></div>
            <div className="kv"><dt>Browser</dt><dd>Chrome or Edge, up to date. Safari mostly works.</dd></div>
            <div className="kv"><dt>Graphics</dt><dd>Anything from the last ~6 years, including built-in Intel graphics</dd></div>
            <div className="kv"><dt>Microphone</dt><dd>Required. Headphones strongly recommended.</dd></div>
            <div className="kv"><dt>Internet</dt><dd>Ordinary broadband. No download.</dd></div>
            <div className="kv"><dt>People</dt><dd>3 to 8, best with 4 to 6</dd></div>
          </dl>
        </div>
        <p className="small" style={{ marginTop: 14 }}>
          Not sure? The lobby runs every one of these checks on your actual machine before the game
          starts, and tells you plainly if something will not work.
        </p>

        <div className="cta-row" style={{ marginTop: 36 }}>
          <Link href="/book/burn-window" className="btn btn-primary">Book Burn Window</Link>
          <Link href="/demo" className="btn btn-ghost">Try the ending first</Link>
        </div>
      </div>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 34 }}>
      <h2 style={{ fontSize: 22, marginBottom: 10 }}>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
