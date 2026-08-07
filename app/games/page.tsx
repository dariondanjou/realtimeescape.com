import Link from 'next/link';
import type { Metadata } from 'next';
import { GAMES, formatPrice } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Games',
  description: 'The RealTimeEscape catalog of browser-based multiplayer 3D escape rooms.',
};

export default function GamesPage() {
  return (
    <section className="section">
      <div className="wrap">
        <span className="eyebrow eyebrow-dim">Catalog</span>
        <h1 style={{ fontSize: 40, margin: '14px 0 10px' }}>Games</h1>
        <p className="lede" style={{ maxWidth: 620 }}>
          One flagship room at launch, built properly. More follow once Burn Window has been played
          by enough real groups to teach us what to build next.
        </p>

        <div className="grid grid-2" style={{ marginTop: 40 }}>
          {GAMES.map((g) => (
            <Link key={g.slug} href={`/games/${g.slug}`} className="panel" style={{ display: 'block' }}>
              <span className="badge badge-live">Now booking</span>
              <h2 style={{ fontSize: 26, margin: '14px 0 8px' }}>{g.title}</h2>
              <p className="small">{g.tagline}</p>
              <dl style={{ marginTop: 20 }}>
                <div className="kv"><dt>Duration</dt><dd>{g.durationMinutes} minutes</dd></div>
                <div className="kv"><dt>Players</dt><dd>{g.minPlayers}–{g.maxPlayers} ({g.recommended})</dd></div>
                <div className="kv"><dt>Difficulty</dt><dd>{g.difficulty}</dd></div>
                <div className="kv"><dt>Price</dt><dd>{formatPrice(g.pricePerSeatCents)} per player</dd></div>
              </dl>
            </Link>
          ))}

          <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', borderStyle: 'dashed' }}>
            <span className="badge">In production</span>
            <h2 style={{ fontSize: 22, margin: '14px 0 8px', color: 'var(--text-dim)' }}>Room Two</h2>
            <p className="small">
              Built on the same engine, which is the entire point of building the engine. Join the
              list on any game page and we will tell you when it opens.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
