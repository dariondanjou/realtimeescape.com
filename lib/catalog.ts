/**
 * Game catalog. Presentation metadata only — never puzzle data.
 * Canonical pricing and player limits live here and are re-validated server-side at checkout.
 */

export type Game = {
  slug: string;
  title: string;
  tagline: string;
  premise: string;
  durationMinutes: number;
  minPlayers: number;
  maxPlayers: number;
  recommended: string;
  pricePerSeatCents: number;
  difficulty: 'Approachable' | 'Standard' | 'Demanding';
  intensity: string;
  status: 'live' | 'beta' | 'soon';
  ship: string;
  operator: string;
};

export const GAMES: Game[] = [
  {
    slug: 'burn-window',
    title: 'Burn Window',
    tagline: 'Sixty minutes to put a spacecraft back on a trajectory home.',
    premise:
      'You booked a sightseeing flight. You wake in a dark cabin with Earth in the wrong part of the window, ' +
      'a crew that is not answering, and a maneuver window that closes in sixty minutes.',
    durationMinutes: 60,
    minPlayers: 3,
    maxPlayers: 8,
    recommended: '4–6 players',
    pricePerSeatCents: 2000,
    difficulty: 'Standard',
    intensity: 'Suspense. One brief non-graphic body-horror reveal. No jump scares.',
    status: 'beta',
    ship: 'CSV Meridian',
    operator: 'Anterra Orbital',
  },
];

export function getGame(slug: string): Game | undefined {
  return GAMES.find((g) => g.slug === slug);
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
