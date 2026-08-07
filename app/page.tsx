import Link from 'next/link';
import { GAMES, formatPrice } from '@/lib/catalog';
import { publicStats } from '@/lib/stats';
import { Ticker } from '@/components/Ticker';

const game = GAMES[0];

export const dynamic = 'force-dynamic';

export default async function Home() {
  const stats = await publicStats();

  return (
    <>
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="wrap hero-inner">
          <span className="eyebrow">First release · Burn Window</span>
          <h1>
            Your friends. One spacecraft.
            <br />
            Sixty minutes.
          </h1>
          <p className="lede">
            A real-time multiplayer escape room that runs in your browser. Everyone gets their own
            view of the same 3D world, everyone can talk, and nobody can see everything. No
            download, no host, no physical room to drive to.
          </p>
          <div className="cta-row">
            <Link href="/book/burn-window" className="btn btn-primary btn-lg">
              Book Burn Window — {formatPrice(game.pricePerSeatCents)}/player
            </Link>
            <Link href="/demo" className="btn btn-ghost btn-lg">
              Try the ending free
            </Link>
          </div>
          <p className="tiny" style={{ marginTop: 20 }}>
            3–8 players · 60 minutes · desktop or laptop browser · private group, always
          </p>

          <div style={{ maxWidth: 460, marginTop: 40 }}>
            <Ticker stats={stats} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <span className="eyebrow eyebrow-dim">What makes it different</span>
          <div className="grid grid-3" style={{ marginTop: 28 }}>
            <div className="panel panel-accent">
              <h3>Same world, different eyes</h3>
              <p className="small" style={{ marginTop: 10 }}>
                You are not sharing one screen on a video call. Each player moves independently
                through the same synchronized ship and sees the others as avatars inside it. One of
                you can be in the cockpit while another is three compartments away at a thruster.
              </p>
            </div>
            <div className="panel panel-accent">
              <h3>Talking is the mechanic</h3>
              <p className="small" style={{ marginTop: 10 }}>
                Clues are deliberately split across people and places. Nobody holds all the
                information. The ending cannot be reached by one clever player — it has to be
                talked through, out loud, under a clock.
              </p>
            </div>
            <div className="panel panel-accent">
              <h3>Nobody is watching you</h3>
              <p className="small" style={{ marginTop: 10 }}>
                No employee runs your session. The room starts itself, tracks every puzzle, gives
                hints when you stall, decides the ending and sends your results. Your booking is a
                link, not an appointment with a stranger.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap">
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '38px 34px' }}>
              <span className="badge badge-live">Now booking</span>
              <h2 style={{ fontSize: 34, margin: '16px 0 12px' }}>{game.title}</h2>
              <p className="lede" style={{ maxWidth: 640 }}>{game.premise}</p>

              <div className="grid grid-4" style={{ marginTop: 30, gap: 14 }}>
                <Stat label="Duration" value="60 minutes" />
                <Stat label="Players" value={`${game.minPlayers}–${game.maxPlayers}`} />
                <Stat label="Recommended" value={game.recommended} />
                <Stat label="Per player" value={formatPrice(game.pricePerSeatCents)} />
              </div>

              <div className="cta-row">
                <Link href="/book/burn-window" className="btn btn-primary">Book this game</Link>
                <Link href="/games/burn-window" className="btn btn-ghost">Full briefing</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <span className="eyebrow eyebrow-dim">How a game works</span>
          <div className="grid grid-4" style={{ marginTop: 28 }}>
            <Step n="01" title="Book">
              Pick a time or start immediately. Pay for everyone, or pay for your own seat and send
              the rest a link so they pay for theirs.
            </Step>
            <Step n="02" title="Gather">
              The lobby opens 15 minutes early. Pick an avatar, test your microphone and graphics,
              learn the controls, and wait for stragglers.
            </Step>
            <Step n="03" title="Play">
              Sixty minutes, one shared ship, live voice. Explore together, then split up when the
              room forces you to.
            </Step>
            <Step n="04" title="Debrief">
              Your result, your times, every hint you used and every burn you attempted — plus a
              team image to share.
            </Step>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap narrow center">
          <h2 style={{ fontSize: 30 }}>Ready when your group is</h2>
          <p className="lede" style={{ margin: '14px 0 26px' }}>
            {formatPrice(game.pricePerSeatCents)} a player. No subscription, no software, no
            scheduling anyone else's calendar but your own.
          </p>
          <Link href="/book/burn-window" className="btn btn-primary btn-lg">Book Burn Window</Link>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tiny mono" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: 19, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono" style={{ color: 'var(--accent)', fontSize: 13 }}>{n}</div>
      <h3 style={{ fontSize: 18, margin: '8px 0 8px' }}>{title}</h3>
      <p className="small">{children}</p>
    </div>
  );
}
