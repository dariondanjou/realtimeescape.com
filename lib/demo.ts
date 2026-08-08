import { cookies } from 'next/headers';

/**
 * Demo mode.
 *
 * Free seats, and a minimum party size of one so a room can be walked solo.
 *
 * Two independent switches:
 *
 *   DEMO_MODE_KEY   Set → demo mode exists at all. Unset → the toggle disappears and the API
 *                   returns 404. This is the master off switch.
 *   DEMO_MODE_OPEN  'true' → anyone can turn demo mode on with one click, no passkey.
 *                   Anything else → the passkey is required.
 *
 * ⚠️ DEMO_MODE_OPEN=true means ANY visitor can give themselves free games. That is fine while
 * nobody is being charged, and it must be turned off before real sales. See docs/LAUNCH_CHECKLIST.md.
 *
 * The cookie stores the server-side key rather than a boolean either way, so a hand-crafted
 * `rte_demo=true` is worthless — the server compares against DEMO_MODE_KEY on every request
 * rather than trusting the client's claim.
 */

export const DEMO_COOKIE = 'rte_demo';

export function demoAvailable(): boolean {
  return Boolean(process.env.DEMO_MODE_KEY);
}

/** True when demo mode can be enabled without the passkey. */
export function demoOpen(): boolean {
  return demoAvailable() && process.env.DEMO_MODE_OPEN === 'true';
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

/**
 * Whether the 3D game client can actually be entered.
 *
 * True only when a real game server is configured — an unset or localhost value means the
 * Colyseus server has not been deployed, so there is nothing to join. The lobby reads this and
 * tells the truth about it rather than presenting a start button that goes nowhere.
 *
 * Set NEXT_PUBLIC_GAME_SERVER_URL to the deployed wss:// address and the lobby switches over.
 */
export function gameClientAvailable(): boolean {
  const url = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? '';
  if (!url) return false;
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  return /^wss?:\/\//.test(url);
}
