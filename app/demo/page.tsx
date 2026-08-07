import Link from 'next/link';
import type { Metadata } from 'next';
import BurnDemo from './BurnDemo';

export const metadata: Metadata = {
  title: 'Try the final maneuver',
  description:
    'A playable slice of Burn Window: the synchronized manual thruster burn that ends the game, ' +
    'validated by the same code the real game server runs.',
};

export default function DemoPage() {
  return (
    <section className="section">
      <div className="wrap">
        <span className="eyebrow">Playable slice</span>
        <h1 style={{ fontSize: 38, margin: '14px 0 12px' }}>The last five minutes</h1>
        <p className="lede" style={{ maxWidth: 700 }}>
          This is the ending of Burn Window, lifted out of the ship and flattened onto one screen.
          The validation running underneath is the exact same module the game server uses — same
          tolerances, same generator, same verdict.
        </p>

        <div style={{ marginTop: 40 }}>
          <BurnDemo />
        </div>

        <div className="panel" style={{ marginTop: 44 }}>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>What this demo cannot show you</h2>
          <div className="grid grid-3" style={{ marginTop: 18 }}>
            <div>
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>The separation</h3>
              <p className="small">
                In the real room those three panels are in three compartments you cannot see into
                from the flight deck. Getting a number from your screen to someone else&rsquo;s
                hands means saying it out loud, correctly, once.
              </p>
            </div>
            <div>
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>The clock</h3>
              <p className="small">
                You have already spent forty-five minutes getting to this point, you have watched
                the window countdown the whole time, and a failed attempt takes ninety seconds you
                do not have.
              </p>
            </div>
            <div>
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>The other fifty-five minutes</h3>
              <p className="small">
                Waking up in the dark. Getting out of the lounge. Reading the crew&rsquo;s
                messages before you find them. Deciding, out loud, who is going where.
              </p>
            </div>
          </div>
          <div className="cta-row">
            <Link href="/book/burn-window" className="btn btn-primary">Book the whole thing</Link>
            <Link href="/games/burn-window" className="btn btn-ghost">Read the briefing</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
