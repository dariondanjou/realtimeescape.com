'use client';

import dynamic from 'next/dynamic';

/**
 * Client-side boundary for the game. Babylon and the Colyseus client are browser-only, so the
 * whole game module is loaded without SSR — the server renders this shell and nothing heavier.
 */
const GameClient = dynamic(() => import('./GameClient'), {
  ssr: false,
  loading: () => (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#0b1114' }}>
      <p className="mono" style={{ color: '#92a4a7' }}>Loading the ship…</p>
    </div>
  ),
});

export default function Boarding(props: { bookingId: string; serverUrl: string; displayName: string }) {
  return <GameClient {...props} />;
}
