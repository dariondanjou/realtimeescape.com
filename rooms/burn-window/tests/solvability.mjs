/**
 * Burn Window solvability and seed-validation test.
 *
 * Proves, across the full supported player range and a large seed sample, that:
 *   1. Every generated maneuver passes structural validation (no impossible hands).
 *   2. A perfectly-executed attempt always validates (the room is winnable).
 *   3. Every individual tolerance boundary actually fails when exceeded (the room is not
 *      trivially winnable).
 *   4. A retry after failure produces a DIFFERENT plan (no brute-forcing).
 *
 * Run: npm run test:room
 */

import {
  generateManeuver, validatePlan, validateBurn, scaleForPlayers, TOLERANCE,
} from '../../../shared/burn.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, extra = '') {
  if (condition) { pass++; }
  else { fail++; failures.push(`${name}${extra ? ` — ${extra}` : ''}`); }
}

/** Executes a stage exactly as commanded. */
function perfectAttempt(stage, liveStations, t0 = 10_000) {
  const stations = {};
  for (const st of liveStations) {
    stations[st] = {
      thrustPct: stage.settings[st].thrustPct,
      gimbalDeg: stage.settings[st].gimbalDeg,
      holdStartMs: t0,
      holdEndMs: t0 + stage.durationMs,
    };
  }
  return { armedOrder: [...stage.armingOrder], stations };
}

const SEED_COUNT = Number(process.env.SEEDS ?? 2000);

console.log(`Burn Window solvability — ${SEED_COUNT} seeds × player counts 3–8\n`);

// ---- 1 & 2: generation validity and winnability ----------------------------

for (let i = 0; i < SEED_COUNT; i++) {
  const seed = `seed-${i.toString(36)}-${(i * 2654435761) % 1e9}`;

  for (let players = 1; players <= 8; players++) {
    const { liveStations, stages } = scaleForPlayers(players);
    let plan;
    try {
      plan = generateManeuver(seed, players);
    } catch (e) {
      check(`generate(${seed}, ${players})`, false, e.message);
      continue;
    }

    check(`plan valid (${players}p)`, validatePlan(plan).length === 0, validatePlan(plan).join('; '));
    check(`stage count (${players}p)`, plan.stages.length === stages, `got ${plan.stages.length}, want ${stages}`);
    check(`station count (${players}p)`, plan.liveStations.length === liveStations.length);

    for (const stage of plan.stages) {
      const result = validateBurn(stage, perfectAttempt(stage, plan.liveStations), plan.liveStations);
      check(
        `perfect attempt validates (${players}p, stage ${stage.index})`,
        result.ok,
        result.failures.map((f) => f.code).join(','),
      );
    }
  }
}

// ---- 3: tolerance boundaries actually bite ---------------------------------

{
  const plan = generateManeuver('boundary-probe', 6);
  const stage = plan.stages[0];
  const live = plan.liveStations;
  const st = live[0];

  const justInside = perfectAttempt(stage, live);
  justInside.stations[st].thrustPct += TOLERANCE.thrustPct - 0.01;
  check('thrust just inside tolerance passes', validateBurn(stage, justInside, live).ok);

  const justOutside = perfectAttempt(stage, live);
  justOutside.stations[st].thrustPct += TOLERANCE.thrustPct + 0.5;
  check('thrust outside tolerance fails', !validateBurn(stage, justOutside, live).ok);

  const gimbalOff = perfectAttempt(stage, live);
  gimbalOff.stations[st].gimbalDeg += TOLERANCE.gimbalDeg + 0.5;
  check('gimbal outside tolerance fails', !validateBurn(stage, gimbalOff, live).ok);

  const desynced = perfectAttempt(stage, live);
  desynced.stations[st].holdStartMs += TOLERANCE.ignitionSyncMs + 200;
  desynced.stations[st].holdEndMs += TOLERANCE.ignitionSyncMs + 200;
  check('ignition desync fails', !validateBurn(stage, desynced, live).ok);

  const shortHold = perfectAttempt(stage, live);
  shortHold.stations[st].holdEndMs -= TOLERANCE.durationMs + 200;
  check('short hold fails', !validateBurn(stage, shortHold, live).ok);

  const wrongOrder = perfectAttempt(stage, live);
  wrongOrder.armedOrder = [...stage.armingOrder].reverse();
  const orderResult = validateBurn(stage, wrongOrder, live);
  // A reversed order of a 2-station stage that happens to be palindromic cannot differ.
  if (stage.armingOrder.join('') !== [...stage.armingOrder].reverse().join('')) {
    check('wrong arming order fails', !orderResult.ok);
  }

  const missing = perfectAttempt(stage, live);
  delete missing.stations[st];
  check('missing station fails', !validateBurn(stage, missing, live).ok);
}

// ---- 4: a retry deals a new hand -------------------------------------------

{
  let differed = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const seed = `retry-${i}`;
    const a = generateManeuver(seed, 6, 0);
    const b = generateManeuver(seed, 6, 1);
    if (JSON.stringify(a.stages) !== JSON.stringify(b.stages)) differed++;
  }
  check('retry regenerates a different plan', differed === trials, `${differed}/${trials} differed`);
}

// ---- report ----------------------------------------------------------------

console.log(`\n  passed: ${pass}`);
console.log(`  failed: ${fail}`);

if (fail) {
  console.log('\nFailures:');
  for (const f of failures.slice(0, 25)) console.log(`  - ${f}`);
  if (failures.length > 25) console.log(`  … and ${failures.length - 25} more`);
  process.exit(1);
}

console.log('\nAll solvability checks passed.');
