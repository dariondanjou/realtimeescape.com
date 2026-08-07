import type { PublicStats } from '@/lib/stats';

/**
 * The player-count ticker.
 *
 * Every paying player gets a permanent sequential number, and this is how many have been handed
 * out. Shown against the 50,000 goal — it is a real number, so before launch it reads as a small
 * one, which is the honest thing for a beta to show.
 */
export function Ticker({ stats }: { stats: PublicStats }) {
  const pct = Math.min(100, (stats.playersPlayed / stats.playersGoal) * 100);
  const escapeRate =
    stats.sessionsCompleted > 0
      ? Math.round((stats.sessionsEscaped / stats.sessionsCompleted) * 100)
      : null;

  return (
    <div className="panel" style={{ padding: 22 }}>
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div className="tiny mono" style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Players flown
          </div>
          <div className="mono" style={{ fontSize: 34, lineHeight: 1.1, marginTop: 4 }}>
            {stats.playersPlayed.toLocaleString()}
            <span style={{ color: 'var(--text-faint)', fontSize: 20 }}>
              {' / '}{stats.playersGoal.toLocaleString()}
            </span>
          </div>
        </div>
        {escapeRate !== null && (
          <div style={{ textAlign: 'right' }}>
            <div className="tiny mono" style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Escape rate
            </div>
            <div className="mono" style={{ fontSize: 22, marginTop: 4 }}>{escapeRate}%</div>
          </div>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuenow={stats.playersPlayed}
        aria-valuemin={0}
        aria-valuemax={stats.playersGoal}
        aria-label="Players flown, toward the 50,000 goal"
        style={{ height: 5, background: 'var(--bg)', borderRadius: 100, overflow: 'hidden' }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.max(pct, 0.4)}%`,
            background: 'linear-gradient(90deg, var(--accent-deep), var(--accent-bright))',
          }}
        />
      </div>

      <p className="tiny" style={{ marginTop: 12 }}>
        Every player who flies gets a permanent number. Yours is assigned the moment your seat is
        paid, and it is yours for good — first fifty come aboard, first fifty in the manifest.
      </p>
    </div>
  );
}
