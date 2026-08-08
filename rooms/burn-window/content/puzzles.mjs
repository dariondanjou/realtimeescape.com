/**
 * Burn Window — the fourteen puzzles, as authoritative server logic.
 *
 * Implements docs/BURN_WINDOW_GAME_SPEC.md §4–§7: the dependency graph P1→P14, per-session
 * randomization from one seed, three-tier hint ladders, and solo/small-party fallbacks so a
 * demo session can never soft-lock.
 *
 * Design rules carried from the spec:
 *   - The server owns truth. Everything here runs inside the Colyseus room; the client only
 *     ever sees `publicState()` output and zone-scoped `privateFor()` answers.
 *   - Randomization can never deal an impossible hand — every generated value is checked at
 *     generation time.
 *   - Multi-person requirements degrade by player count (requirement = min(design, players)),
 *     so one tester can walk the whole room.
 */

import { rng } from '../../../shared/burn.mjs';

/* ---------------------------------------------------------------------------------------- */
/* Session content generation                                                               */
/* ---------------------------------------------------------------------------------------- */

export function generateContent(seed, playerCount) {
  const rand = rng(`${seed}:content`);
  const digit = () => Math.floor(rand() * 10);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // P2 — breakers. Six breakers; the heater must be opened before comms + lighting close.
  const heaterIdx = Math.floor(rand() * 6);
  let commsIdx = Math.floor(rand() * 6);
  while (commsIdx === heaterIdx) commsIdx = Math.floor(rand() * 6);
  let lightIdx = Math.floor(rand() * 6);
  while (lightIdx === heaterIdx || lightIdx === commsIdx) lightIdx = Math.floor(rand() * 6);

  // P3 — lounge door code, assembled from four scattered fragments.
  const doorCode = `${digit()}${digit()}${digit()}${digit()}`;
  const order = shuffle([0, 1, 2, 3]);

  // P4 — pressure band.
  const pressureTarget = 62 + Math.floor(rand() * 25); // 62–86
  const pressureBand = 4;

  // P5 — galley locker combination, stencilled inside the hatch.
  const galleyCombo = `${digit()}${digit()}${digit()}`;

  // P6 — crew locker: ticket number read in the order of checklist initials.
  const ticket = `${1 + Math.floor(rand() * 8)}${digit()}${digit()}${digit()}`;
  const initialsFirst = rand() < 0.5; // which crew member signed first
  const crewCombo = initialsFirst ? ticket : [...ticket].reverse().join('');

  // P8 — cold start: printed six-step sequence, two steps fail self-test and must be skipped.
  const steps = shuffle(['FUEL CELL', 'IMU ALIGN', 'BUS TIE', 'NAV CORE', 'COMM LINK', 'THERMAL']);
  const failA = Math.floor(rand() * 6);
  let failB = Math.floor(rand() * 6);
  while (failB === failA) failB = Math.floor(rand() * 6);
  const failedSteps = [steps[failA], steps[failB]];
  const startSequence = steps.filter((s) => !failedSteps.includes(s));

  // P9 — damage survey. Which clusters survive is constrained to match the live stations.
  const clusterIds = ['PX-1', 'PX-2', 'SB-3', 'SB-4'];
  const stationsForCount = playerCount <= 1 ? 1 : playerCount === 2 ? 2 : playerCount >= 5 ? 3 : 2;
  const usable = shuffle(clusterIds).slice(0, stationsForCount);
  const faultCodes = {};
  const legend = {};
  const codes = shuffle(['KRV', 'TLX', 'MDA', 'FRO', 'ZEP', 'QIN', 'HUV', 'BEX']);
  clusterIds.forEach((c, i) => {
    faultCodes[c] = codes[i];
    legend[codes[i]] = usable.includes(c) ? 'NOMINAL — CLEARED FOR MANUAL BURN' : 'UNRECOVERABLE — DO NOT ARM';
  });

  // P10 — cross-feed valve order, driven by seeded tank pressures.
  const valves = ['XF-PORT-1', 'XF-PORT-2', 'XF-STBD-1'];
  const valveOrder = shuffle(valves);
  const coldValve = 'XF-STBD-1'; // needs the EVA glove

  // P12 — interlock codes, one per station.
  const interlocks = {};
  for (const st of ['A', 'B', 'C']) {
    interlocks[st] = `${digit()}${digit()}${digit()}${digit()}`;
  }

  return {
    heaterIdx, commsIdx, lightIdx,
    doorCode, order,
    pressureTarget, pressureBand,
    galleyCombo,
    ticket, initialsFirst, crewCombo,
    steps, failedSteps, startSequence,
    faultCodes, legend, usable,
    valveOrder, coldValve,
    interlocks,
  };
}

/* ---------------------------------------------------------------------------------------- */
/* Static hint ladders (spec §5) — tier 3 never states a generated value                     */
/* ---------------------------------------------------------------------------------------- */

export const HINTS = {
  P1: [
    'Anterra reminds passengers that the safety card is located in the seat pocket ahead of them.',
    'Manual restraint release is a paired operation. Please coordinate with the passenger beside you.',
    'Hold the release in your armrest. Your neighbour must hold theirs at the same time.',
  ],
  P2: [
    'Cabin power is available but the distribution bus is unbalanced.',
    'The placard beside the panel describes a load rule. Something must be shed before something else can be restored.',
    'Open the cabin heater breaker first. Then close comms, then lighting.',
  ],
  P3: [
    'The maintenance lock accepts a four-digit code. Anterra does not print codes on doors.',
    'Your boarding documents and the cabin placards each carry part of a flight identifier. Compare what each of you is looking at.',
    'Four items in this cabin each carry one piece: a boarding pass, a seat-block placard, an itinerary card, and a maintenance notice giving the order.',
  ],
  P4: [
    'Hatch actuation is inhibited across a pressure differential.',
    'The equalisation valve and its gauge are not in the same place. Someone will have to read the number out loud.',
    'Turn the valve slowly toward the target band and stop when the gauge reads inside it.',
  ],
  P5: [
    'Galley stowage is combination-locked, as is standard for tools in a passenger cabin.',
    'Anterra crews stencil service combinations where a passenger would not think to look — inside things, not on them.',
    'Open the galley service hatch and read inside it.',
  ],
  P6: [
    'Crew lockers use personal combinations, not flight codes.',
    'Something in the maintenance record is numbered. Something else in the checklist tells you what order to read it in.',
    'The gripe ticket number, read in the order the checklist was initialled, opens the locker.',
  ],
  P7: [
    'The flight deck hatch requires crew authorisation and manual force.',
    'The token fits the socket, but on emergency power the hatch will not drive itself.',
    'Both crank arms must be worked at the same time, in phase, until the hatch releases.',
  ],
  P8: [
    'The navigation computer is in a safe state and must be cold-started.',
    'The printed procedure is a starting point, not gospel. Watch what the console reports about each subsystem.',
    'Follow the printed order, but skip any subsystem the console marks as failing self-test.',
  ],
  P9: [
    'The schematic shows fault codes. It does not show what they mean.',
    'The legend for those codes is not on the flight deck. It is where the machinery is.',
    'Someone at a thruster bay must read the legend card aloud while the flight deck marks each cluster.',
  ],
  P10: [
    'Cross-feed is a sequenced operation. Tank pressures determine the sequence.',
    'Only the flight deck can see tank pressure, and it changes as each valve opens. Call the next valve, not all of them.',
    'One of the valves is cold-soaked and cannot be touched bare-handed. There is a glove in the galley stowage.',
  ],
  P11: [
    'Manual override requires a physical key at every live station.',
    'The keys are burnt orange. You have been walking past that colour all hour.',
    'One key is racked on the flight deck; the rest are in the galley EVA locker. Carry one to each live bay and socket it.',
  ],
  P12: [
    'Each station has an ignition interlock, and each interlock has its own code.',
    'The codes are displayed on the flight deck only. The panels are in the bays. That is the point.',
    'Have the flight deck read each station its own code while the operator enters it.',
  ],
  P13: [
    'The flight computer has the burn solution. It is only on the flight deck.',
    'The computer names clusters; the panels use bay-local labels. The legend cards translate.',
    'Nothing transmits those numbers to the bays. A person says them out loud. That is the game.',
  ],
  P14: [
    'The window is still open. Configure, arm in the called order, then ignite together and hold.',
    'A failed attempt regenerates the solution — re-read the new numbers before trying again.',
    'Set thrust and gimbal first, arm in the exact order called, count down out loud, and hold until the commanded duration has elapsed.',
  ],
};

/** Which puzzles unlock which doors (client renders doors from the solved list). */
export const DOOR_RULES = {
  d_lounge: ['P3', 'P4'],      // lounge → corridor: keypad AND pressure
  d_flightdeck: ['P7'],        // corridor → flight deck
  d_bays: ['P9'],              // flight deck → thruster bays
};

/** Ordered graph — a puzzle is available when all prerequisites are solved. */
export const PREREQS = {
  P1: [],
  P2: [],
  P3: ['P1', 'P2'],
  P4: ['P3'],
  P5: ['P4'],
  P6: ['P4'],
  P7: ['P5', 'P6'],
  P8: ['P7'],
  P9: ['P8'],
  P10: ['P9'],
  P11: ['P9', 'P10'],
  P12: ['P11'],
  P13: ['P12'],
  P14: ['P13'],
};

export const ACT_FOR = {
  P1: 1, P2: 1, P3: 1,
  P4: 2, P5: 2, P6: 2, P7: 2,
  P8: 3, P9: 3, P10: 3, P11: 3, P12: 3,
  P13: 4, P14: 4,
};

export const OBJECTIVES = {
  P1: 'Get out of your restraints.',
  P2: 'Restore cabin power at the breaker panel.',
  P3: 'Find the lounge door code — it is scattered around the cabin.',
  P4: 'Equalise pressure so the corridor hatch will open.',
  P5: 'Search the galley stowage for tools.',
  P6: 'The crew quarters may explain what happened.',
  P7: 'Open the flight deck.',
  P8: 'Cold-start the navigation computer.',
  P9: 'Survey the thruster clusters — which ones survived?',
  P10: 'Get propellant to the surviving clusters.',
  P11: 'Carry an override key to every live station.',
  P12: 'Clear each station’s ignition interlock.',
  P13: 'The flight computer has the burn solution. Read it.',
  P14: 'Execute the synchronised burn before the window closes.',
};

/* ---------------------------------------------------------------------------------------- */
/* Puzzle state machine                                                                     */
/* ---------------------------------------------------------------------------------------- */

const REQUIRED_ZONE = {
  // action → zone requirement, checked server-side (spec: you must be at a thing to touch it)
  P2: 'Z1', P3: 'Z1',
  P5: 'Z3', P6: 'Z4', P8: 'Z5', P9_mark: 'Z5',
};

export class PuzzleEngine {
  /**
   * @param content   output of generateContent
   * @param players   () => number of connected players (for scaled requirements)
   * @param now       () => ms since session start
   * @param emit      (event, payload, opts?) => void  — opts.zone targets a zone, opts.solved
   */
  constructor(content, players, now, emit) {
    this.c = content;
    this.players = players;
    this.now = now;
    this.emit = emit;

    this.solved = new Set();
    this.s = {
      // P1
      restraints: {},          // seatId -> { released, holdStart }
      // P2 — the heater starts LOADED (closed); comms and lighting start tripped (open).
      // Shedding the heater before restoring the loads is the puzzle.
      breakers: Array.from({ length: 6 }, (_, i) => ({
        closed: i === content.heaterIdx
          ? true
          : ![content.commsIdx, content.lightIdx].includes(i),
      })),
      busLockedUntil: 0,
      // P4
      pressure: 20,
      ventLockedUntil: 0,
      // P7
      tokenSocketed: false,
      cranks: {},              // seatId -> holdStart
      crankDoneAt: 0,
      // P8
      startProgress: [],
      startLockedUntil: 0,
      // P9
      marks: {},               // clusterId -> bool
      // P10
      valvesOpen: [],
      valveLockedUntil: {},
      // P11
      keysHeld: {},            // keyId -> seatId
      keysSocketed: [],        // station ids
      // inventory (team-wide)
      inventory: new Set(),
      hintsGiven: {},          // puzzleId -> tier count
      lastProgressAt: 0,
    };
  }

  isSolved(id) { return this.solved.has(id); }

  available(id) {
    return !this.isSolved(id) && (PREREQS[id] ?? []).every((p) => this.solved.has(p));
  }

  /** The puzzle the hint engine should talk about: first unsolved, all prereqs met. */
  frontier() {
    for (const id of Object.keys(PREREQS)) {
      if (this.available(id)) return id;
    }
    return null;
  }

  currentAct() {
    const f = this.frontier();
    return f ? ACT_FOR[f] : 4;
  }

  objective() {
    const f = this.frontier();
    return f ? OBJECTIVES[f] : OBJECTIVES.P14;
  }

  markSolved(id, cassLine) {
    if (this.solved.has(id)) return;
    this.solved.add(id);
    this.s.lastProgressAt = this.now();
    this.emit('puzzle.solved', { puzzleId: id, objective: this.objective(), act: this.currentAct() });
    if (cassLine) this.emit('cass', { text: cassLine });
  }

  /** Multi-person requirements shrink to the party size so nothing can soft-lock. */
  needed(designCount) {
    return Math.max(1, Math.min(designCount, this.players()));
  }

  /* ---- client-visible state (never contains an answer) ---- */

  publicState() {
    return {
      solved: [...this.solved],
      objective: this.objective(),
      act: this.currentAct(),
      restraintsReleased: Object.fromEntries(
        Object.entries(this.s.restraints).map(([k, v]) => [k, Boolean(v.released)]),
      ),
      breakers: this.s.breakers.map((b) => b.closed),
      busLocked: this.now() < this.s.busLockedUntil,
      pressure: Math.round(this.s.pressure),
      tokenSocketed: this.s.tokenSocketed,
      startProgress: this.s.startProgress,
      startLocked: this.now() < this.s.startLockedUntil,
      marks: this.s.marks,
      valvesOpen: this.s.valvesOpen,
      keysHeld: this.s.keysHeld,
      keysSocketed: this.s.keysSocketed,
      inventory: [...this.s.inventory],
    };
  }

  /* ---- zone-scoped reads: the asymmetric information rules live here ---- */

  privateFor(action, zone, liveStations) {
    const c = this.c;
    switch (action) {
      case 'read_fragment_pass':
        return { text: `BOARDING — FLIGHT AO-1${c.doorCode[c.order.indexOf(0)]}${c.doorCode[c.order.indexOf(1)]} · seat block C` };
      case 'read_fragment_placard':
        return { text: `SEAT BLOCK C — ROW ${c.doorCode[c.order.indexOf(2)]}` };
      case 'read_fragment_itinerary':
        return { text: `DEPARTURE DAY ${c.doorCode[c.order.indexOf(3)]} — Blue Marble Loop itinerary` };
      case 'read_fragment_notice':
        return {
          text:
            'ANTERRA MAINTENANCE NOTICE: door codes are composed as ' +
            `[flight digits ${c.order.indexOf(0) + 1} and ${c.order.indexOf(1) + 1}] ` +
            `[row digit ${c.order.indexOf(2) + 1}] [day digit ${c.order.indexOf(3) + 1}] — positions refer to the CODE, not the source.`,
        };
      case 'read_breaker_placard':
        return { text: `BUS RULE: shed CABIN HEATER (breaker ${c.heaterIdx + 1}) before restoring COMMS (${c.commsIdx + 1}) and LIGHTING (${c.lightIdx + 1}).` };
      case 'read_gauge':
        // The gauge port is physically at the aft door; the client only shows this panel there.
        return { value: Math.round(this.s.pressure), target: null }; // target NOT included — it is on the valve placard
      case 'read_valve_placard':
        return { text: `EQUALISE TO ${c.pressureTarget} kPa ± ${c.pressureBand}. Overshoot vents the manifold.` };
      case 'read_galley_hatch':
        return this.isSolved('P4') ? { text: `Service combination: ${c.galleyCombo}` } : { text: 'The hatch is stuck fast until pressure equalises.' };
      case 'read_crew_log':
        return {
          entries: [
            `MAINT GRIPE #${c.ticket} — environmental loop pressure transient on ascent. Closed: no fault found.`,
            `MAINT GRIPE #${c.ticket} — resubmitted. Closed: duplicate.`,
            'Personal: tell M. I will call after the burn.',
          ],
          checklist: c.initialsFirst
            ? 'ASCENT CHECKLIST — initialled: R.O. then D.V. (read numbers forward)'
            : 'ASCENT CHECKLIST — initialled: D.V. then R.O. (read numbers in reverse)',
        };
      case 'read_faults':
        if (zone !== 'Z5') return { error: 'The schematic is on the flight deck.' };
        return { clusters: Object.entries(c.faultCodes).map(([id, code]) => ({ id, code })) };
      case 'read_legend':
        if (!['Z6', 'Z7', 'Z8'].includes(zone)) return { error: 'The legend cards are in the thruster bays.' };
        return { legend: c.legend };
      case 'read_pressures': {
        if (zone !== 'Z5') return { error: 'Tank pressures are a flight deck display.' };
        // The next correct valve always shows the highest pressure — the readout changes as
        // valves open, which is what forces call-and-response rather than a read-once list.
        const remaining = c.valveOrder.filter((v) => !this.s.valvesOpen.includes(v));
        const rows = c.valveOrder.map((v) => ({
          valve: v,
          open: this.s.valvesOpen.includes(v),
          pressure: this.s.valvesOpen.includes(v) ? 0 : 180 - remaining.indexOf(v) * 40,
        }));
        return { tanks: rows, note: 'Open the highest-pressure feed first. Order changes as pressures fall.' };
      }
      case 'read_interlocks':
        if (zone !== 'Z5') return { error: 'Interlock codes display on the flight deck only.' };
        return { codes: Object.fromEntries(liveStations.map((s) => [s, c.interlocks[s]])) };
      default:
        return { error: 'Nothing to read.' };
    }
  }

  /* ---- inputs ---- */

  /**
   * Handles a puzzle input. Returns { ok, message?, cass? } — cass lines ride back to
   * everyone through the room's emit.
   */
  input(puzzleId, action, payload, ctx) {
    const { seatId, zone } = ctx;
    const c = this.c;
    const now = this.now();

    switch (puzzleId) {
      /* -------- P1 restraints -------- */
      case 'P1': {
        if (this.isSolved('P1')) return { ok: true };
        const r = (this.s.restraints[seatId] ??= { released: false, holdStart: 0 });
        if (action === 'hold_start') { r.holdStart = now; return { ok: true }; }
        if (action === 'hold_end') {
          const held = now - r.holdStart;
          r.holdStart = 0;
          const solo = this.players() === 1;
          if (solo) {
            if (held >= 2500) r.released = true;
          } else {
            // Paired: someone else must have been holding at the same time.
            const overlapping = Object.entries(this.s.restraints)
              .some(([id, o]) => id !== seatId && o.holdStart > 0);
            if (held >= 1500 && overlapping) {
              r.released = true;
              // The partner still holding gets released too — that is the pairing.
              for (const [id, o] of Object.entries(this.s.restraints)) {
                if (id !== seatId && o.holdStart > 0) o.released = true;
              }
            } else if (held >= 1500) {
              return { ok: false, message: 'The lever moves but the catch holds. It wants a second lever held at the same time.' };
            }
          }
          const releasedCount = Object.values(this.s.restraints).filter((x) => x.released).length;
          if (releasedCount >= this.players()) {
            this.markSolved('P1', 'CASS: Restraint release confirmed. Anterra apologises for the inconvenience. Cabin power appears to be… reduced.');
          }
          return { ok: true };
        }
        return { ok: false, message: 'Unknown action.' };
      }

      /* -------- P2 breakers -------- */
      case 'P2': {
        if (!this.available('P2') && !this.isSolved('P2')) return { ok: false, message: 'Not yet.' };
        if (this.isSolved('P2')) return { ok: true };
        if (zone !== 'Z1') return { ok: false, message: 'The breaker panel is in the lounge.' };
        if (now < this.s.busLockedUntil) {
          return { ok: false, message: `The bus is resetting. ${Math.ceil((this.s.busLockedUntil - now) / 1000)}s.` };
        }
        if (action !== 'toggle') return { ok: false, message: 'Unknown action.' };
        const idx = Number(payload?.idx);
        if (!(idx >= 0 && idx < 6)) return { ok: false, message: 'No such breaker.' };

        const b = this.s.breakers;
        b[idx].closed = !b[idx].closed;

        const heaterOpen = !b[c.heaterIdx].closed;
        const closingLoad = (idx === c.commsIdx || idx === c.lightIdx) && b[idx].closed;
        if (closingLoad && !heaterOpen) {
          // Naive order trips the whole bus — a cost, not a failure.
          for (const bb of b) bb.closed = false;
          b[c.heaterIdx].closed = true; // heater snaps back on with the fault
          this.s.busLockedUntil = now + 15000;
          return { ok: false, message: 'The whole bus trips. Something else is drawing too much.' };
        }
        if (b[c.commsIdx].closed && b[c.lightIdx].closed && heaterOpen) {
          this.markSolved('P2', 'CASS: Cabin systems restored. I can hear you properly now. Please remain calm — the vehicle is not where it is supposed to be.');
        }
        return { ok: true };
      }

      /* -------- P3 lounge door keypad -------- */
      case 'P3': {
        if (!this.available('P3')) return { ok: false, message: 'The keypad is dead until cabin power is restored.' };
        if (zone !== 'Z1') return { ok: false, message: 'The keypad is on the lounge door.' };
        if (action !== 'enter') return { ok: false, message: 'Unknown action.' };
        if (String(payload?.code ?? '') === c.doorCode) {
          this.markSolved('P3', 'CASS: Maintenance override accepted. The hatch remains pressure-inhibited.');
          return { ok: true };
        }
        return { ok: false, message: 'The keypad buzzes. Wrong code.' };
      }

      /* -------- P4 pressure -------- */
      case 'P4': {
        if (!this.available('P4')) return { ok: false, message: 'Not yet.' };
        if (action !== 'valve') return { ok: false, message: 'Unknown action.' };
        if (zone !== 'Z1') return { ok: false, message: 'The valve is at the forward end of the lounge.' };
        if (now < this.s.ventLockedUntil) {
          return { ok: false, message: `The manifold is venting. ${Math.ceil((this.s.ventLockedUntil - now) / 1000)}s.` };
        }
        const delta = Math.max(-6, Math.min(6, Number(payload?.delta) || 0));
        this.s.pressure = Math.max(0, this.s.pressure + delta);
        if (this.s.pressure > c.pressureTarget + c.pressureBand + 6) {
          this.s.pressure = 20;
          this.s.ventLockedUntil = now + 10000;
          return { ok: false, message: 'Overshoot. The manifold vents and the gauge falls back.' };
        }
        if (Math.abs(this.s.pressure - c.pressureTarget) <= c.pressureBand) {
          this.markSolved('P4', 'CASS: Pressure equalised. Corridor hatch released. The service spaces are… colder than the brochure suggests.');
        }
        return { ok: true };
      }

      /* -------- P5 galley -------- */
      case 'P5': {
        if (!this.available('P5')) return { ok: false, message: 'Not yet.' };
        if (zone !== 'Z3') return { ok: false, message: 'Galley stowage is in the galley.' };
        if (action !== 'enter') return { ok: false, message: 'Unknown action.' };
        if (String(payload?.combo ?? '') === c.galleyCombo) {
          this.s.inventory.add('multi-tool');
          this.s.inventory.add('eva-glove');
          this.s.inventory.add('ration-tin'); // the red herring, faithfully included
          this.markSolved('P5', 'CASS: Stowage open. The ration tin is not part of any procedure. Please disregard the markings; passengers always ask.');
          return { ok: true };
        }
        return { ok: false, message: 'The dial spins freely. Wrong combination.' };
      }

      /* -------- P6 crew quarters -------- */
      case 'P6': {
        if (!this.available('P6')) return { ok: false, message: 'Not yet.' };
        if (zone !== 'Z4') return { ok: false, message: 'The crew locker is in the crew quarters.' };
        if (action !== 'enter') return { ok: false, message: 'Unknown action.' };
        if (String(payload?.combo ?? '') === c.crewCombo) {
          this.s.inventory.add('crew-token');
          this.markSolved('P6', 'CASS: Crew authorisation token recovered. I am obliged to note that its previous holders have not signed it out.');
          return { ok: true };
        }
        return { ok: false, message: 'The locker does not open.' };
      }

      /* -------- P7 flight deck hatch -------- */
      case 'P7': {
        if (!this.available('P7')) return { ok: false, message: 'Not yet.' };
        if (zone !== 'Z2') return { ok: false, message: 'The hatch is at the aft end of the corridor.' };
        if (action === 'socket_token') {
          if (!this.s.inventory.has('crew-token')) return { ok: false, message: 'The socket wants a crew token.' };
          this.s.tokenSocketed = true;
          return { ok: true, message: 'The token seats. The hatch shifts a centimetre and stops — the drive has no power.' };
        }
        if (!this.s.tokenSocketed) return { ok: false, message: 'The hatch is locked. There is a token socket beside it.' };
        if (action === 'crank_start') { this.s.cranks[seatId] = now; return { ok: true }; }
        if (action === 'crank_end') {
          delete this.s.cranks[seatId];
          return { ok: true };
        }
        if (action === 'crank_tick') {
          // Client sends ticks while holding; solved when enough simultaneous holders for long enough.
          const holders = Object.values(this.s.cranks).filter((t) => now - t > 500).length;
          const need = this.needed(2);
          if (holders >= need) {
            this.s.crankDoneAt = (this.s.crankDoneAt || now);
            const requiredMs = this.players() === 1 ? 8000 : 6000;
            if (now - this.s.crankDoneAt >= requiredMs) {
              this.markSolved('P7', 'CASS: … The flight deck is open. I am sorry. I have been maintaining their environment record as though it would change.');
            }
          } else {
            this.s.crankDoneAt = 0;
          }
          return { ok: true, holders, need };
        }
        return { ok: false, message: 'Unknown action.' };
      }

      /* -------- P8 cold start -------- */
      case 'P8': {
        if (!this.available('P8')) return { ok: false, message: 'Not yet.' };
        if (zone !== 'Z5') return { ok: false, message: 'The navigation console is on the flight deck.' };
        if (now < this.s.startLockedUntil) {
          return { ok: false, message: `Console resetting. ${Math.ceil((this.s.startLockedUntil - now) / 1000)}s.` };
        }
        if (action !== 'press') return { ok: false, message: 'Unknown action.' };
        const step = String(payload?.step ?? '');
        const expected = c.startSequence[this.s.startProgress.length];
        if (c.failedSteps.includes(step)) {
          this.s.startProgress = [];
          this.s.startLockedUntil = now + 5000;
          return { ok: false, message: `${step}: SELF-TEST FAIL. The sequence resets.` };
        }
        if (step !== expected) {
          this.s.startProgress = [];
          this.s.startLockedUntil = now + 5000;
          return { ok: false, message: 'Out of order. The console resets the sequence.' };
        }
        this.s.startProgress.push(step);
        if (this.s.startProgress.length === c.startSequence.length) {
          this.markSolved('P8', 'CASS: Navigation restored. Displaying the return window. It is closing. I recommend you look now.');
        }
        return { ok: true };
      }

      /* -------- P9 survey -------- */
      case 'P9': {
        if (!this.available('P9')) return { ok: false, message: 'Not yet.' };
        if (action !== 'mark') return { ok: false, message: 'Unknown action.' };
        if (zone !== 'Z5') return { ok: false, message: 'Cluster marking is a flight deck operation.' };
        const { clusterId, usable } = payload ?? {};
        if (!(clusterId in c.faultCodes)) return { ok: false, message: 'No such cluster.' };
        this.s.marks[clusterId] = Boolean(usable);
        const allMarked = Object.keys(c.faultCodes).every((id) => id in this.s.marks);
        if (allMarked) {
          const correct = Object.keys(c.faultCodes).every(
            (id) => this.s.marks[id] === c.usable.includes(id),
          );
          if (correct) {
            this.markSolved('P9', 'CASS: Survey confirmed. The surviving clusters can be armed — manually, at their stations. The bay hatches are released.');
          } else {
            this.s.marks = {};
            return { ok: false, message: 'The computer rejects the survey — at least one marking contradicts a legend entry.' };
          }
        }
        return { ok: true };
      }

      /* -------- P10 cross-feed -------- */
      case 'P10': {
        if (!this.available('P10')) return { ok: false, message: 'Not yet.' };
        if (action !== 'open_valve') return { ok: false, message: 'Unknown action.' };
        const v = String(payload?.valve ?? '');
        if (!c.valveOrder.includes(v)) return { ok: false, message: 'No such valve.' };
        const valveZone = v.includes('PORT') ? 'Z6' : 'Z7';
        if (zone !== valveZone) return { ok: false, message: 'That valve is in the other bay.' };
        if (this.s.valvesOpen.includes(v)) return { ok: true };
        const lockedUntil = this.s.valveLockedUntil[v] ?? 0;
        if (now < lockedUntil) {
          return { ok: false, message: `The check valve is re-seating. ${Math.ceil((lockedUntil - now) / 1000)}s.` };
        }
        if (v === c.coldValve && !this.s.inventory.has('eva-glove')) {
          return { ok: false, message: 'The valve is cold-soaked. Bare hands are not an option. There was a glove in the galley.' };
        }
        const expected = c.valveOrder.filter((x) => !this.s.valvesOpen.includes(x))[0];
        if (v !== expected) {
          this.s.valveLockedUntil[v] = now + 30000;
          return { ok: false, message: 'A check valve slams shut. Wrong order — the pressures decide it.' };
        }
        this.s.valvesOpen.push(v);
        if (this.s.valvesOpen.length === c.valveOrder.length) {
          this.markSolved('P10', 'CASS: Cross-feed complete. The surviving clusters have propellant. What they do not have is permission — yet.');
        }
        return { ok: true };
      }

      /* -------- P11 keys -------- */
      case 'P11': {
        if (!this.available('P11')) return { ok: false, message: 'Not yet.' };
        if (action === 'take_key') {
          const keyId = String(payload?.keyId ?? '');
          const keySpot = { 'key-1': 'Z5', 'key-2': 'Z3', 'key-3': 'Z3' }[keyId];
          if (!keySpot) return { ok: false, message: 'No such key.' };
          if (zone !== keySpot) return { ok: false, message: 'That key is somewhere else.' };
          if (this.s.keysHeld[keyId]) return { ok: false, message: 'Someone already has that key.' };
          this.s.keysHeld[keyId] = seatId;
          return { ok: true };
        }
        if (action === 'socket_key') {
          const station = String(payload?.station ?? '');
          const bayZone = { A: 'Z6', B: 'Z7', C: 'Z8' }[station];
          if (!bayZone) return { ok: false, message: 'No such station.' };
          if (zone !== bayZone) return { ok: false, message: 'You are not at that station.' };
          const heldKey = Object.entries(this.s.keysHeld).find(([, holder]) => holder === seatId)?.[0];
          if (!heldKey) return { ok: false, message: 'You are not carrying a key.' };
          if (this.s.keysSocketed.includes(station)) return { ok: true };
          delete this.s.keysHeld[heldKey];
          this.s.keysSocketed.push(station);
          return { ok: true, poweredStation: station };
        }
        return { ok: false, message: 'Unknown action.' };
      }

      /* -------- P12 interlocks -------- */
      case 'P12': {
        if (!this.available('P12')) return { ok: false, message: 'Not yet.' };
        if (action !== 'enter_interlock') return { ok: false, message: 'Unknown action.' };
        const station = String(payload?.station ?? '');
        const bayZone = { A: 'Z6', B: 'Z7', C: 'Z8' }[station];
        if (!bayZone) return { ok: false, message: 'No such station.' };
        if (zone !== bayZone) return { ok: false, message: 'You are not at that station.' };
        if (!this.s.keysSocketed.includes(station)) return { ok: false, message: 'The station has no power — it needs its override key first.' };
        if (String(payload?.code ?? '') === c.interlocks[station]) {
          return { ok: true, clearedStation: station };
        }
        return { ok: false, message: 'INTERLOCK REJECT. The code for this station displays on the flight deck.' };
      }

      default:
        return { ok: false, message: 'Unknown puzzle.' };
    }
  }

  /** Called by the room when all live stations report interlock cleared. */
  finishP11IfComplete(liveStations) {
    if (!this.isSolved('P11') && liveStations.every((s) => this.s.keysSocketed.includes(s))) {
      this.markSolved('P11', 'CASS: Override keys seated at every live station. Anterra recommends passengers remain seated together during manoeuvring. That recommendation is no longer available.');
    }
  }

  finishP12IfComplete(clearedStations, liveStations) {
    if (!this.isSolved('P12') && liveStations.every((s) => clearedStations.includes(s))) {
      this.markSolved('P12', 'CASS: All interlocks cleared. The flight computer is preparing the manual solution. From here, I can only watch.');
      this.markSolved('P13'); // the solution becomes readable the moment P12 completes
    }
  }

  /* ---- hints ---- */

  hint(puzzleId = null) {
    const target = puzzleId ?? this.frontier();
    if (!target) return null;
    const tier = Math.min((this.s.hintsGiven[target] ?? 0) + 1, 3);
    this.s.hintsGiven[target] = tier;
    return { puzzleId: target, tier, text: HINTS[target]?.[tier - 1] ?? 'Keep going.' };
  }
}
