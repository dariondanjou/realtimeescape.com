'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Plain-JS module shared verbatim with the game server — same generator, same verdict.
import { generateManeuver, validateBurn, TOLERANCE, STATION_NAMES } from '@/shared/burn.mjs';
import type { ManeuverPlan as Plan, BurnResult } from '@/shared/burn.mjs';

type Panel = { thrustPct: number; gimbalDeg: number; armed: boolean; holdStart: number | null; holdEnd: number | null };

const PLAYER_COUNT = 6;

function freshPanels(stations: string[]): Record<string, Panel> {
  return Object.fromEntries(
    stations.map((s) => [s, { thrustPct: 50, gimbalDeg: 0, armed: false, holdStart: null, holdEnd: null }]),
  );
}

export default function BurnDemo() {
  const [seed, setSeed] = useState('meridian-ao114');
  const [attempt, setAttempt] = useState(0);
  const plan = useMemo<Plan>(() => generateManeuver(seed, PLAYER_COUNT, attempt), [seed, attempt]);
  const stage = plan.stages[0];
  const live: string[] = plan.liveStations;

  const [panels, setPanels] = useState<Record<string, Panel>>(() => freshPanels(live));
  const [armOrder, setArmOrder] = useState<string[]>([]);
  const [result, setResult] = useState<BurnResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const holding = useRef<Record<string, boolean>>({});

  useEffect(() => {
    setPanels(freshPanels(live));
    setArmOrder([]);
    setResult(null);
    holding.current = {};
  }, [plan, live]);

  const setPanel = useCallback((id: string, patch: Partial<Panel>) => {
    setPanels((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  }, []);

  function toggleArm(id: string) {
    const armed = !panels[id].armed;
    setPanel(id, { armed });
    setArmOrder((o) => (armed ? [...o.filter((x) => x !== id), id] : o.filter((x) => x !== id)));
  }

  function press(id: string) {
    if (!panels[id].armed || holding.current[id]) return;
    holding.current[id] = true;
    setPanel(id, { holdStart: performance.now(), holdEnd: null });
  }

  function release(id: string) {
    if (!holding.current[id]) return;
    holding.current[id] = false;
    setPanel(id, { holdEnd: performance.now() });
  }

  // Countdown then auto-release anything still held, so a stuck key cannot fake a burn.
  function runCountdown() {
    setResult(null);
    setCountdown(3);
    const iv = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) { clearInterval(iv); return 0; }
        return c - 1;
      });
    }, 1000);
    setTimeout(() => setCountdown(null), 3600);
  }

  function commit() {
    const stations: Record<string, { thrustPct: number; gimbalDeg: number; holdStartMs: number; holdEndMs: number }> = {};
    for (const id of live) {
      const p = panels[id];
      if (p.holdStart === null || p.holdEnd === null) continue;
      stations[id] = {
        thrustPct: p.thrustPct,
        gimbalDeg: p.gimbalDeg,
        holdStartMs: p.holdStart,
        holdEndMs: p.holdEnd,
      };
    }
    setResult(validateBurn(stage, { armedOrder: armOrder, stations }, live));
  }

  function retry() {
    setAttempt((a) => a + 1);
    setRevealed(false);
  }

  function reset() {
    setPanels(freshPanels(live));
    setArmOrder([]);
    setResult(null);
    holding.current = {};
  }

  const allHeld = live.every((id) => panels[id]?.holdStart !== null && panels[id]?.holdEnd !== null);

  return (
    <div>
      <div className="panel" style={{ marginBottom: 20, background: 'var(--bg)' }}>
        <div className="spread">
          <div>
            <span className="eyebrow">Flight deck · you are the navigator</span>
            <p className="small" style={{ marginTop: 8, maxWidth: 620 }}>
              In the real game the three panels below are in three separate compartments, operated
              by three different people who <strong>cannot see this screen</strong>. You would read
              these numbers out loud and they would set them. Here you play all four positions at
              once — which is exactly why it is a demo and not the game.
            </p>
          </div>
          <button type="button" onClick={() => setRevealed((r) => !r)} className="btn btn-ghost btn-sm">
            {revealed ? 'Hide' : 'Show'} the solution
          </button>
        </div>
      </div>

      {/* Cockpit view — the maneuver plan */}
      <div className="panel panel-accent" style={{ marginBottom: 20 }}>
        <div className="spread" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 18 }}>
            Maneuver {stage.label} <span className="tiny mono">· attempt {attempt + 1}</span>
          </h3>
          <span className="badge badge-live">Hold for {(stage.durationMs / 1000).toFixed(1)}s</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>Station</th>
              <th>Thrust</th>
              <th>Gimbal</th>
              <th>Arm order</th>
            </tr>
          </thead>
          <tbody>
            {live.map((id) => (
              <tr key={id}>
                <td className="mono">{id} · {STATION_NAMES[id]}</td>
                <td className="mono" style={{ color: 'var(--accent-bright)' }}>{stage.settings[id].thrustPct}%</td>
                <td className="mono" style={{ color: 'var(--accent-bright)' }}>{stage.settings[id].gimbalDeg}°</td>
                <td className="mono">{stage.armingOrder.indexOf(id) + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="tiny" style={{ marginTop: 14 }}>
          Arm in order {stage.armingOrder.join(' → ')}, then all stations ignite together within{' '}
          {(TOLERANCE.ignitionSyncMs / 1000).toFixed(2)}s and hold for{' '}
          {(stage.durationMs / 1000).toFixed(1)}s ± {(TOLERANCE.durationMs / 1000).toFixed(1)}s.
        </p>
      </div>

      {/* Countdown */}
      <div className="center" style={{ margin: '26px 0' }}>
        {countdown !== null ? (
          <div className="mono" style={{ fontSize: 64, color: 'var(--accent-bright)', lineHeight: 1 }}>
            {countdown === 0 ? 'BURN' : countdown}
          </div>
        ) : (
          <button type="button" onClick={runCountdown} className="btn btn-ghost">
            Start a 3-second countdown
          </button>
        )}
      </div>

      {/* Station panels */}
      <div className="grid" style={{ gridTemplateColumns: `repeat(${live.length}, minmax(0,1fr))`, gap: 16 }}>
        {live.map((id) => {
          const p = panels[id];
          const want = stage.settings[id];
          const armIndex = armOrder.indexOf(id);
          return (
            <div key={id} className="panel" style={{ padding: 18 }}>
              <div className="spread" style={{ marginBottom: 14 }}>
                <div>
                  <div className="mono" style={{ fontSize: 20, color: 'var(--accent)' }}>{id}</div>
                  <div className="tiny">{STATION_NAMES[id]}</div>
                </div>
                {armIndex >= 0 && <span className="badge badge-live">armed #{armIndex + 1}</span>}
              </div>

              <Dial
                label="Thrust"
                unit="%"
                min={0} max={100} step={0.5}
                value={p.thrustPct}
                target={revealed ? want.thrustPct : null}
                disabled={p.armed}
                onChange={(v) => setPanel(id, { thrustPct: v })}
              />
              <Dial
                label="Gimbal"
                unit="°"
                min={-25} max={25} step={0.1}
                value={p.gimbalDeg}
                target={revealed ? want.gimbalDeg : null}
                disabled={p.armed}
                onChange={(v) => setPanel(id, { gimbalDeg: v })}
              />

              <button
                type="button"
                onClick={() => toggleArm(id)}
                className={`btn btn-block btn-sm ${p.armed ? 'btn-primary' : 'btn-ghost'}`}
                style={{ marginTop: 14 }}
              >
                {p.armed ? 'Safe station' : 'Arm station'}
              </button>

              <button
                type="button"
                disabled={!p.armed}
                onPointerDown={() => press(id)}
                onPointerUp={() => release(id)}
                onPointerLeave={() => release(id)}
                className="btn btn-block"
                style={{
                  marginTop: 8,
                  background: holding.current[id] ? 'var(--accent-bright)' : 'var(--warm-dark)',
                  color: holding.current[id] ? '#1a1210' : 'var(--accent-bright)',
                  border: '1px solid var(--accent-deep)',
                  userSelect: 'none',
                  touchAction: 'none',
                }}
              >
                {p.holdEnd !== null && p.holdStart !== null
                  ? `held ${((p.holdEnd - p.holdStart) / 1000).toFixed(2)}s`
                  : 'HOLD TO IGNITE'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="spread" style={{ marginTop: 22 }}>
        <button type="button" onClick={reset} className="btn btn-ghost btn-sm">Reset panels</button>
        <button type="button" onClick={commit} className="btn btn-primary" disabled={!allHeld}>
          {allHeld ? 'Commit the maneuver' : 'Every station must ignite first'}
        </button>
      </div>

      {result && (
        <div className={`notice ${result.ok ? 'notice-ok' : 'notice-warn'}`} style={{ marginTop: 22 }} role="status">
          {result.ok ? (
            <>
              <strong>Return vector established.</strong> Every station landed inside tolerance.
              In the full game this is where the ship swings around and Earth comes back into the
              lounge window.
            </>
          ) : (
            <>
              <strong>Setback — the flight computer is recalculating.</strong>
              <ul style={{ margin: '10px 0 0 18px' }}>
                {result.failures.map((f, i) => <li key={i}>{f.message}</li>)}
              </ul>
              <p style={{ marginTop: 10 }}>
                In the real room this costs 90 seconds <em>and the solution changes</em> — so a
                second attempt is a new problem, not another guess at the old one.
              </p>
              <button type="button" onClick={retry} className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
                Recalculate and try again
              </button>
            </>
          )}
        </div>
      )}

      <details style={{ marginTop: 30 }}>
        <summary className="small" style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>
          Change the session seed
        </summary>
        <div className="field" style={{ marginTop: 12, maxWidth: 340 }}>
          <label htmlFor="seed">Seed</label>
          <input id="seed" type="text" value={seed} onChange={(e) => { setSeed(e.target.value); setAttempt(0); }} />
          <p className="tiny" style={{ marginTop: 6 }}>
            Every session gets its own seed, so the numbers are never the same twice and a
            walkthrough is worth nothing.
          </p>
        </div>
      </details>
    </div>
  );
}

function Dial({
  label, unit, min, max, step, value, target, disabled, onChange,
}: {
  label: string; unit: string; min: number; max: number; step: number;
  value: number; target: number | null; disabled: boolean; onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="spread" style={{ marginBottom: 4 }}>
        <label style={{ margin: 0 }}>{label}</label>
        <span className="mono" style={{ fontSize: 15 }}>
          {value.toFixed(step < 1 ? 1 : 0)}{unit}
          {target !== null && (
            <span style={{ color: 'var(--accent-bright)' }}> / {target}{unit}</span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
        aria-label={`${label} in ${unit}`}
      />
    </div>
  );
}
