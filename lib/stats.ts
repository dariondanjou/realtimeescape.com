import 'server-only';
import { adminClient, supabaseConfigured } from './supabase';

export type PublicStats = {
  playersRegistered: number;
  playersPlayed: number;
  sessionsCompleted: number;
  sessionsEscaped: number;
  playersGoal: number;
};

const FALLBACK: PublicStats = {
  playersRegistered: 0,
  playersPlayed: 0,
  sessionsCompleted: 0,
  sessionsEscaped: 0,
  playersGoal: 50_000,
};

/**
 * Aggregate counts for the public ticker.
 *
 * Reads a view that exposes counts only — no player row is ever readable from the browser.
 * Returns zeroes rather than throwing: a ticker is never worth a 500 on the landing page.
 */
export async function publicStats(): Promise<PublicStats> {
  if (!supabaseConfigured()) return FALLBACK;

  try {
    const { data } = await adminClient().from('rte_public_stats').select('*').maybeSingle();
    if (!data) return FALLBACK;

    return {
      playersRegistered: Number(data.players_registered ?? 0),
      playersPlayed: Number(data.players_played ?? 0),
      sessionsCompleted: Number(data.sessions_completed ?? 0),
      sessionsEscaped: Number(data.sessions_escaped ?? 0),
      playersGoal: Number(data.players_goal ?? 50_000),
    };
  } catch {
    return FALLBACK;
  }
}
