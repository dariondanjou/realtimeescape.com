import { cookies } from 'next/headers';

/**
 * Demo mode.
 *
 * Lets the owner and invited testers play a full game without paying and without needing a full
 * crew — minimum party size drops to one, and checkout is bypassed entirely.
 *
 * Two guardrails, because "free games" is exactly the switch an attacker looks for:
 *
 *   1. It is gated on DEMO_MODE_KEY, a server-side secret. Without that env var set, demo mode
 *      cannot be enabled by anyone, including by hand-crafting the cookie.
 *   2. Every booking made in demo mode is flagged `is_demo`, so demo sessions never pollute the
 *      revenue figures, the player ticker, or the escape-rate statistics.
 */

export const DEMO_COOKIE = 'rte_demo';

export function demoAvailable(): boolean {
  return Boolean(process.env.DEMO_MODE_KEY);
}

/** True when the current request is in demo mode. */
export async function isDemoMode(): Promise<boolean> {
  if (!demoAvailable()) return false;
  const store = await cookies();
  return store.get(DEMO_COOKIE)?.value === process.env.DEMO_MODE_KEY;
}

/** Minimum party size. Burn Window's endgame needs three; demo mode lets one person walk it. */
export function minPlayersFor(gameMin: number, demo: boolean): number {
  return demo ? 1 : gameMin;
}
