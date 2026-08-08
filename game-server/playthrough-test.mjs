/**
 * Full-session playthrough test.
 *
 * A bot joins the real server and plays the entire room solo: all fourteen puzzles in graph
 * order, then the synchronized burn, to an ESCAPED result. This is the session-level
 * solvability proof — if any puzzle, door rule, zone gate or the burn flow regresses, this
 * fails before a human ever hits it.
 *
 * The bot derives answers by running the same seeded generator the server runs, which is the
 * point: it proves the server accepts the content it generated.
 *
 * Usage: node playthrough-test.mjs [ws-url]   (default ws://localhost:2567)
 */

import { Client } from 'colyseus.js';
import { generateContent } from '../rooms/burn-window/content/puzzles.mjs';
import { generateManeuver } from '../shared/burn.mjs';

const URL = process.argv[2] ?? 'ws://localhost:2567';
const SEED = `playthrough-${Date.now()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const c = new Client(URL);
const room = await c.joinOrCreate('burn_window', {
  seed: SEED,
  displayName: 'Playthrough bot',
  seatId: 'bot-1',
});

let phase = 'lobby';
let lastInteract = null;
let lastRead = null;
const solved = new Set();
const results = [];
let sessionResult = null;

room.onStateChange((s) => { phase = s.phase; });
room.onMessage('interact.result', (m) => { lastInteract = m; });
room.onMessage('read.result', (m) => { lastRead = m; });
room.onMessage('puzzle.solved', (m) => { solved.add(m.puzzleId); });
room.onMessage('session.result', (m) => { sessionResult = m; });
room.onMessage('cass', () => {});
room.onMessage('welcome', () => {});
room.onMessage('cockpit.view', () => {});
room.onMessage('station.view', () => {});
room.onMessage('burn.result', (m) => results.push(m));
room.onMessage('chat', () => {});
room.onMessage('error', (m) => console.log('  [server error]', m.message));
room.onMessage('hint', () => {});

function check(name, cond, extra = '') {
  const mark = cond ? 'ok  ' : 'FAIL';
  console.log(`${mark} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) { console.log('\nPLAYTHROUGH FAILED'); process.exit(1); }
}

async function interact(puzzleId, action, payload = {}) {
  lastInteract = null;
  room.send('interact', { puzzleId, action, payload });
  for (let i = 0; i < 100 && !lastInteract; i++) await sleep(30);
  return lastInteract ?? { ok: false, message: 'no reply' };
}

async function read(what) {
  lastRead = null;
  room.send('read', { what });
  for (let i = 0; i < 100 && !lastRead; i++) await sleep(30);
  return lastRead?.data ?? {};
}

function goto(zone) {
  room.send('move', { x: 0, y: 0, z: 0, ry: 0, zone, locomotion: 'walk' });
  return sleep(150);
}

async function waitSolved(id, timeoutMs = 8000) {
  for (let i = 0; i < timeoutMs / 50 && !solved.has(id); i++) await sleep(50);
  check(`${id} solved`, solved.has(id));
}

/* ------------------------------------------------------------------ */

console.log(`Playthrough against ${URL}, seed ${SEED}\n`);

// The bot knows the answers because it runs the same generator on the same seed.
const content = generateContent(SEED, 1);

room.send('ready');
for (let i = 0; i < 400 && phase !== 'active'; i++) await sleep(100);
check('session reaches active after briefing', phase === 'active', `phase=${phase}`);

/* P1 — solo restraint hold */
await interact('P1', 'hold_start');
await sleep(2700);
await interact('P1', 'hold_end');
await waitSolved('P1');

/* P2 — breakers: shed heater, close comms, close lighting */
await interact('P2', 'toggle', { idx: content.heaterIdx });   // open the heater
await interact('P2', 'toggle', { idx: content.commsIdx });
await interact('P2', 'toggle', { idx: content.lightIdx });
await waitSolved('P2');

/* P3 — door code */
const r3 = await interact('P3', 'enter', { code: content.doorCode });
check('P3 accepts the generated code', r3.ok);
await waitSolved('P3');

/* P4 — pressure to the band */
{
  let guard = 0;
  while (!solved.has('P4') && guard++ < 40) {
    await interact('P4', 'valve', { delta: 6 });
  }
  await waitSolved('P4');
}

/* P5 — galley */
await goto('Z3');
const r5 = await interact('P5', 'enter', { combo: content.galleyCombo });
check('P5 accepts the stencilled combo', r5.ok);
await waitSolved('P5');

/* P6 — crew locker */
await goto('Z4');
const r6 = await interact('P6', 'enter', { combo: content.crewCombo });
check('P6 accepts the derived combo', r6.ok);
await waitSolved('P6');

/* P7 — token + solo crank (8s) */
await goto('Z2');
const r7a = await interact('P7', 'socket_token');
check('P7 token sockets', r7a.ok);
await interact('P7', 'crank_start');
for (let i = 0; i < 18 && !solved.has('P7'); i++) {
  await sleep(500);
  await interact('P7', 'crank_tick');
}
await interact('P7', 'crank_end');
await waitSolved('P7');

/* P8 — cold start, skipping failed steps */
await goto('Z5');
for (const step of content.startSequence) {
  const r = await interact('P8', 'press', { step });
  check(`P8 accepts ${step}`, r.ok, r.message ?? '');
}
await waitSolved('P8');

/* P9 — survey: read faults + legend, then mark */
const faults = await read('read_faults');
check('P9 fault codes readable on flight deck', Array.isArray(faults.clusters));
await goto('Z6');
const legend = await read('read_legend');
check('P9 legend readable in a bay', Boolean(legend.legend));
await goto('Z5');
for (const { id } of faults.clusters) {
  const r = await interact('P9', 'mark', { clusterId: id, usable: content.usable.includes(id) });
  check(`P9 mark ${id}`, r.ok, r.message ?? '');
}
await waitSolved('P9');

/* P10 — cross-feed in pressure order */
for (const v of content.valveOrder) {
  await goto(v.includes('PORT') ? 'Z6' : 'Z7');
  const r = await interact('P10', 'open_valve', { valve: v });
  check(`P10 opens ${v}`, r.ok, r.message ?? '');
}
await waitSolved('P10');

/* P11 — key to station A (solo: one live station) */
await goto('Z5');
const r11a = await interact('P11', 'take_key', { keyId: 'key-1' });
check('P11 takes the flight deck key', r11a.ok);
await goto('Z6');
const r11b = await interact('P11', 'socket_key', { station: 'A' });
check('P11 sockets the key at A', r11b.ok);
await waitSolved('P11');

/* P12 — interlock from the flight deck display */
await goto('Z5');
const codes = await read('read_interlocks');
check('P12 codes readable on flight deck', Boolean(codes.codes?.A));
await goto('Z6');
const r12 = await interact('P12', 'enter_interlock', { station: 'A', code: codes.codes.A });
check('P12 clears the interlock', r12.ok, r12.message ?? '');
await waitSolved('P12');
await waitSolved('P13');

/* Asymmetry probe: interlocks must NOT be readable from a bay */
const denied = await read('read_interlocks');
check('interlock codes denied outside the flight deck', Boolean(denied.error));

/* P14 — two burn stages, solo station A */
const plan = generateManeuver(SEED, 1, 0);
for (let stageIdx = 0; stageIdx < plan.stages.length; stageIdx++) {
  const stage = plan.stages[stageIdx];
  const want = stage.settings.A;

  await goto('Z6');
  room.send('station.set', { station: 'A', thrustPct: want.thrustPct, gimbalDeg: want.gimbalDeg });
  await sleep(200);
  room.send('station.arm', { station: 'A', armed: true });
  await sleep(200);
  room.send('station.ignite', { station: 'A' });
  await sleep(stage.durationMs);
  room.send('station.release', { station: 'A' });
  await sleep(200);

  await goto('Z5');
  room.send('burn.execute');
  for (let i = 0; i < 100 && results.length <= stageIdx; i++) await sleep(50);
  const res = results[stageIdx];
  check(`stage ${stageIdx + 1} validates`, Boolean(res?.ok),
    res?.failures?.map((f) => f.message).join(' | ') ?? 'no result');
}

for (let i = 0; i < 100 && !sessionResult; i++) await sleep(50);
check('session result is ESCAPED', sessionResult?.result === 'escaped',
  JSON.stringify(sessionResult ?? {}));

console.log(`\nESCAPED with ${Math.round((sessionResult.timeRemainingMs) / 60000)} minutes remaining, ${sessionResult.hintsUsed} hints, ${sessionResult.attempts} burn attempt(s).`);
console.log('FULL PLAYTHROUGH PASSED');
await room.leave();
process.exit(0);
