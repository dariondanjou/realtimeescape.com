import { Room } from 'colyseus';
import { Schema, MapSchema, ArraySchema, type, defineTypes } from '@colyseus/schema';
import {
  generateManeuver, validateBurn, scaleForPlayers, readinessView, SETBACK_MS, STATION_NAMES,
} from '../shared/burn.mjs';

/* -------------------------------------------------------------------------- */
/* State schema                                                               */
/* -------------------------------------------------------------------------- */

class PlayerState extends Schema {}
defineTypes(PlayerState, {
  seatId: 'string',
  displayName: 'string',
  avatarPreset: 'string',
  zone: 'string',        // Z1..Z8
  x: 'number', y: 'number', z: 'number', ry: 'number',
  locomotion: 'string',  // idle | walk | inspect | carry | contextual
  heldObject: 'string',
  voiceActive: 'boolean',
  connected: 'boolean',
});

class StationState extends Schema {}
defineTypes(StationState, {
  id: 'string',
  powered: 'boolean',
  interlockCleared: 'boolean',
  armed: 'boolean',
  dialsTouched: 'boolean',
  // Panel values are NOT replicated to every client — see filterState below.
  thrustPct: 'number',
  gimbalDeg: 'number',
  holdStartMs: 'number',
  holdEndMs: 'number',
  operatorSeatId: 'string',
});

class BurnState extends Schema {}
defineTypes(BurnState, {
  attempt: 'number',
  stageIndex: 'number',
  stagesTotal: 'number',
  windowOpen: 'boolean',
  lastResult: 'string',
  lastFailureSummary: 'string',
});

class RoomState extends Schema {}
defineTypes(RoomState, {
  phase: 'string',              // lobby | briefing | active | escaped | failed | debrief
  clockMsRemaining: 'number',
  lockedPlayerCount: 'number',
  seed: 'string',
  players: { map: PlayerState },
  stations: { map: StationState },
  solvedPuzzles: ['string'],
  burn: BurnState,
  hintsUsed: 'number',
});

/* -------------------------------------------------------------------------- */
/* Room                                                                       */
/* -------------------------------------------------------------------------- */

const SESSION_MS = 60 * 60 * 1000;
const TICK_MS = 250;

export class BurnWindowRoom extends Room {
  maxClients = 8;

  onCreate(options) {
    this.setState(new RoomState());
    this.state.phase = 'lobby';
    this.state.seed = options.seed ?? Math.random().toString(36).slice(2);
    this.state.clockMsRemaining = SESSION_MS;
    this.state.hintsUsed = 0;
    this.state.burn = new BurnState();
    this.state.burn.attempt = 0;
    this.state.burn.stageIndex = 0;
    this.state.burn.windowOpen = false;
    this.state.burn.lastResult = '';

    this.bookingId = options.bookingId ?? null;
    this.maneuver = null;       // server-only; never assigned into state
    this.pendingHolds = {};
    this.startedAt = null;

    this.onMessage('move', (client, m) => this.onMove(client, m));
    this.onMessage('station.set', (client, m) => this.onStationSet(client, m));
    this.onMessage('station.arm', (client, m) => this.onStationArm(client, m));
    this.onMessage('station.ignite', (client, m) => this.onIgnite(client, m));
    this.onMessage('station.release', (client, m) => this.onRelease(client, m));
    this.onMessage('burn.execute', (client) => this.onExecuteBurn(client));
    this.onMessage('hint.request', (client) => this.onHintRequest(client));
    this.onMessage('session.start', (client) => this.onStart(client));

    this.setSimulationInterval(() => this.tick(), TICK_MS);
  }

  /* ---- membership ---- */

  onJoin(client, options) {
    const p = new PlayerState();
    p.seatId = options.seatId ?? client.sessionId;
    p.displayName = String(options.displayName ?? 'Passenger').slice(0, 32);
    p.avatarPreset = options.avatarPreset ?? 'preset-01';
    p.zone = 'Z1';
    p.x = 0; p.y = 0; p.z = 0; p.ry = 0;
    p.locomotion = 'idle';
    p.heldObject = '';
    p.voiceActive = false;
    p.connected = true;
    this.state.players.set(client.sessionId, p);
  }

  /**
   * A disconnect never pauses the team clock (spec §9). The seat is held so the player can
   * reclaim it; any exclusive lease they held is released after a grace period.
   */
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

  onStart(client) {
    if (this.state.phase !== 'lobby') return;

    const count = this.state.players.size;
    if (count < 3) {
      client.send('error', { message: 'Burn Window needs at least three players.' });
      return;
    }

    const { liveStations, stages } = scaleForPlayers(count);
    this.state.lockedPlayerCount = count;

    for (const id of liveStations) {
      const st = new StationState();
      st.id = id;
      st.powered = false;
      st.interlockCleared = false;
      st.armed = false;
      st.dialsTouched = false;
      st.thrustPct = 0;
      st.gimbalDeg = 0;
      st.holdStartMs = 0;
      st.holdEndMs = 0;
      st.operatorSeatId = '';
      this.state.stations.set(id, st);
    }

    this.maneuver = generateManeuver(this.state.seed, count, 0);
    this.state.burn.stagesTotal = stages;
    this.state.burn.stageIndex = 0;
    this.state.burn.attempt = 0;
    this.state.phase = 'briefing';
    this.startedAt = Date.now();

    this.clock.setTimeout(() => {
      this.state.phase = 'active';
      this.state.burn.windowOpen = true;
    }, 25_000); // authored briefing cinematic length
  }

  tick() {
    if (this.state.phase !== 'active') return;

    const elapsed = Date.now() - this.startedAt - 25_000;
    this.state.clockMsRemaining = Math.max(0, SESSION_MS - elapsed - this.penaltyMs());

    if (this.state.clockMsRemaining <= 0) this.finish('failed');
  }

  penaltyMs() {
    return (this.state.burn.attempt ?? 0) * SETBACK_MS;
  }

  finish(result) {
    this.state.phase = result;
    this.state.burn.windowOpen = false;
    this.broadcast('session.result', {
      result,
      timeRemainingMs: this.state.clockMsRemaining,
      hintsUsed: this.state.hintsUsed,
      attempts: this.state.burn.attempt + 1,
    });
    this.clock.setTimeout(() => { this.state.phase = 'debrief'; }, 8000);
  }

  /* ---- movement ---- */

  onMove(client, m) {
    const p = this.state.players.get(client.sessionId);
    if (!p || this.state.phase !== 'active') return;

    // Cheap sanity clamp. Full navmesh validation is PLANNED with the real level.
    p.x = clamp(Number(m.x) || 0, -200, 200);
    p.y = clamp(Number(m.y) || 0, -50, 50);
    p.z = clamp(Number(m.z) || 0, -200, 200);
    p.ry = Number(m.ry) || 0;
    p.locomotion = ['idle', 'walk', 'inspect', 'carry', 'contextual'].includes(m.locomotion)
      ? m.locomotion : 'idle';
    if (typeof m.zone === 'string' && /^Z[1-8]$/.test(m.zone)) p.zone = m.zone;
    p.voiceActive = Boolean(m.voiceActive);
  }

  /* ---- stations ---- */

  stationForClient(client, stationId) {
    const p = this.state.players.get(client.sessionId);
    const st = this.state.stations.get(stationId);
    if (!p || !st) return null;

    // A player must physically be in the station's bay to touch it.
    const zoneFor = { A: 'Z6', B: 'Z7', C: 'Z8' };
    if (p.zone !== zoneFor[stationId]) {
      client.send('error', { message: `You are not at ${STATION_NAMES[stationId]}.` });
      return null;
    }
    return st;
  }

  onStationSet(client, m) {
    if (this.state.phase !== 'active') return;
    const st = this.stationForClient(client, m.station);
    if (!st) return;
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
    if (this.state.phase !== 'active') return;
    const st = this.stationForClient(client, m.station);
    if (!st) return;
    if (!st.powered || !st.interlockCleared) {
      client.send('error', { message: 'Interlock has not been cleared at this station.' });
      return;
    }

    st.armed = Boolean(m.armed);
    if (st.armed) {
      this.armSequence = this.armSequence ?? [];
      if (!this.armSequence.includes(st.id)) this.armSequence.push(st.id);
    } else {
      this.armSequence = (this.armSequence ?? []).filter((id) => id !== st.id);
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

  /**
   * The navigator commits the attempt. Validation happens here and nowhere else — a client
   * cannot declare its own success.
   */
  onExecuteBurn(client) {
    if (this.state.phase !== 'active' || !this.maneuver) return;

    const p = this.state.players.get(client.sessionId);
    if (!p || p.zone !== 'Z5') {
      client.send('error', { message: 'Only the flight deck can commit the maneuver.' });
      return;
    }

    const stage = this.maneuver.stages[this.state.burn.stageIndex];
    const live = this.maneuver.liveStations;

    const attempt = { armedOrder: this.armSequence ?? [], stations: {} };
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

      if (this.state.burn.stageIndex >= this.maneuver.stages.length) {
        this.finish('escaped');
      }
    } else {
      // A failure regenerates the plan so retrying is never brute force (spec D-04).
      this.state.burn.attempt += 1;
      this.state.burn.lastResult = 'setback';
      this.state.burn.lastFailureSummary = result.failures.map((f) => f.message).join(' ');
      this.maneuver = generateManeuver(this.state.seed, this.state.lockedPlayerCount, this.state.burn.attempt);
      this.state.burn.stageIndex = 0;
      this.resetStations();
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

  onHintRequest(client) {
    this.state.hintsUsed += 1;
    // Deterministic hint selection lives in the hint engine; see docs/OPERATOR_AND_HINTS.md.
    client.send('hint', { tier: 1, text: 'CASS is reviewing the cabin status. Stand by.' });
  }

  /**
   * ASYMMETRIC INFORMATION ENFORCEMENT.
   *
   * The maneuver plan is server-only and is pushed only to clients whose player is on the
   * flight deck. Station panel values are pushed only to the client at that station. This is
   * the mechanic; if it leaks, the game is over.
   */
  sendRoleScopedViews() {
    if (!this.maneuver) return;
    const stage = this.maneuver.stages[this.state.burn.stageIndex];

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
          // Deliberately absent: the commanded values. Someone has to say them out loud.
        });
      }
    }
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
