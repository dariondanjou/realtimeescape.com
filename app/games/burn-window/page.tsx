import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getGame, formatPrice } from '@/lib/catalog';

const game = getGame('burn-window');

export const metadata: Metadata = {
  title: 'Burn Window',
  description:
    'A 60-minute real-time multiplayer escape room for 3–8 players. Your flight is off course, ' +
    'the crew is dead, and the maneuver window closes in an hour.',
};

export default function BurnWindowPage() {
  if (!game) notFound();

  return (
    <>
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="wrap hero-inner" style={{ paddingTop: 80, paddingBottom: 70 }}>
          <span className="eyebrow">{game.operator} · Flight AO-114 · {game.ship}</span>
          <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4.2rem)' }}>Burn Window</h1>
          <p className="lede" style={{ maxWidth: 640 }}>
            You booked a sightseeing flight. You wake in a dark cabin with Earth in the wrong part
            of the window, a crew that is not answering, and sixty minutes before the last
            trajectory that gets you home closes for good.
          </p>
          <div className="cta-row">
            <Link href="/book/burn-window" className="btn btn-primary btn-lg">
              Book — {formatPrice(game.pricePerSeatCents)} per player
            </Link>
            <Link href="/requirements" className="btn btn-ghost btn-lg">Can my computer run it?</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 48 }}>
            <div>
              <span className="eyebrow eyebrow-dim">The situation</span>
              <div className="stack" style={{ marginTop: 18 }}>
                <p>
                  Anterra Orbital sedates passengers through the ascent burn. Their brochure calls it
                  &ldquo;sleep through the hard part.&rdquo; You are supposed to wake up in a stable
                  orbit with a nine-metre window full of Earth.
                </p>
                <p>
                  You wake up to emergency lighting, a cabin intercom that will not answer, and a
                  service voice that keeps trying to offer you a beverage while it tells you the ship
                  is not where it should be.
                </p>
                <p>
                  Getting out of the passenger lounge is the easy part. Reaching the flight deck
                  takes longer, and what you find there changes the job from <em>get out</em> to
                  <em> fly it home</em>.
                </p>
                <p>
                  The correction cannot be flown automatically. It has to be done by hand, at
                  thruster stations scattered through the ship, at the same moment, by people who
                  cannot see each other and cannot see the same instruments. One of you will read
                  the numbers. The rest of you will set them.
                </p>
              </div>

              <hr className="rule" style={{ margin: '40px 0' }} />

              <span className="eyebrow eyebrow-dim">How the hour goes</span>
              <div className="stack" style={{ marginTop: 18 }}>
                <Act n="Act I" time="0:00 – 0:12" title="Wake">
                  Get out of your restraints, get power back, and get out of the lounge. The room
                  teaches you how to play while you think you are just escaping a room.
                </Act>
                <Act n="Act II" time="0:12 – 0:28" title="Into the ship">
                  Work down the service corridor to the flight deck. You will learn who the crew
                  were before you find out what happened to them.
                </Act>
                <Act n="Act III" time="0:28 – 0:45" title="Diagnose">
                  Find out which thrusters still work, get propellant to them, and split the team up
                  — permanently — across the ship.
                </Act>
                <Act n="Act IV" time="0:45 – 1:00" title="The burn">
                  Separated, on voice, against the clock. The cockpit has the answer. The stations
                  have the hands. Neither can do it alone.
                </Act>
              </div>
            </div>

            <aside>
              <div className="panel" style={{ position: 'sticky', top: 84 }}>
                <dl>
                  <div className="kv"><dt>Duration</dt><dd>60 minutes</dd></div>
                  <div className="kv"><dt>Players</dt><dd>{game.minPlayers}–{game.maxPlayers}</dd></div>
                  <div className="kv"><dt>Best with</dt><dd>{game.recommended}</dd></div>
                  <div className="kv"><dt>Difficulty</dt><dd>{game.difficulty}</dd></div>
                  <div className="kv"><dt>Price</dt><dd>{formatPrice(game.pricePerSeatCents)} / player</dd></div>
                  <div className="kv"><dt>Device</dt><dd>Desktop or laptop</dd></div>
                  <div className="kv"><dt>Voice</dt><dd>Built in</dd></div>
                  <div className="kv"><dt>Download</dt><dd>None</dd></div>
                </dl>
                <Link href="/book/burn-window" className="btn btn-primary btn-block" style={{ marginTop: 20 }}>
                  Book this game
                </Link>
                <p className="tiny" style={{ marginTop: 14 }}>
                  Private to your group. Nobody is matched with strangers.
                </p>
              </div>

              <div className="panel" style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)' }}>
                  Content notes
                </h4>
                <p className="small" style={{ marginTop: 10 }}>{game.intensity}</p>
                <p className="small" style={{ marginTop: 10 }}>
                  There is one scene involving the deceased crew. It is lit plainly and lasts about
                  twenty-five seconds. Nothing in the game is gory.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap narrow center">
          <h2 style={{ fontSize: 28 }}>Get your group in the room</h2>
          <p className="lede" style={{ margin: '12px 0 24px' }}>
            Start now, or pick a time. Pay for everyone or send them a link to pay for themselves.
          </p>
          <Link href="/book/burn-window" className="btn btn-primary btn-lg">Book Burn Window</Link>
        </div>
      </section>
    </>
  );
}

function Act({ n, time, title, children }: { n: string; time: string; title: string; children: React.ReactNode }) {
  return (
    <div className="panel panel-accent">
      <div className="spread">
        <span className="eyebrow">{n} · {title}</span>
        <span className="tiny mono">{time}</span>
      </div>
      <p className="small" style={{ marginTop: 10 }}>{children}</p>
    </div>
  );
}
