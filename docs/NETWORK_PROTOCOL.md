# RealTimeEscape — Network Protocol

The client/server message contract for the Colyseus game server (`/game-server`). Shared type definitions live in `/lib` and are imported by both the web client and the game server — this document is their specification.

Related: [ARCHITECTURE.md](./ARCHITECTURE.md) (authoritative model, lifecycle, ADRs) · [PRODUCT.md](./PRODUCT.md) (constraints).

---

## 1. Transport and conventions

- Transport: Colyseus over WebSocket (WSS). One private team session = one Room instance ([ADR-003](./ARCHITECTURE.md#adr-003--colyseus-for-authoritative-multiplayer)).
- State sync: Colyseus schema with delta patches. Movement rebroadcast cadence: 10–20 Hz authoritative updates (tuned from testing). Discrete events (puzzle results, lease grants, phase changes) are explicit messages, not inferred from state diffs.
- All server timestamps are `serverTime` milliseconds from the server's monotonic session clock. Clients never trust local clocks for game timing.
- All IDs are strings. `SeatToken` is an opaque signed token minted by the web backend, scoped to one seat of one session.
- Message names are the literal strings in the tables below. Payload types are normative.

```ts
// Shared primitives (/lib)
type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

type LocomotionState =
  | "idle" | "walk" | "run" | "crouch" | "crawl"
  | "inspect" | "use" | "carry" | "contextual"; // contextual = vent/ladder/tight-space traversal

type SessionPhase =
  | "LOBBY_OPEN" | "READY" | "BRIEFING" | "ACTIVE"
  | "ESCAPED" | "FAILED" | "DEBRIEF";
// Booking-side states (CREATED, AWAITING_SEATS/CONFIRMED, ARCHIVED) live in Postgres,
// not in the live room. See ARCHITECTURE.md §6.

type StationRole = "cockpit" | "thruster" | "unassigned";
```

## 2. Room state schema

The server-authoritative synchronized state. Expressed here as plain TypeScript; the implementation uses `@colyseus/schema` classes with identical shapes. **Fields marked `// role-gated` are filtered per client before send — see §8.**

```ts
interface RoomState {
  phase: SessionPhase;
  timer: {
    durationMs: number;        // 3_600_000 for Burn Window
    startedAt: number | null;  // serverTime when ACTIVE began; null before start
    remainingMs: number;       // server-updated; clients render this, never compute locally
    paused: boolean;           // true only during a verified platform-incident pause
  };

  players: Map<string, PlayerState>;         // key: sessionPlayerId
  interactables: Map<string, InteractableState>; // key: interactableId (from room package)
  inventory: InventoryState;
  puzzles: Map<string, PuzzleState>;         // key: puzzleId
  hints: HintState;
  burn: BurnState;
}

interface PlayerState {
  sessionPlayerId: string;
  displayName: string;
  avatarId: string;
  connected: boolean;
  role: StationRole;
  stationId: string | null;    // occupied station, if any
  transform: { position: Vec3; rotation: Quat };
  locomotion: LocomotionState;
  heldObjectId: string | null; // interactable currently leased-and-held
  voiceActive: boolean;        // drives nameplate/avatar voice indicator
}

interface InteractableState {
  interactableId: string;
  kind: string;                // component type from the room package (door, dial, keypad, lever, ...)
  state: Record<string, number | string | boolean>; // component-defined public state (e.g. { open: true }, { dialValue: 40 })
  leaseOwnerId: string | null; // sessionPlayerId holding the exclusive lease, or null
  enabled: boolean;            // interaction currently permitted by puzzle logic
}

interface InventoryState {
  pockets: Map<string, string[]>; // sessionPlayerId -> itemIds (small personal inventory)
  teamTray: string[];             // communal inventory itemIds
  board: BoardEntry[];            // team clue board
}

interface BoardEntry {
  entryId: string;
  kind: "item" | "clue" | "note" | "snapshot";
  refId: string | null;   // itemId / clueId when kind is item|clue
  text: string | null;    // shared note text when kind is note
  pinnedBy: string;       // sessionPlayerId
  createdAt: number;      // serverTime
}

interface PuzzleState {
  puzzleId: string;
  status: "locked" | "available" | "solved";
  publicProgress: Record<string, number | string | boolean>; // client-safe progress only; never solutions
}

interface HintState {
  hintsUsed: number;
  activeHint: {
    puzzleId: string;
    tier: 1 | 2 | 3;
    deliveredAt: number;
  } | null;
}

interface BurnState {
  phase: "dormant" | "preparing" | "armed" | "executing" | "resolved";
  stations: Map<string, BurnStationState>; // key: stationId
  windowClosesAt: number;                  // serverTime deadline for a valid burn
  attempts: number;
  maneuver: ManeuverPlan | null;           // role-gated: sent ONLY to cockpit clients (§8)
}

interface BurnStationState {
  stationId: string;
  operatorId: string | null;      // sessionPlayerId at the station
  configured: boolean;            // settings match required values (readiness only — not the values)
  armed: boolean;
  localPanel: Record<string, number | string | boolean>; // role-gated: sent ONLY to that station's operator (§8)
}

// Cockpit-only. Never present in any thruster client's state or messages.
interface ManeuverPlan {
  seedRef: string;                // opaque reference to the session seed variant
  stages: Array<{
    stageIndex: number;
    stationId: string;
    thrusterId: string;
    powerPercent: number;
    armOrder: number;
    burnDurationMs: number;
  }>;
  syncToleranceMs: number;        // allowed spread between stations' burn starts
}
```

## 3. Client → server messages

| Message | Payload | Purpose |
|---|---|---|
| `auth.join` | `JoinPayload` | First message; authenticate with seat token (also used on reconnect, §7) |
| `player.move` | `MovePayload` | Predicted movement input state, sent at client tick, validated server-side |
| `interact.request` | `InteractRequestPayload` | Perform an interaction on an interactable |
| `lease.request` | `LeaseRequestPayload` | Request exclusive manipulation lease |
| `lease.release` | `LeaseReleasePayload` | Release a held lease |
| `inventory.action` | `InventoryActionPayload` | Pocket/tray/board item operations |
| `puzzle.input` | `PuzzleInputPayload` | Submit input to a puzzle component (keypad code, sequence step, ...) |
| `station.configSet` | `StationConfigSetPayload` | Set a control value on the sender's own station panel |
| `burn.armThruster` | `ArmThrusterPayload` | Arm a thruster at the sender's own station |
| `burn.execute` | `ExecuteBurnPayload` | Commit the burn at the sender's own station |
| `hint.request` | `HintRequestPayload` | Ask the deterministic hint engine for help |
| `ping.marker` | `PingMarkerPayload` | Place a temporary world-space marker teammates can see |
| `note.share` | `NoteSharePayload` | Share a private notebook note to the team board |

```ts
interface JoinPayload {
  seatToken: string;        // signed, seat-scoped; minted by web backend after auth + paid-seat check
  reconnect: boolean;       // true when reclaiming a seat mid-session (§7)
  clientBuild: string;      // client bundle version for compatibility checks
}

interface MovePayload {
  seq: number;              // client input sequence number, echoed in corrections
  position: Vec3;           // predicted position (server validates speed/collision/bounds)
  rotation: Quat;
  locomotion: LocomotionState;
}

interface InteractRequestPayload {
  interactableId: string;
  action: string;                                  // component-defined verb: "open", "press", "pull", "insert", ...
  args?: Record<string, number | string | boolean>; // e.g. { itemId: "keycard-b" } for insert
}

interface LeaseRequestPayload {
  interactableId: string;
}

interface LeaseReleasePayload {
  interactableId: string;
}

interface InventoryActionPayload {
  action: "pickup" | "drop" | "place" | "transferToTray" | "takeFromTray" | "pinToBoard" | "unpinFromBoard";
  itemId: string;
  targetId?: string;        // socket/surface id for "place"; boardEntryId for "unpinFromBoard"
}

interface PuzzleInputPayload {
  puzzleId: string;
  interactableId: string;                           // the component the input came through
  input: Record<string, number | string | boolean>; // e.g. { code: "4471" } or { step: "blue" }
}

interface StationConfigSetPayload {
  stationId: string;        // must be the sender's occupied station — rejected otherwise
  controlId: string;        // e.g. "power-dial", "fuel-valve-2"
  value: number | string | boolean;
}

interface ArmThrusterPayload {
  stationId: string;        // must be the sender's occupied station
  thrusterId: string;
}

interface ExecuteBurnPayload {
  stationId: string;        // must be the sender's occupied station
  clientSentAt: number;     // client's last-known serverTime, for latency diagnostics only;
                            // the server's own receive time is authoritative for sync tolerance
}

interface HintRequestPayload {
  puzzleId?: string;        // omitted = let the hint engine pick the eligible puzzle
}

interface PingMarkerPayload {
  position: Vec3;
  targetId?: string;        // optional interactable being pointed at
}

interface NoteSharePayload {
  text: string;             // server-validated: length-capped, sanitized
}
```

Validation rules (server-side, applied to every message): sender must hold a valid seat; proximity and object state are checked for interactions; `station.*` and `burn.*` messages are rejected unless the sender occupies the named station; malformed or rate-abusive input is dropped. The client is never trusted with an outcome.

## 4. Server → client messages

Continuous state (transforms, timer, interactable state) arrives as Colyseus **state patches** against the §2 schema. Discrete outcomes arrive as explicit messages:

| Message | Payload | Purpose |
|---|---|---|
| *(state patch)* | delta of `RoomState` | Continuous sync; role-gated fields filtered per client (§8) |
| `move.correct` | `MoveCorrectionPayload` | Authoritative correction after rejected/adjusted movement |
| `lease.grant` | `LeaseGrantPayload` | Exclusive lease granted |
| `lease.deny` | `LeaseDenyPayload` | Lease refused, with reason |
| `puzzle.solved` | `PuzzleSolvedPayload` | Canonical puzzle completion |
| `clue.published` | `CluePublishedPayload` | A clue/document became available (possibly to a subset of players) |
| `hint.delivered` | `HintDeliveredPayload` | Hint engine output (text + optional TTS/prerecorded audio ref) |
| `phase.change` | `PhaseChangePayload` | Session phase transition |
| `burn.readiness` | `BurnReadinessPayload` | Global station readiness (cockpit sees all; operators see their own) |
| `burn.result` | `BurnResultPayload` | Outcome of an executed burn attempt |
| `session.result` | `SessionResultPayload` | Final ESCAPED/FAILED outcome + debrief data |
| `rehydrate.state` | `RehydratePayload` | Full role-filtered snapshot on (re)join (§7) |

```ts
interface MoveCorrectionPayload {
  ackSeq: number;           // last accepted client input seq
  position: Vec3;           // authoritative pose to snap/blend to
  rotation: Quat;
}

interface LeaseGrantPayload {
  interactableId: string;
  leaseOwnerId: string;     // == recipient's sessionPlayerId
  expiresAt: number;        // serverTime; lease auto-expires (disconnect safety, ARCHITECTURE.md §8)
}

interface LeaseDenyPayload {
  interactableId: string;
  reason: "held" | "outOfRange" | "disabled" | "wrongState";
  heldBy: string | null;    // sessionPlayerId when reason is "held"
}

interface PuzzleSolvedPayload {
  puzzleId: string;
  solvedAt: number;
  solvedBy: string[];       // contributing sessionPlayerIds
  effects: string[];        // client-visible effect ids fired (door opened, light changed, ...)
}

interface CluePublishedPayload {
  clueId: string;
  kind: "document" | "image" | "code" | "audio" | "boardEntry";
  assetRef: string | null;  // R2/CDN reference when media-backed
  text: string | null;
  audience: "team" | "role"; // "role" = only the receiving client's role was sent this (§8)
}

interface HintDeliveredPayload {
  puzzleId: string;
  tier: 1 | 2 | 3;
  text: string;             // canonical hint text — always present (deterministic fallback guarantee)
  audioRef: string | null;  // TTS/prerecorded operator audio when available; null on AI/TTS failure
  hintsUsedTotal: number;
}

interface PhaseChangePayload {
  from: SessionPhase;
  to: SessionPhase;
  at: number;               // serverTime of transition
  timerRemainingMs: number;
}

interface BurnReadinessPayload {
  stations: Array<{
    stationId: string;
    occupied: boolean;
    configured: boolean;    // readiness booleans only — required values are never included
    armed: boolean;
  }>;
  allReady: boolean;
}

interface BurnResultPayload {
  attempt: number;
  outcome: "success" | "outOfSync" | "misconfigured" | "incomplete";
  syncSpreadMs: number | null;   // measured spread between station executions
  timePenaltyMs: number | null;  // cost of a failed attempt (recoverable setback, not hard fail)
  stationsAtFault: string[];     // stationIds only; no station's private detail is revealed to others
}

interface SessionResultPayload {
  outcome: "ESCAPED" | "FAILED";
  completedAt: number;
  timeRemainingMs: number;       // 0 on failure
  hintsUsed: number;
  burnAttempts: number;
  milestones: Array<{ puzzleId: string; solvedAt: number }>;
  resultsUrl: string;            // web debrief/aftercare page
}
```

## 5. Timer authority

`timer.remainingMs` in room state is the only truth. Clients render it (with local interpolation between patches) and never derive time from `Date.now()`. Phase transitions driven by the timer (window close, FAILED) are decided solely on the server.

## 6. Hint delivery guarantee

`hint.delivered.text` is the canonical deterministic hint chosen by the server-side hint engine (3-tier ladders authored in `/rooms/burn-window/content`). `audioRef` is an optional enrichment: when LLM rephrasing or TTS fails or times out, the message is still sent with `audioRef: null` and the client displays/subtitles the text. A paid game is completable with every AI service down ([PRODUCT.md §4](./PRODUCT.md#4-the-zero-host-principle)).

## 7. Reconnection and rehydration

A returning paid participant reclaims the same seat, avatar, role, and canonical world state ([ARCHITECTURE.md §8](./ARCHITECTURE.md#8-checkpointing-and-reconnection)).

Handshake:

1. Client reconnects and sends `auth.join` with the same `seatToken` and `reconnect: true`.
2. Server validates the token against `rte_booking_seats` / `rte_session_players`, matches the live seat, and rebinds the Colyseus client to the existing `PlayerState` (which was marked `connected: false`, its leases released on timeout).
3. Server sends `rehydrate.state` — a full, **role-filtered** snapshot — before resuming normal patches.
4. Client rebuilds local scene state from the snapshot, then applies subsequent patches.

```ts
interface RehydratePayload {
  serverTime: number;            // clock baseline for all timestamps
  phase: SessionPhase;
  state: RoomState;              // full snapshot, filtered per §8 for this client's role
  you: {
    sessionPlayerId: string;
    role: StationRole;
    stationId: string | null;
    pocket: string[];            // personal inventory
    privateNotes: string[];      // personal notebook (never in shared RoomState)
  };
  voice: { livekitToken: string; roomName: string }; // rejoin party voice
}
```

The same message serves first join (fresh state) and reconnection (current mid-game state); the client does not need a separate code path. A player's disconnect never pauses the team timer; only a verified platform incident does (deterministic, auditable policy — see [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-session-lifecycle)).

## 8. Asymmetric information rule

Asymmetric information is the signature mechanic and is enforced **at the protocol layer, not in the client**:

> The server must never send cockpit-only maneuver data to thruster clients, and must never send a thruster station's private panel detail to cockpit clients (or to other stations' operators). Filtering happens server-side before serialization; the client is never trusted to hide data it received.

Concretely:

| Data | Sent to |
|---|---|
| `BurnState.maneuver` (`ManeuverPlan`: thruster IDs, power, order, durations, tolerance) | Cockpit clients only |
| `BurnStationState.localPanel` (a station's control values and local machinery detail) | That station's operator only |
| `BurnStationState.configured` / `armed` readiness booleans, `burn.readiness` | Cockpit sees all stations' readiness; each operator sees their own |
| `clue.published` with `audience: "role"` | Only clients holding the target role/location |
| `burn.result.stationsAtFault` | Station IDs only — never the private values that were wrong |

Implementation: role-gated fields are excluded from the shared broadcast schema and delivered through per-client filtered views/messages (Colyseus state filtering plus targeted `send`). The cockpit learns thruster settings only when a human says them aloud; the thruster operators learn the plan only when the navigator reads it out. Any change that would leak gated data across roles is a protocol regression, regardless of whether the client UI displays it — browser-delivered data is never secret ([ARCHITECTURE.md §9](./ARCHITECTURE.md#9-security-and-privacy)).

Generic engine support for visibility rules (alternate visual layers, role-only audio cues, split ciphers) is configured per room package; Burn Window's cockpit/thruster gating is the first instance.
