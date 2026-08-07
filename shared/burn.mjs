/**
 * Burn Window — maneuver generation and validation.
 *
 * This module is the single source of truth for the endgame. It is imported by BOTH the
 * Colyseus game server (game-server/) and the browser demo (app/demo/). It contains no I/O,
 * no randomness beyond the seeded PRNG, and no framework dependencies, so the exact same code
 * decides the outcome in production, in tests and in the demo.
 *
 * Design rules enforced here, from docs/BURN_WINDOW_GAME_SPEC.md:
 *   - Every maneuver derives from one session seed, so any run is reproducible.
 *   - Generation is validated: an impossible hand can never be dealt.
 *   - A failed attempt regenerates a DIFFERENT solution rather than repeating the old one,
 *     so retrying is never brute force.
 *   - Validation is authoritative. Clients render; this decides.
 */

/** Deterministic PRNG (mulberry32) so a seed always reproduces a session exactly. */
export function rng(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return function next() {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Server-defined tolerances. Tuned in beta; changing these changes the game's difficulty. */
export const TOLERANCE = Object.freeze({
  thrustPct: 2,        // ±% on the commanded thrust setting
  gimbalDeg: 1.5,      // ±degrees on the commanded gimbal angle
  ignitionSyncMs: 900, // all stations must begin their hold inside this window
  durationMs: 400,     // each station must hold within this of the commanded duration
});

export const STATIONS = Object.freeze(['A', 'B', 'C']);

export const STATION_NAMES = Object.freeze({
  A: 'Port Thruster Bay',
  B: 'Starboard Thruster Bay',
  C: 'Aft Gimbal Trim Bay',
});

/** Live stations and burn stages by locked player count (spec §3.1). */
export function scaleForPlayers(playerCount) {
  const n = Math.max(3, Math.min(8, Math.floor(playerCount)));
  const liveStations = n >= 5 ? ['A', 'B', 'C'] : ['A', 'B'];
  const stages = n >= 6 ? 3 : 2;
  return { playerCount: n, liveStations, stages };
}

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * Generates a maneuver plan. `attempt` advances the seed so a retry after a failed burn
 * produces genuinely new numbers rather than the same ones again.
 */
export function generateManeuver(seed, playerCount, attempt = 0) {
  const { liveStations, stages } = scaleForPlayers(playerCount);
  const rand = rng(`${seed}:burn:${attempt}`);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const plan = {
    seed,
    attempt,
    liveStations: [...liveStations],
    stages: [],
  };

  for (let s = 0; s < stages; s++) {
    // Arming order is a shuffled permutation of the live stations.
    const order = [...liveStations];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const settings = {};
    for (const st of liveStations) {
      settings[st] = {
        thrustPct: round(40 + rand() * 55, 0),      // 40–95%
        gimbalDeg: round(-20 + rand() * 40, 1),     // -20°..+20°
      };
    }

    plan.stages.push({
      index: s,
      label: s === 0 ? 'COARSE' : s === stages - 1 ? 'TRIM' : 'CORRECTION',
      armingOrder: order,
      settings,
      durationMs: Math.round((4 + rand() * 7) * 1000), // 4–11 s
      leadStation: pick(liveStations),
    });
  }

  const problems = validatePlan(plan);
  if (problems.length) {
    // Generation is guarded: rather than dealing an impossible hand, advance and retry.
    if (attempt > 24) throw new Error(`Unable to generate a valid maneuver: ${problems.join('; ')}`);
    return generateManeuver(seed, playerCount, attempt + 1);
  }

  return plan;
}

/**
 * Structural validation of a generated plan. Runs on every seed in CI (see docs/TEST_PLAN.md)
 * and again at generation time, so the randomizer can never produce an unwinnable configuration.
 */
export function validatePlan(plan) {
  const problems = [];

  if (!plan.stages.length) problems.push('no stages');
  if (plan.liveStations.length < 2) problems.push('fewer than two live stations');

  for (const stage of plan.stages) {
    const armed = [...stage.armingOrder].sort().join('');
    const live = [...plan.liveStations].sort().join('');
    if (armed !== live) problems.push(`stage ${stage.index}: arming order does not cover live stations`);

    if (stage.durationMs < 3000 || stage.durationMs > 12000) {
      problems.push(`stage ${stage.index}: duration ${stage.durationMs}ms outside authored range`);
    }

    for (const st of plan.liveStations) {
      const set = stage.settings[st];
      if (!set) { problems.push(`stage ${stage.index}: station ${st} has no settings`); continue; }

      // A panel dial must be able to physically express the commanded value.
      if (set.thrustPct < 0 || set.thrustPct > 100) {
        problems.push(`stage ${stage.index}/${st}: thrust ${set.thrustPct}% not expressible`);
      }
      if (set.gimbalDeg < -25 || set.gimbalDeg > 25) {
        problems.push(`stage ${stage.index}/${st}: gimbal ${set.gimbalDeg}° not expressible`);
      }
      // Tolerance must not exceed the dial's own resolution, or the puzzle is unreadable.
      if (TOLERANCE.thrustPct >= 5 || TOLERANCE.gimbalDeg >= 5) {
        problems.push('tolerances too loose to require communication');
      }
    }
  }

  return problems;
}

/**
 * Validates one burn attempt against a stage. Authoritative.
 *
 * @param stage    the stage from the maneuver plan
 * @param attempt  {armedOrder: string[], stations: {[id]: {thrustPct, gimbalDeg, holdStartMs, holdEndMs}}}
 * @returns        {ok, failures[], detail{}}
 */
export function validateBurn(stage, attempt, liveStations) {
  const failures = [];
  const detail = {};

  // 1. Arming order must match exactly.
  const expected = stage.armingOrder.join('');
  const actual = (attempt.armedOrder ?? []).join('');
  if (actual !== expected) {
    failures.push({
      code: 'ARMING_ORDER',
      message: `Arming order was ${actual || 'empty'}; the flight computer required ${expected}.`,
    });
  }

  // 2. Every live station must have participated.
  for (const st of liveStations) {
    if (!attempt.stations?.[st]) {
      failures.push({ code: 'STATION_MISSING', station: st, message: `${STATION_NAMES[st]} never ignited.` });
    }
  }

  // 3. Per-station dial settings.
  for (const st of liveStations) {
    const got = attempt.stations?.[st];
    const want = stage.settings[st];
    if (!got || !want) continue;

    const dThrust = Math.abs(got.thrustPct - want.thrustPct);
    const dGimbal = Math.abs(got.gimbalDeg - want.gimbalDeg);
    detail[st] = { dThrust: round(dThrust, 2), dGimbal: round(dGimbal, 2) };

    if (dThrust > TOLERANCE.thrustPct) {
      failures.push({
        code: 'THRUST', station: st,
        message: `${STATION_NAMES[st]} set ${got.thrustPct}% against a commanded ${want.thrustPct}%.`,
      });
    }
    if (dGimbal > TOLERANCE.gimbalDeg) {
      failures.push({
        code: 'GIMBAL', station: st,
        message: `${STATION_NAMES[st]} set ${got.gimbalDeg}° against a commanded ${want.gimbalDeg}°.`,
      });
    }
  }

  // 4. Ignition synchronisation across every participating station.
  const starts = liveStations
    .map((st) => attempt.stations?.[st]?.holdStartMs)
    .filter((v) => typeof v === 'number');

  if (starts.length === liveStations.length) {
    const spread = Math.max(...starts) - Math.min(...starts);
    detail.syncSpreadMs = Math.round(spread);
    if (spread > TOLERANCE.ignitionSyncMs) {
      failures.push({
        code: 'SYNC',
        message: `Ignition spread was ${(spread / 1000).toFixed(2)}s; tolerance is ${(TOLERANCE.ignitionSyncMs / 1000).toFixed(2)}s.`,
      });
    }
  }

  // 5. Hold duration per station.
  for (const st of liveStations) {
    const got = attempt.stations?.[st];
    if (!got || typeof got.holdStartMs !== 'number' || typeof got.holdEndMs !== 'number') continue;
    const held = got.holdEndMs - got.holdStartMs;
    detail[st] = { ...(detail[st] ?? {}), heldMs: Math.round(held) };
    const delta = Math.abs(held - stage.durationMs);
    if (delta > TOLERANCE.durationMs) {
      failures.push({
        code: 'DURATION', station: st,
        message: `${STATION_NAMES[st]} held ${(held / 1000).toFixed(2)}s against a commanded ${(stage.durationMs / 1000).toFixed(2)}s.`,
      });
    }
  }

  return { ok: failures.length === 0, failures, detail };
}

/** Cost of a failed attempt, in milliseconds off the session clock (spec §5, P14). */
export const SETBACK_MS = 90_000;

/**
 * What the flight deck is allowed to know about a station, and nothing more.
 * The navigator sees readiness, never another station's panel values.
 */
export function readinessView(stationState) {
  return {
    powered: Boolean(stationState?.powered),
    interlockCleared: Boolean(stationState?.interlockCleared),
    armed: Boolean(stationState?.armed),
    dialsTouched: Boolean(stationState?.dialsTouched),
  };
}
