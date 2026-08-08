import Link from 'next/link';
import { GAMES, formatPrice } from '@/lib/catalog';
import { publicStats } from '@/lib/stats';
import { Ticker } from '@/components/Ticker';
import HeroArt from '@/components/HeroArt';
import HeroSpace from '@/components/HeroSpace';

const game = GAMES[0];

export const dynamic = 'force-dynamic';

export default async function Home() {
  const stats = await publicStats();

  return (
    <>
      {/* ---- Giant full-bleed hero: the brand, the slogan, one button ---- */}
      <section className="hero-xl theme-dark">
        <HeroSpace />
        <div className="hero-xl-inner">
          <p className="hero-brand">RealTimeEscape</p>
          <h1 className="hero-slogan">
            Escape together.
            <br />
            From anywhere.
          </h1>
          <p className="hero-sub">
            Real-time multiplayer escape rooms in your browser. Your own private ship, your own
            view of it, live voice with your crew. No download. No host. No drive across town.
          </p>
          <div className="hero-ctas">
            <Link href="/book/burn-window" className="btn btn-primary btn-lg">
              Play Burn Window
            </Link>
            <Link href="/demo" className="link-more">Try the ending free</Link>
          </div>
        </div>
        <p className="hero-foot">3–8 players · 60 minutes · desktop or laptop browser</p>
      </section>

      {/* ---- Why it's different ---- */}
      <section className="section">
        <div className="wrap center">
          <h2 className="display">One ship. Everyone inside it.</h2>
          <p className="lede narrow" style={{ margin: '18px auto 0' }}>
            This is not a puzzle page you screen-share. It is a synchronized 3D spacecraft
            everyone walks through on their own screen.
          </p>
          <div className="grid grid-3" style={{ marginTop: 56, textAlign: 'left' }}>
            <div className="panel">
              <h3>Same world, different eyes</h3>
              <p className="small" style={{ marginTop: 10 }}>
                Each player moves independently through the same live ship and sees the others as
                avatars inside it. One of you can be in the cockpit while another is three
                compartments away at a thruster.
              </p>
            </div>
            <div className="panel">
              <h3>Talking is the mechanic</h3>
              <p className="small" style={{ marginTop: 10 }}>
                Clues are deliberately split across people and places. Nobody holds all the
                information — the ending has to be talked through, out loud, under a clock.
              </p>
            </div>
            <div className="panel">
              <h3>Nobody is watching you</h3>
              <p className="small" style={{ marginTop: 10 }}>
                No employee runs your session. The room starts itself, tracks every puzzle, hints
                when you stall, decides the ending and sends your results.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Featured game: Burn Window ---- */}
      <section className="feature-dark theme-dark">
        <div className="wrap">
          <span className="eyebrow">Now boarding</span>
          <h2 className="feature-title" style={{ marginTop: 10 }}>{game.title}</h2>
          <p className="lede" style={{ maxWidth: 640, margin: '18px auto 0' }}>{game.premise}</p>

          <div className="stats-row">
            <span>60 minutes</span>
            <span className="dot">·</span>
            <span>{game.minPlayers}–{game.maxPlayers} players</span>
            <span className="dot">·</span>
            <span>{formatPrice(game.pricePerSeatCents)} per player</span>
          </div>

          <div className="hero-ctas" style={{ marginTop: 30 }}>
            <Link href="/book/burn-window" className="btn btn-primary btn-lg">
              Play Burn Window
            </Link>
            <Link href="/games/burn-window" className="link-more">Read the full briefing</Link>
          </div>

          <figure className="feature-shot">
            <HeroArt />
          </figure>

          <div style={{ maxWidth: 460, margin: '46px auto 0' }}>
            <Ticker stats={stats} />
          </div>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section className="section">
        <div className="wrap">
          <h2 className="display center">From link to liftoff.</h2>
          <div className="grid grid-4" style={{ marginTop: 56 }}>
            <Step n="01" title="Book">
              Pick a time or start immediately. Pay for everyone, or pay for your seat and send
              the rest a link so they pay for theirs.
            </Step>
            <Step n="02" title="Gather">
              The lobby opens 15 minutes early. Pick an avatar, test your mic and graphics, learn
              the controls.
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

      {/* ---- Closing CTA ---- */}
      <section className="section-tight" style={{ paddingBottom: 110 }}>
        <div className="wrap narrow center">
          <h2 className="display">Ready when your group is.</h2>
          <p className="lede" style={{ margin: '16px 0 30px' }}>
            {formatPrice(game.pricePerSeatCents)} a player. No subscription, no software, no
            scheduling anyone&rsquo;s calendar but your own.
          </p>
          <Link href="/book/burn-window" className="btn btn-primary btn-lg">Play Burn Window</Link>
        </div>
      </section>
    </>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>{n}</div>
      <h3 style={{ fontSize: 19, margin: '8px 0 8px' }}>{title}</h3>
      <p className="small">{children}</p>
    </div>
  );
}
