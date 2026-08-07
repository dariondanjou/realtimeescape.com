# PUZZLE_COMPONENTS.md — Reusable Interaction & Puzzle Engine

Status: engineering specification for `packages/interaction-engine/` and `packages/puzzle-engine/`.
Related: [ROOM_SCHEMA.md](./ROOM_SCHEMA.md) (how components are instantiated from room packages; §2 defines the `clientConfig`/`serverConfig` split these components declare) · [OPERATOR_AND_HINTS.md](./OPERATOR_AND_HINTS.md) (how puzzle state feeds the Hint Engine).

Principles (from the master brief, §9/§12):

- **Server decides reality.** Clients render, predict locally, and submit intents; canonical component state lives in the Colyseus room state and changes only via validated server transitions.
- **Discrete events, not physics.** Puzzle state changes are discrete server transitions — reliable and testable.
- **Rooms are data.** Every component below is generic; Burn Window instantiates them via [ROOM_SCHEMA.md](./ROOM_SCHEMA.md) interactable definitions. Room-specific logic in engine packages is a defect.

---

## 1. Component contract

Every interaction component implements one server-side contract:

```ts
interface InteractionComponent<TServerCfg, TState, TMsg> {
  readonly type: InteractionComponentType;
  /** JSON Schemas for authored config; fields marked x-serverOnly are split into
   *  server.rules.json by the room-schema build (ROOM_SCHEMA.md §3, rule V-SPLIT). */
  readonly clientConfigSchema: JsonSchema;
  readonly serverConfigSchema: JsonSchema;
  /** Initial canonical state from authored config (+ resolved randomization). */
  init(cfg: TServerCfg, seedCtx: SeedContext): TState;
  /** Validate + apply one client message. Pure: returns verdict + new state + emitted engine events. */
  handle(msg: TMsg, ctx: InteractionContext<TState>): InteractionResult<TState>;
  /** Lease profile (see §4). */
  readonly leaseProfile: "exclusive" | "shared" | "multiSlot" | "none";
}

interface InteractionContext<TState> {
  state: TState;
  objectId: ContentId;
  playerId: string;
  playerRole?: ContentId;
  playerPosition: Vec3;          // server-tracked, for proximity validation
  lease: LeaseView;              // current lease holder(s) for this object
  now: number;                   // server monotonic ms
  inventory: InventoryView;      // personal pocket + team tray, read-only here
}

interface InteractionResult<TState> {
  verdict: "accepted" | "rejected";
  rejectReason?: "noLease" | "outOfRange" | "wrongState" | "notEnabled"
               | "roleForbidden" | "invalidPayload" | "cooldown";
  state: TState;                 // unchanged when rejected
  events: EngineEvent[];         // e.g. { kind: "componentSignal", signal: "sequenceEntered", ... }
                                 // — these feed puzzle CONDITIONS (§3)
}
```

**Universal server validation, applied before any component's `handle`:**

1. Object exists, is `enabledAtStart`/enabled-by-effect, and is not hidden from this player's role (`visibleToRoles`, authoritative copy).
2. Player is within the component's interaction radius of the object (server-side position vs. collision/navmesh data; defends against teleport-and-poke clients).
3. Lease rules for the component's profile are satisfied (§4).
4. Message payload validates against the component's message schema.
5. Session phase permits interaction (e.g. input locked during a blocking cinematic).

Rejections are cheap and expected (two players racing to one key); the client plays a soft deny and re-syncs from the next state patch.

---

## 2. Standard interaction components

Format per component — **Config**: authored fields (🔒 = `x-serverOnly`); **State**: canonical server state; **Messages**: client→server intents; **Validation**: checks beyond §1's universal set; **Lease**: profile.

### PickUp
- **Config:** `interactionRadius`, `holdAttachmentSlot` (hand/tool), 🔒 `mandatory`, 🔒 `respawn.spawnId`.
- **State:** `location: "world" | "heldBy:{playerId}" | "pocket:{playerId}" | "tray" | "socket:{objectId}"`, `worldPosition`.
- **Messages:** `PickUpRequest {objectId}`.
- **Validation:** object is in `world` or `tray`; requester's pocket has a free slot if pickup targets pocket.
- **Lease:** exclusive — pickup **is** lease acquisition; holding = leased.

### Drop
- **Config:** `allowedSurfaces` (navmesh | any-walkable), `dropOffsetMax`.
- **State:** (operates on the held object's PickUp state).
- **Messages:** `DropRequest {objectId, position?}`.
- **Validation:** requester holds the lease; requested position resolves to a navmesh-reachable point within `dropOffsetMax` of the player — server clamps, so an item can never be dropped somewhere unreachable (supports [ROOM_SCHEMA.md](./ROOM_SCHEMA.md) rule V-LOST).
- **Lease:** releases the exclusive lease on success.

### Examine
- **Config:** `focusMode` (client), `examineText`, 🔒 `revealsClueId` (optional — first examine publishes a clue).
- **State:** `examinedBy: Set<playerId>` (telemetry + hint-pressure signal).
- **Messages:** `ExamineStart {objectId}`, `ExamineEnd {objectId}`.
- **Validation:** none beyond universal; examine is non-mutating and concurrent.
- **Lease:** none — any number of players may examine simultaneously (each gets a local focus camera).

### Rotate
- **Config:** `axes`, `detents?` (snap angles), `freeRotate` (client feel), 🔒 `targetOrientation`, 🔒 `toleranceDegrees`.
- **State:** `orientation: Quat` (canonical, quantized to detents when configured), `atTarget: boolean`.
- **Messages:** `RotateSet {objectId, orientation}` (client sends settled result, not per-frame deltas).
- **Validation:** orientation quantized server-side; `atTarget` computed only on server against 🔒 target.
- **Lease:** exclusive while in focus mode; auto-release on focus exit.

### Combine
- **Config:** `combinableHint` (client affordance only), 🔒 `recipes: {inputs: [ContentId, ContentId], output: ContentId, consumeInputs: boolean}[]`.
- **State:** stateless (acts on inventory); emits `combined` signal.
- **Messages:** `CombineRequest {objectIdA, objectIdB}`.
- **Validation:** both inputs held by requester or in team tray; a 🔒 recipe matches (unordered pair); output object exists in package.
- **Lease:** requires momentary exclusive lease on both inputs (acquired atomically or the request is rejected — no partial hold, no deadlock).

### Insert/Remove
- **Config:** `socketNode` (client attach point), 🔒 `accepts: ContentId[]`, 🔒 `lockOnInsert: boolean`.
- **State:** `occupiedBy: ContentId | null`, `locked: boolean`.
- **Messages:** `InsertRequest {socketId, objectId}`, `RemoveRequest {socketId}`.
- **Validation:** insert — socket empty, item held by requester, item in 🔒 `accepts`; remove — socket occupied and not `locked` (a keycard consumed by a reader stays locked only if the item is not `mandatory` elsewhere, enforced at build by V-LOST).
- **Lease:** exclusive on the socket during the operation; item lease transfers world→socket.

### Open/Close
- **Config:** `animOpen/animClose` (client), `blockedByLock?: ContentId`.
- **State:** `open: boolean`.
- **Messages:** `OpenRequest`, `CloseRequest`.
- **Validation:** referenced Lock/Unlock component (if any) is unlocked.
- **Lease:** none for the swing itself (idempotent); state patch is authoritative.

### Lock/Unlock
- **Config:** `lockKind: "key" | "code" | "effect"`, 🔒 `keyObjectId?`, 🔒 `code?`.
- **State:** `locked: boolean`.
- **Messages:** `UnlockAttempt {lockId, method: {key?: ContentId, code?: string}}`.
- **Validation:** key — requester holds 🔒 `keyObjectId`; code — constant-time compare vs 🔒 `code`; effect-kind locks reject all direct attempts (only a puzzle EFFECT unlocks them).
- **Lease:** momentary exclusive during attempt.

### Push/Pull
- **Config:** `track` (client path), `positions: number` (discrete stops), 🔒 `targetPosition?`.
- **State:** `position: int` (stop index).
- **Messages:** `PushPullStep {objectId, direction: +1 | -1}`.
- **Validation:** target stop within range; movement path unblocked (server flag, not physics).
- **Lease:** exclusive while engaged.

### Button
- **Config:** `momentary: boolean`, `pressAnim/sfx` (client), 🔒 `cooldownMs?`.
- **State:** `pressCount`, `lastPressedAt`, `lastPressedBy`.
- **Messages:** `ButtonPress {objectId}`.
- **Validation:** cooldown respected. Press timestamps use server receipt time — they feed `actionsWithinTimeTolerance` (§3), so the server, not clients, owns simultaneity.
- **Lease:** none — buttons are inherently multi-user (two players may press different buttons simultaneously; the same button serializes trivially by receipt order).

### Toggle
- **Config:** `labels` (client), 🔒 `contributesToPattern?: ContentId` (pattern-group id).
- **State:** `on: boolean`.
- **Messages:** `ToggleRequest {objectId}`.
- **Validation:** none beyond universal; emits `switchChanged` signal consumed by `switchPatternMatches` conditions.
- **Lease:** none (idempotent flip; races resolve by server order and patch back).

### Lever
- **Config:** `positions: string[]` (e.g. ["off","standby","on"]), `springReturn?: string`.
- **State:** `position: string`.
- **Messages:** `LeverSet {objectId, position}`.
- **Validation:** position ∈ configured positions; adjacent-step rule if `stepwise: true`.
- **Lease:** exclusive while grabbed; released on settle. Spring-return applies server-side after `springReturnMs`.

### Dial
- **Config:** `min/max/step`, `wrap: boolean`, `labels?` (client), 🔒 `targetValue?`, 🔒 `toleranceSteps?`.
- **State:** `value: number`, `atTarget: boolean` (server-computed; never sent to clients unless the room explicitly authors a feedback lamp).
- **Messages:** `DialSet {objectId, value}` (settled value).
- **Validation:** value quantized to `step`, clamped/wrapped; `atTarget` vs 🔒 target on server only.
- **Lease:** exclusive while in focus.

### Keypad
- **Config:** `digits`, `glyphSet` ("numeric" | "symbols" | custom), `feedback: "perSubmit"`, 🔒 `code`, 🔒 `maxAttemptsBeforeCooldown`, 🔒 `cooldownSeconds`.
- **State:** `cooldownUntil`, `attemptCount`, `solved: boolean`.
- **Messages:** `KeypadSubmit {objectId, entry: string}` (full entry, never per-keystroke to the server; keystrokes are local presentation).
- **Validation:** length matches; constant-time compare vs 🔒 `code`; cooldown after configured failures (anti-brute-force); emits `sequenceEntered` on success.
- **Lease:** exclusive while in focus mode so two players don't interleave digits.

### Door
- **Config:** `animOpen` (client), `autoCloseMs?`, 🔒 `openedByEffectOnly: boolean`.
- **State:** `open: boolean`, `permanentlyOpen: boolean` (set by `openDoor` effect — story doors don't re-lock).
- **Messages:** `DoorOpenRequest` (only for non-effect doors).
- **Validation:** effect-only doors reject direct requests; otherwise defers to linked Lock/Unlock.
- **Lease:** none; traversal is free once open. Server-side, an open door also flips reachability flags used by drop-clamping and the solvability walker.

### Drawer/Container
- **Config:** `capacity`, `animOpen` (client), 🔒 `initialContents: ContentId[]`, 🔒 `lockRef?`.
- **State:** `open: boolean`, `contents: ContentId[]`.
- **Messages:** `ContainerOpen/Close`, `ContainerTake {containerId, objectId}`, `ContainerPut {containerId, objectId}`.
- **Validation:** take — object in `contents`, requester has pocket space; put — capacity not exceeded; contents visible to clients only while open (asymmetric-safe: contents patch is sent on open, not at load).
- **Lease:** exclusive on the container during take/put (momentary); items follow PickUp leasing.

### Terminal
- **Config:** `screens: {screenId, uiKind}[]` (client UI defs), `idleScreen`, 🔒 `screenData: Record<screenId, payload>` (authoritative content per screen — e.g. the navigation readout), 🔒 `commands?: {cmd, requiresRole?, effectSignal}[]`.
- **State:** `activeScreen`, `poweredOn`, per-terminal `sessionOwner` (who is focused).
- **Messages:** `TerminalFocus/Blur`, `TerminalNavigate {screenId}`, `TerminalCommand {cmd, args}`.
- **Validation:** screen exists and is unlocked for the session's phase; 🔒 role-gated commands check `playerRole`; screen **payloads are sent only to the focused player's client, filtered by role** — this is the primary carrier of asymmetric information (cockpit nav data never reaches thruster clients).
- **Lease:** exclusive focus per terminal (one driver); others can watch the world-space screen mesh, which renders only the client-safe surface.

### Document
- **Config:** `pages: CdnKey[]` (rendered page textures) or `richText`, `pinnableToBoard: boolean`, 🔒 `printedVariables?` (randomization bindings — e.g. the manifest code, [ROOM_SCHEMA.md](./ROOM_SCHEMA.md) §4).
- **State:** `discoveredBy: Set<playerId>`, `pinned: boolean`.
- **Messages:** `DocumentRead {objectId}`, `DocumentPin {objectId}`.
- **Validation:** page content with 🔒 variables is composited server-side (or variable text is patched into the page payload at session start) so the client only ever downloads the resolved content for its session.
- **Lease:** none for reading (concurrent); Pin is idempotent team-scoped.

### AudioSource
- **Config:** `clip: ContentId`, `spatial: boolean`, `loop`, 🔒 `audibleToRoles?` (asymmetric audio cue).
- **State:** `playing: boolean`, `startedAt`.
- **Messages:** `AudioTriggerRequest {objectId}` (for player-triggered sources, e.g. a playback device).
- **Validation:** role filter applied at patch fan-out — clients outside 🔒 `audibleToRoles` never receive the play event. Essential audio-only clues must have a visual/text equivalent (accessibility; build rule V-SUBS in [ROOM_SCHEMA.md](./ROOM_SCHEMA.md) §8).
- **Lease:** none.

### PuzzleSocket
- **Config:** visual slot metadata (client), 🔒 `accepts: ContentId[]`, 🔒 `arrangement?: {slots: n, correctPlacement: Record<slot, ContentId>}`.
- **State:** `placed: Record<slot, ContentId | null>`, `correct: boolean` (server-only unless a feedback lamp is authored).
- **Messages:** `SocketPlace {socketId, slot, objectId}`, `SocketRemove {socketId, slot}`.
- **Validation:** item held, slot empty, item in 🔒 `accepts`; `correct` recomputed per change; emits `socketArrangementChanged`.
- **Lease:** per-slot momentary exclusive — two players may load different slots of one socket concurrently (deliberately cooperative).

### SequenceInput
- **Config:** `controls: string[]` (client affordances), `feedback: "perStep" | "onComplete"`, 🔒 `requiredOrder: string[]`, 🔒 `resetOnError: boolean`, 🔒 `stage?` (burn-stage binding).
- **State:** `progress: string[]`, `completed: boolean`, `readyState?: string` (e.g. `"armedAndConfigured"` for the thruster panels).
- **Messages:** `SequenceStep {objectId, control}`, `SequenceReset {objectId}`.
- **Validation:** step ∈ controls; order checked against 🔒 `requiredOrder`; wrong step → reset or hold per config; `perStep` feedback returns accept/reject verdicts only (never the expected next step); completion emits `sequenceEntered` and sets `readyState`.
- **Lease:** exclusive — one operator per panel. This is the thruster-arming component in Burn Window.

### MultiPlayerTrigger
- **Config:** `stations: ContentId[]` (participating objects), `minParticipants`, 🔒 `windowMs` (simultaneity tolerance), 🔒 `holdMs?` (sustained action, e.g. burn duration), 🔒 `requiredDistinctPlayers: boolean`.
- **State:** `armedStations: Set<ContentId>`, `attempt: {stationId, playerId, at, heldUntil?}[]`, `attemptResult: "pending" | "success" | "failMistimed" | "failWrongConfig"`.
- **Messages:** `TriggerActivate {stationId}` (+ implicit release message for hold-type: `TriggerRelease {stationId}`).
- **Validation:** all timestamps are **server receipt times**; success requires ≥ `minParticipants` activations from distinct players (when 🔒 required) at distinct stations within 🔒 `windowMs`, each sustained 🔒 `holdMs` where configured. Partial/mistimed attempts emit a structured failure signal that failure policies convert into a recoverable setback ([ROOM_SCHEMA.md](./ROOM_SCHEMA.md) `softFailPolicies`). Latency fairness: `windowMs` (1,500 ms for the Burn Window finale) is chosen ≫ typical broadband jitter; the server does not compensate per-client RTT in V1. PLANNED: per-client RTT offsetting, deferred until real-latency playtests show the tolerance alone is insufficient.
- **Lease:** multiSlot — one exclusive slot per station.

### CrawlEntrance (contextual traversal)
- **Config:** `pathSpline` (client animation path), `exitNode`, `traversalSeconds`, `capacity: 1`.
- **State:** `occupiedBy: playerId | null`, `traversals: number`.
- **Messages:** `TraversalStart {entranceId}`, (server emits `TraversalComplete`; client cannot shortcut it).
- **Validation:** entrance enabled, unoccupied; player position at entrance; during traversal the player's transform is server-driven along the spline (no free movement, no mid-vent state).
- **Lease:** exclusive for `traversalSeconds` + buffer; force-released on disconnect with the avatar resolved to whichever end was nearer (never stranded inside).

### Reveal / secret door
- **Config:** `revealAnim`, `hiddenNodes` (client meshes to unhide), 🔒 `revealedByEffectOnly: true` (default).
- **State:** `revealed: boolean`.
- **Messages:** none in the default effect-only mode (a Reveal fires from a puzzle EFFECT); optional `RevealTouchRequest` when authored as directly discoverable.
- **Validation:** hidden geometry is **not loaded/instantiated client-side until revealed** where asset streaming allows, so scene-scraping yields nothing meaningful before the reveal.
- **Lease:** none.

---

## 3. Condition/effect puzzle model

`packages/puzzle-engine` evaluates puzzles as **conditions → effects**. Components emit `EngineEvent` signals (§1); the engine re-evaluates the conditions of unsolved puzzles whose condition set references the changed object/signal (indexed, not a full scan), and applies effects atomically when all conditions hold.

```ts
// packages/puzzle-engine/src/model.ts

type PuzzleCondition =
  | { type: "itemInInventory"; objectId: ContentId;
      scope: "anyPlayer" | "teamTray" | "player"; playerRole?: ContentId }
  | { type: "switchPatternMatches"; group: ContentId;        // pattern-group of Toggles/Levers
      pattern: Record<ContentId, string | boolean> }          // 🔒 authored server-side only
  | { type: "sequenceEntered"; objectId: ContentId;           // Keypad | SequenceInput success signal
      match: "serverConfig.code" | "serverConfig.requiredOrder" }
  | { type: "multiStationReady"; stations: ContentId[];       // SequenceInput readyState across stations
      readyState: string }
  | { type: "playerRole"; roleId: ContentId;                  // acting player holds role
      appliesTo: "actingPlayer" }
  | { type: "priorPuzzleSolved"; puzzleId: ContentId }
  | { type: "actionsWithinTolerance";                         // MultiPlayerTrigger success signal
      actions: { objectId: ContentId; action: string }[];
      toleranceMs: number;
      holdForMs?: number | { fromVariable: ContentId } }      // randomization binding
  | { type: "anyOf"; conditions: PuzzleCondition[] };         // OR-composition

type PuzzleEffect =
  | { type: "markSolved"; puzzleId: ContentId }
  | { type: "openDoor"; objectId: ContentId }
  | { type: "revealObject"; objectId: ContentId }             // fires Reveal component
  | { type: "changeLightState"; sceneId: ContentId; storyState: string } // e.g. "emergency"
  | { type: "enableInteraction"; objectId: ContentId }
  | { type: "playCue"; cueId: ContentId }                     // audio/video/operator line via cue system
  | { type: "addInventory"; objectId: ContentId; to: "teamTray" | "player"; playerId?: string }
  | { type: "removeInventory"; objectId: ContentId }
  | { type: "publishClue"; clueId: ContentId;
      audience: "team" | "role"; roleId?: ContentId }         // pushes to clue board / role channel
  | { type: "advancePhase"; phaseId: ContentId }
  | { type: "createCheckpoint" }
  | { type: "recalcBurnManeuver" };                           // re-derives burn params from seed + retry count;
                                                              // publishes new nav data to cockpit role only
```

Evaluation rules:

1. Conditions of one puzzle are **AND**; use `anyOf` for OR. No NOT in V1 (negations breed unsolvable authoring mistakes; the validator would have to prove much more). PLANNED: `not` composition if Room #2 genuinely needs it.
2. Effects apply in authored order within one server tick — atomic with respect to state patches (clients see one consistent patch).
3. `markSolved` is idempotent; non-`repeatable` puzzles never re-fire. Repeatable puzzles (final burn) re-arm after their failure policy runs.
4. Every condition type is deterministic given canonical state — this is what makes the solvability walker ([ROOM_SCHEMA.md](./ROOM_SCHEMA.md) §9) and the Hint Engine ([OPERATOR_AND_HINTS.md](./OPERATOR_AND_HINTS.md) §2) possible.

### Worked example 1 — Act I: restore emergency access

```json
{
  "puzzleId": "restore-emergency-access",
  "displayName": "Emergency Bulkhead Release",
  "required": true,
  "conditions": [
    { "type": "itemInInventory", "objectId": "emergency-crank-handle", "scope": "anyPlayer" },
    { "type": "switchPatternMatches", "group": "vr-breaker-bank",
      "pattern": { "breaker-1": true, "breaker-2": false, "breaker-3": true } },
    { "type": "sequenceEntered", "objectId": "bulkhead-crank-socket",
      "match": "serverConfig.requiredOrder" }
  ],
  "effects": [
    { "type": "markSolved", "puzzleId": "restore-emergency-access" },
    { "type": "openDoor", "objectId": "viewing-room-bulkhead" },
    { "type": "changeLightState", "sceneId": "viewing-room", "storyState": "emergency" },
    { "type": "playCue", "cueId": "bulkhead-release-sting" },
    { "type": "publishClue", "clueId": "ship-off-course-readout", "audience": "team" },
    { "type": "createCheckpoint" }
  ],
  "repeatable": false
}
```

### Worked example 2 — Act IV: the synchronized burn

The finale composes `multiStationReady` + `actionsWithinTolerance` over two `SequenceInput` panels and a `MultiPlayerTrigger`; full JSON is in [ROOM_SCHEMA.md](./ROOM_SCHEMA.md) §4 (`final-burn`). The division of labor:

| Concern | Owner |
|---|---|
| Correct per-station configuration (order, settings) | `SequenceInput.readyState`, per panel |
| All stations configured | `multiStationReady` condition |
| Simultaneous ignition within 1,500 ms, held for the seeded burn duration | `MultiPlayerTrigger` → `actionsWithinTolerance` |
| Navigator knows the answer, operators have the controls | Terminal role-filtered screens + `visibleToRoles` (asymmetry) |
| Mistimed burn = recoverable time cost, not hard fail | `softFailPolicies` → `recalcBurnManeuver` effect |

---

## 4. Interaction-lease lifecycle & disconnect recovery

A **lease** is the server's record that one player (or one player per slot) currently owns manipulation rights to an exclusive object. Leases prevent two players from simultaneously owning the same key or driving the same dial (brief §9).

```
        grant
IDLE ─────────────▶ HELD ──── heartbeat/activity ────┐
  ▲                  │  ▲                            │
  │        release   │  └────────────────────────────┘
  │◀─────────────────┤
  │                  │ idle > maxHoldSeconds        ─▶ RECLAIM_WARN (client toast)
  │                  │ holder disconnects           ─▶ GRACE (leaseGraceSeconds, default 30s)
  │                  ▼
  │◀──────── FORCE_RELEASED
             • held item → returned to team tray, or respawned at `respawn.spawnId`
               if tray-return is not authored for it
             • focus lease (dial/keypad/terminal) → simply cleared
             • CrawlEntrance → avatar resolved to nearest end, lease cleared
             • MultiPlayerTrigger slot → attempt state for that station reset
```

Rules:

1. **Acquisition is implicit** in the first mutating message for focus-type components (Dial, Keypad, Terminal…) and explicit for held items (PickUp). Grant/deny is the §1 universal validation step 3.
2. **At most one holder** per exclusive object; `multiSlot` components hold one lease per station slot.
3. **Idle expiry:** `maxHoldSeconds` of no activity → warn, then force-release. Nobody can squat on the crank handle.
4. **Disconnect:** the holder's leases enter GRACE. If the player reconnects within grace, every lease and held item is restored exactly (same seat, same avatar, same hands — brief §9 reconnection). After grace, force-release runs.
5. **Invariant — no orphaned exclusives, ever:** force-release always lands the object in a reachable, acquirable state (team tray or authored respawn point). This invariant is unit-tested per component and adversarially tested by the solvability walker's disconnect pass ([ROOM_SCHEMA.md](./ROOM_SCHEMA.md) §9, step 5c) and the zero-host failure tests ([OPERATOR_AND_HINTS.md](./OPERATOR_AND_HINTS.md) §7).
6. **Server restart:** leases are part of canonical state and are checkpointed; restore-from-checkpoint re-enters GRACE for all holders (everyone reconnects anyway), converging to the same invariant.

---

## 5. Required unit tests per component

Every component ships with tests in `packages/interaction-engine/test/`. The common suite runs against **all** components via the shared contract; the per-component list is additive.

**Common suite (all 24 components):**
- Rejects: out-of-range player, disabled object, role-forbidden player, malformed payload, wrong session phase.
- Lease matrix for the component's profile: grant, deny-second-holder, idle expiry, disconnect→grace→restore, disconnect→grace→force-release lands object in reachable state (invariant §4.5).
- Deterministic replay: same message sequence + same seed ⇒ identical final state (checkpoint safety).
- State patch contains no `x-serverOnly` config field (belt-and-braces beside build rule V-SPLIT).

**Per-component additions:**

| Component | Additional required tests |
|---|---|
| PickUp/Drop | pocket-full rejection; drop position clamped to navmesh; mandatory-item respawn path; pickup race (two requests, one winner, loser gets `noLease`) |
| Examine | concurrent examiners; `revealsClueId` publishes exactly once |
| Rotate | detent quantization; `atTarget` true only within tolerance; target never present in any client-bound patch |
| Combine | unordered recipe match; non-recipe pair rejected; `consumeInputs` removes inputs atomically; atomic two-lease acquisition (no partial hold) |
| Insert/Remove | non-accepted item rejected; `lockOnInsert` blocks removal; V-LOST interplay: locked socket + mandatory item combination rejected at schema level |
| Open/Close | blocked-by-lock rejection; idempotent double-open |
| Lock/Unlock | wrong key/code rejection; constant-time compare (timing test); effect-kind rejects direct attempts |
| Push/Pull | bounds clamp; blocked-path rejection |
| Button | cooldown enforcement; press timestamps are server receipt times (client timestamp in payload ignored) |
| Toggle | race between two togglers converges to server order; `switchChanged` signal emitted |
| Lever | invalid position rejected; spring-return fires server-side after timeout |
| Dial | quantize/clamp/wrap; `atTarget` never in patch unless feedback lamp authored |
| Keypad | correct/incorrect entry; attempt counter + cooldown; entry never echoed in patches; `sequenceEntered` emitted once |
| Door | effect-only door rejects direct open; `permanentlyOpen` survives checkpoint restore; reachability flag flips |
| Drawer/Container | capacity limit; contents hidden until opened (patch inspection); take/put races |
| Terminal | role-gated command rejection; screen payload fan-out only to focused+authorized player; focus lease exclusivity |
| Document | randomization variable composited into resolved content; other pool values absent from payload; pin idempotency |
| AudioSource | role-filtered fan-out (non-audience client receives nothing); text-equivalent reference present |
| PuzzleSocket | per-slot concurrency (two players, two slots, both accepted); wrong-item rejection; `correct` recomputation |
| SequenceInput | wrong-step reset/hold per config; `perStep` verdicts leak no expected-next-step; `readyState` transition; reset message |
| MultiPlayerTrigger | in-window success; out-of-window failure emits `failMistimed`; distinct-player enforcement; hold-duration (early release fails); all timing from server clock; retry after soft-fail re-arms cleanly |
| CrawlEntrance | occupancy exclusivity; mid-traversal disconnect resolves to an end; transform is server-driven during traversal |
| Reveal | hidden content absent from client scene graph pre-reveal; effect-only mode rejects direct messages |

**Puzzle-engine tests (`packages/puzzle-engine/test/`):**
- Each condition type: satisfied/unsatisfied truth tables against fixture state.
- Each effect type: state delta + emitted patches; effect-order atomicity.
- `anyOf` composition; indexed re-evaluation only touches puzzles referencing the changed signal.
- Repeatable puzzle re-arm after `softFailPolicies`; non-repeatable never re-fires.
- `recalcBurnManeuver`: new parameters derive deterministically from (seed, retryCount); new nav data patched to cockpit role only.
- Full Burn Window graph fixtures: the brief's Phase 0 acceptance scenario (3 clients, asymmetric info, synchronized burn, disconnect/reconnect) encoded as an integration test.
