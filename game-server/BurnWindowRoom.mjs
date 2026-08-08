import { Room } from 'colyseus';
import { Schema, MapSchema, ArraySchema, defineTypes } from '@colyseus/schema';
import {
  generateManeuver, validateBurn, scaleForPlayers, readinessView, SETBACK_MS, STATION_NAMES,
} from '../shared/burn.mjs';
import { generateContent, PuzzleEngine, DOOR_RULES } from '../rooms/burn-window/content/puzzles.mjs';

/* -------------------------------------------------------------------------- */
/* State schema                                                               */
/*                                                                            */
/* @colyseus/schema 3.x does not auto-instantiate MapSchema/ArraySchema       */
/* fields and will not encode undefined primitives, so every class            */
/* initialises its own fields.                                                */
/* -------------------------------------------------------------------------- */

class PlayerState extends Schema {
  constructor(init = {}) {
    super();
    this.seatId = init.seatId ?? '';
    this.displayName = init.displayName ?? 'Passenger';
    this.avatarPreset = init.avatarPreset ?? 'preset-01';
    this.zone = init.zone ?? 'Z1';
    this.x = 0; this.y = 0; this.z = 0; this.ry = 0;
    this.locomotion = 'idle';
    this.heldObject = '';
    this.voiceActive = false;
    this.connected = true;
    this.ready = false;
  }
}
defineTypes(PlayerState, {
  seatId: 'string',
  displayName: 'string',
  avatarPreset: 'string',
  zone: 'string',
  x: 'number', y: 'number', z: 'number', ry: 'number',
  locomotion: 'string',
  heldObject: 'string',
  voiceActive: 'boolean',
  connected: 'boolean',
  ready: 'boolean',
});

class StationState extends Schema {
  constructor(id = '') {
    super();
    this.id = id;
    this.powered = false;
    this.interlockCleared = false;
    this.armed = false;
    this.dialsTouched = false;
    this.thrustPct = 0;
    this.gimbalDeg = 0;
    this.holdStartMs = 0;
    this.holdEndMs = 0;
    this.operatorSeatId = '';
  }
}
defineTypes(StationState, {
  id: 'string',
  powered: 'boolean',
  interlockCleared: 'boolean',
  armed: 'boolean',
  dialsTouched: 'boolean',
  thrustPct: 'number',
  gimbalDeg: 'number',
  holdStartMs: 'number',
  holdEndMs: 'number',
  operatorSeatId: 'string',
});

class BurnState extends Schema {
  constructor() {
    super();
    this.attempt = 0;
    this.stageIndex = 0;
    this.stagesTotal = 0;
    this.windowOpen = false;
    this.lastResult = '';
    this.lastFailureSummary = '';
  }
}
defineTypes(BurnState, {
  attempt: 'number',
  stageIndex: 'number',
  stagesTotal: 'number',
  windowOpen: 'boolean',
  lastResult: 'string',
  lastFailureSummary: 'string',
});

class RoomState extends Schema {
  constructor() {
    super();
    this.phase = 'lobby';
    this.clockMsRemaining = 0;
    this.lockedPlayerCount = 0;
    this.seed = '';
    this.players = new MapSchema();
    this.stations = new MapSchema();
    this.solvedPuzzles = new ArraySchema();
    this.openDoors = new ArraySchema();
    this.burn = new BurnState();
    this.hintsUsed = 0;
    this.objective = 'Wait for your group, then everyone press READY.';
    this.act = 1;
    // Client-rendered public puzzle state, JSON-encoded. Never contains an answer —
    // see PuzzleEngine.publicState().
    this.puzzleJson = '{}';
  }
}
defineTypes(RoomState, {
  phase: 'string',
  clockMsRemaining: 'number',
  lockedPlayerCount: 'number',
  seed: 'string',
  players: { map: PlayerState },
  stations: { map: StationState },
  solvedPuzzles: ['string'],
  openDoors: ['string'],
  burn: BurnState,
  hintsUsed: 'number',
  objective: 'string',
  act: 'number',
  puzzleJson: 'string',
});

/* -------------------------------------------------------------------------- */
/* Room                                                                       */
/* -------------------------------------------------------------------------- */

const SESSION_MS = 60 * 60 * 1000;
const BRIEFING_MS = 12_000;
const TICK_MS = 250;
const VIEW_MS = 1000;

// Server-side pacing nudges (spec §8) — [minute, tier] against the frontier puzzle.
const PACING = [
  [14, 1],
  [24, 2],
  [32, 2],
  [47, 3],
];

export class BurnWindowRoom extends Room {
  maxClients = 8;

  onCreate(options) {
    this.setState(new RoomState());
    this.state.seed = options.seed ?? Math.random().toString(36).slice(2);
    this.state.clockMsRemaining = SESSION_MS;

    this.bookingId = options.bookingId ?? null;
    this.maneuver = null;        // server-only; never assigned into state
    this.engine = null;          // PuzzleEngine, created at start
    this.content = null;
    this.armSequence = [];
    this.clearedStations = [];
    this.startedAt = null;
    this.pacingFired = new Set();
    this.resultReported = false;

    this.onMessage('ready', (client) => this.onReady(client));
    this.onMessage('move', (client, m) => this.onMove(client, m));
    this.onMessage('chat', (client, m) => this.onChat(client, m));
    this.onMessage('interact', (client, m) => this.onInteract(client, m));
    this.onMessage('read', (client, m) => this.onRead(client, m));
    this.onMessage('hint.request', (client) => this.onHintRequest(client));
    this.onMessage('station.set', (client, m) => this.onStationSet(client, m));
    this.onMessage('station.arm', (client, m) => this.onStationArm(client, m));
    this.onMessage('station.ignite', (client, m) => this.onIgnite(client, m));
    this.onMessage('station.release', (client, m) => this.onRelease(client, m));
    this.onMessage('burn.execute', (client) => this.onExecuteBurn(client));

    this.setSimulationInterval(() => this.tick(), TICK_MS);
    this.viewTimer = this.clock.setInterval(() => this.sendRoleScopedViews(), VIEW_MS);
  }

  /* ---- membership ---- */

  onJoin(client, options = {}) {
    this.state.players.set(
      client.sessionId,
      new PlayerState({
        seatId: options.seatId ?? client.sessionId,
        displayName: String(options.displayName ?? 'Passenger').slice(0, 32),
        avatarPreset: options.avatarPreset ?? 'preset-01',
      }),
    );
    client.send('welcome', {
      sessionId: client.sessionId,
      phase: this.state.phase,
    });
  }

  async onLeave(client, consented) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;

    // Auto-safe any station this player was operating so the room stays winnable.
    this.state.stations.forEach((st) => {
      if (st.operatorSeatId === client.sessionId) {
        st.armed = false;
        st.operatorSeatId = '';
      }
    });

    if (consented) {
      this.state.players.delete(client.sessionId);
      return;
    }
    try {
      await this.allowReconnection(client, 120);
      const back = this.state.players.get(client.sessionId);
      if (back) back.connected = true;
    } catch {
      this.state.players.delete(client.sessionId);
    }
  }

  /* ---- lifecycle ---- */

  onReady(client) {
    if (this.state.phase !== 'lobby') return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.ready = true;

    const everyone = [...this.state.players.values()];
    if (everyone.length >= 1 && everyone.every((x) => x.ready)) this.startSession();
  }

  startSession() {
    const count = this.state.players.size;
    const { liveStations, stages } = scaleForPlayers(count);

    this.state.lockedPlayerCount = count;
    for (const id of liveStations) this.state.stations.set(id, new StationState(id));

    this.content = generateContent(this.state.seed, count);
    this.engine = new PuzzleEngine(
      this.content,
      () => this.state.players.size,
      () => this.sessionElapsed(),
      (event, payload) => this.onEngineEvent(event, payload),
    );

    this.maneuver = generateManeuver(this.state.seed, count, 0);
    this.state.burn.stagesTotal = stages;
    this.state.phase = 'briefing';
    this.startedAt = Date.now();

    this.broadcast('cass', {
      text:
        'CASS: Good morning. This is your Cabin Assistance and Safety System. You are aboard ' +
        'CSV Meridian, and I am required to inform you that the vehicle is outside its filed ' +
        'trajectory, the flight crew is not responding, and the return manoeuvre window closes ' +
        'in sixty minutes. Anterra Orbital thanks you for choosing the Blue Marble Loop.',
    });

    this.clock.setTimeout(() => {
      this.state.phase = 'active';
      this.pushPuzzleState();
    }, BRIEFING_MS);
  }

  sessionElapsed() {
    return this.startedAt ? Math.max(0, Date.now() - this.startedAt - BRIEFING_MS) : 0;
  }

  tick() {
    if (this.state.phase !== 'active') return;

    const elapsed = this.sessionElapsed();
    this.state.clockMsRemaining = Math.max(
      0,
      SESSION_MS - elapsed - this.state.burn.attempt * SETBACK_MS,
    );
    if (this.state.clockMsRemaining <= 0) return this.finish('failed');

    // Pacing nudges: unprompted CASS help when the group falls behind the spec's timeline.
    const minute = elapsed / 60000;
    for (const [atMin, tier] of PACING) {
      const key = `${atMin}`;
      if (minute >= atMin && !this.pacingFired.has(key)) {
        this.pacingFired.add(key);
        const frontier = this.engine?.frontier();
        if (frontier) {
          const h = this.engine.hint(frontier);
          if (h && h.tier <= tier) {
            this.state.hintsUsed++;
            this.broadcast('cass', { text: `CASS: ${h.text}`, hint: h });
          }
        }
      }
    }
  }

  finish(result) {
    if (this.state.phase === 'escaped' || this.state.phase === 'failed') return;
    this.state.phase = result;
    this.state.burn.windowOpen = false;

    const summary = {
      result,
      timeRemainingMs: this.state.clockMsRemaining,
      hintsUsed: this.state.hintsUsed,
      attempts: this.state.burn.attempt + 1,
      solved: this.engine ? [...this.engine.solved] : [],
      players: this.state.lockedPlayerCount,
    };
    this.broadcast('session.result', summary);
    this.reportResult(summary);
    this.clock.setTimeout(() => { this.state.phase = 'debrief'; }, 8000);
  }

  /** Best-effort: record the outcome in the application database via the web app. */
  async reportResult(summary) {
    if (this.resultReported) return;
    this.resultReported = true;
    const base = process.env.RESULT_WEBHOOK_URL;
    const secret = process.env.RESULT_WEBHOOK_SECRET;
    if (!base || !secret || !this.bookingId) return;
    try {
      await fetch(`${base}/api/session-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ bookingId: this.bookingId, seed: this.state.seed, ...summary }),
      });
    } catch {
      // The game outcome was already decided and broadcast; recording is best-effort.
    }
  }

  /* ---- engine events ---- */

  onEngineEvent(event, payload) {
    if (event === 'puzzle.solved') {
      if (!this.state.solvedPuzzles.includes(payload.puzzleId)) {
        this.state.solvedPuzzles.push(payload.puzzleId);
      }
      this.state.objective = payload.objective;
      this.state.act = payload.act;
      this.recomputeDoors();
      this.pushPuzzleState();
      this.broadcast('puzzle.solved', payload);

      if (payload.puzzleId === 'P12') this.state.burn.windowOpen = true;
      return;
    }
    if (event === 'cass') {
      this.broadcast('cass', payload);
    }
  }

  recomputeDoors() {
    const open = Object.entries(DOOR_RULES)
      .filter(([, needs]) => needs.every((p) => this.engine.isSolved(p)))
      .map(([door]) => door);
    this.state.openDoors.clear();
    for (const d of open) this.state.openDoors.push(d);
  }

  pushPuzzleState() {
    if (!this.engine) return;
    this.state.puzzleJson = JSON.stringify(this.engine.publicState());
    this.state.objective = this.engine.objective();
    this.state.act = this.engine.currentAct();
  }

  /* ---- movement / chat ---- */

  onMove(client, m) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.x = clamp(Number(m.x) || 0, -200, 200);
    p.y = clamp(Number(m.y) || 0, -50, 50);
    p.z = clamp(Number(m.z) || 0, -200, 200);
    p.ry = Number(m.ry) || 0;
    p.locomotion = ['idle', 'walk', 'inspect', 'carry', 'contextual'].includes(m.locomotion)
      ? m.locomotion : 'idle';
    if (typeof m.zone === 'string' && /^Z[1-8]$/.test(m.zone)) p.zone = m.zone;
    p.voiceActive = Boolean(m.voiceActive);
  }

  onChat(client, m) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const text = String(m?.text ?? '').slice(0, 300).trim();
    if (!text) return;
    this.broadcast('chat', { from: p.displayName, text, at: Date.now() });
  }

  /* ---- puzzle interaction ---- */

  onInteract(client, m) {
    if (this.state.phase !== 'active' || !this.engine) return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;

    const result = this.engine.input(
      String(m?.puzzleId ?? ''),
      String(m?.action ?? ''),
      m?.payload ?? {},
      { seatId: client.sessionId, zone: p.zone },
    );

    // Station side-effects from the key/interlock puzzles.
    if (result.poweredStation) {
      const st = this.state.stations.get(result.poweredStation);
      if (st) st.powered = true;
      this.engine.finishP11IfComplete([...this.state.stations.keys()]);
    }
    if (result.clearedStation) {
      const st = this.state.stations.get(result.clearedStation);
      if (st) st.interlockCleared = true;
      if (!this.clearedStations.includes(result.clearedStation)) {
        this.clearedStations.push(result.clearedStation);
      }
      this.engine.finishP12IfComplete(this.clearedStations, [...this.state.stations.keys()]);
    }

    this.pushPuzzleState();
    client.send('interact.result', {
      puzzleId: m?.puzzleId, action: m?.action,
      ok: result.ok, message: result.message ?? null,
      holders: result.holders, need: result.need,
    });
  }

  /** Zone-scoped reads — the asymmetric-information surface. */
  onRead(client, m) {
    if (!this.engine) return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const what = String(m?.what ?? '');
    const data = this.engine.privateFor(what, p.zone, [...this.state.stations.keys()]);
    client.send('read.result', { what, data });
  }

  onHintRequest(client) {
    if (!this.engine) {
      client.send('hint', { tier: 0, text: 'CASS: The session has not started.' });
      return;
    }
    const h = this.engine.hint();
    if (!h) {
      client.send('hint', { tier: 0, text: 'CASS: There is nothing left to hint at. Fly.' });
      return;
    }
    this.state.hintsUsed++;
    // Hints are for the whole team — CASS speaks to the cabin, not into one ear.
    this.broadcast('cass', { text: `CASS: ${h.text}`, hint: h });
  }

  /* ---- stations & burn (Act IV) ---- */

  stationForClient(client, stationId) {
    const p = this.state.players.get(client.sessionId);
    const st = this.state.stations.get(stationId);
    if (!p || !st) return null;
    const zoneFor = { A: 'Z6', B: 'Z7', C: 'Z8' };
    if (p.zone !== zoneFor[stationId]) {
      client.send('error', { message: `You are not at ${STATION_NAMES[stationId]}.` });
      return null;
    }
    return st;
  }

  onStationSet(client, m) {
    if (this.state.phase !== 'active' || !this.state.burn.windowOpen) return;
    const st = this.stationForClient(client, m.station);
    if (!st) return;
    if (!st.powered || !st.interlockCleared) {
      client.send('error', { message: 'The station is not powered and cleared yet.' });
      return;
    }
    if (st.armed) {
      client.send('error', { message: 'Station is armed. Safe it before changing settings.' });
      return;
    }
    st.thrustPct = clamp(Number(m.thrustPct) || 0, 0, 100);
    st.gimbalDeg = clamp(Number(m.gimbalDeg) || 0, -25, 25);
    st.dialsTouched = true;
    st.operatorSeatId = client.sessionId;
  }

  onStationArm(client, m) {
    if (this.state.phase !== 'active' || !this.state.burn.windowOpen) return;
    const st = this.stationForClient(client, m.station);
    if (!st) return;
    if (!st.powered || !st.interlockCleared) {
      client.send('error', { message: 'Interlock has not been cleared at this station.' });
      return;
    }
    st.armed = Boolean(m.armed);
    if (st.armed) {
      if (!this.armSequence.includes(st.id)) this.armSequence.push(st.id);
    } else {
      this.armSequence = this.armSequence.filter((id) => id !== st.id);
    }
  }

  onIgnite(client, m) {
    if (this.state.phase !== 'active') return;
    const st = this.stationForClient(client, m.station);
    if (!st || !st.armed) return;
    st.holdStartMs = Date.now();
    st.holdEndMs = 0;
  }

  onRelease(client, m) {
    if (this.state.phase !== 'active') return;
    const st = this.stationForClient(client, m.station);
    if (!st || !st.holdStartMs) return;
    st.holdEndMs = Date.now();
  }

  onExecuteBurn(client) {
    if (this.state.phase !== 'active' || !this.maneuver || !this.state.burn.windowOpen) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.zone !== 'Z5') {
      client.send('error', { message: 'Only the flight deck can commit the manoeuvre.' });
      return;
    }

    const stage = this.maneuver.stages[this.state.burn.stageIndex];
    const live = [...this.state.stations.keys()];

    const attempt = { armedOrder: [...this.armSequence], stations: {} };
    for (const id of live) {
      const st = this.state.stations.get(id);
      if (!st || !st.holdStartMs || !st.holdEndMs) continue;
      attempt.stations[id] = {
        thrustPct: st.thrustPct,
        gimbalDeg: st.gimbalDeg,
        holdStartMs: st.holdStartMs,
        holdEndMs: st.holdEndMs,
      };
    }

    const result = validateBurn(stage, attempt, live);
    this.broadcast('burn.result', {
      stageIndex: stage.index,
      ok: result.ok,
      failures: result.failures,
      detail: result.detail,
    });

    if (result.ok) {
      this.state.burn.lastResult = 'stage-complete';
      this.state.burn.lastFailureSummary = '';
      this.state.burn.stageIndex += 1;
      this.resetStations();
      this.broadcast('cass', {
        text: `CASS: Stage ${stage.index + 1} confirmed. Trajectory improving.`,
      });
      if (this.state.burn.stageIndex >= this.maneuver.stages.length) this.finish('escaped');
    } else {
      // A failure regenerates the plan so retrying is never brute force (spec D-04).
      this.state.burn.attempt += 1;
      this.state.burn.lastResult = 'setback';
      this.state.burn.lastFailureSummary = result.failures.map((f) => f.message).join(' ');
      this.maneuver = generateManeuver(this.state.seed, this.state.lockedPlayerCount, this.state.burn.attempt);
      this.state.burn.stageIndex = 0;
      this.resetStations();
      this.broadcast('cass', {
        text: 'CASS: The attempt did not validate. The computer is issuing a fresh solution — the old numbers are void.',
      });
    }
  }

  resetStations() {
    this.armSequence = [];
    this.state.stations.forEach((st) => {
      st.armed = false;
      st.holdStartMs = 0;
      st.holdEndMs = 0;
    });
  }

  /**
   * ASYMMETRIC INFORMATION ENFORCEMENT.
   *
   * The manoeuvre plan is pushed only to clients whose player is on the flight deck. Station
   * panel values go only to the client physically at that station. If this leaks, the game's
   * central mechanic is gone.
   */
  sendRoleScopedViews() {
    if (!this.maneuver || this.state.phase !== 'active' || !this.state.burn.windowOpen) return;
    const stage = this.maneuver.stages[this.state.burn.stageIndex];
    if (!stage) return;

    for (const client of this.clients) {
      const p = this.state.players.get(client.sessionId);
      if (!p) continue;

      if (p.zone === 'Z5') {
        const readiness = {};
        this.state.stations.forEach((st, id) => { readiness[id] = readinessView(st); });
        client.send('cockpit.view', {
          stage: {
            index: stage.index,
            label: stage.label,
            armingOrder: stage.armingOrder,
            settings: stage.settings,
            durationMs: stage.durationMs,
          },
          stagesTotal: this.maneuver.stages.length,
          readiness,
        });
      } else {
        const zoneToStation = { Z6: 'A', Z7: 'B', Z8: 'C' };
        const id = zoneToStation[p.zone];
        if (!id) continue;
        const st = this.state.stations.get(id);
        if (!st) continue;
        client.send('station.view', {
          station: id,
          name: STATION_NAMES[id],
          powered: st.powered,
          interlockCleared: st.interlockCleared,
          armed: st.armed,
          thrustPct: st.thrustPct,
          gimbalDeg: st.gimbalDeg,
          // Deliberately absent: the commanded values. Someone says them out loud.
        });
      }
    }
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
