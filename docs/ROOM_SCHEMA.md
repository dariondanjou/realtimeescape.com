# ROOM_SCHEMA.md — Versioned Room-Package Format

Status: engineering specification for `packages/room-schema/`.
Related: [PUZZLE_COMPONENTS.md](./PUZZLE_COMPONENTS.md) (interaction/puzzle engine that consumes this schema) · [OPERATOR_AND_HINTS.md](./OPERATOR_AND_HINTS.md) (hint ladders and operator scripts defined here are served by the Hint Engine).

A room is a **data package**, not a fork of the application. The platform (Babylon client + Colyseus server + puzzle engine) is generic; Burn Window is the first content package that runs on it. This file defines the package format, the mandatory client/server content split, the JSON Schema and TypeScript contracts, a worked Burn Window fragment, and the automated validation the content pipeline enforces.

---

## 1. Package model

A **room package** is an immutable, versioned bundle of JSON manifests plus references (by CDN key) to binary assets in object storage (Cloudflare R2). Nothing in a package is mutated after release; a fix is a new version.

A package version is split into **two deliverables built from one source tree**:

| Deliverable | Delivered to | Contains |
|---|---|---|
| `client.package.json` | Browser (via CDN) | Scene/asset references, spawn points, interactable presentation metadata, subtitles, quality tiers, client-visible narrative triggers |
| `server.rules.json` | Game server only (never on CDN public path) | Puzzle rules, canonical solutions, dependency graph, hint ladders (full text), randomization tables, scaling rules, success/failure rules, role/visibility rules |

**MANDATORY SPLIT RULE:** canonical answers, condition parameters that encode answers (keypad codes, switch patterns, sequence orders, combination recipes, burn parameters), hint text, and randomization tables MUST exist only in `server.rules.json`. The build pipeline fails if any field marked `serverOnly` in the source schema appears in the client deliverable (see §8, rule V-SPLIT). Browser-delivered assets can never be treated as secret; the server-only split is what actually protects puzzle truth.

Both deliverables carry the same `packageId`, `version`, and a `contentHash`. The server refuses to start a session unless the client's declared `(packageId, version, contentHash)` exactly matches its own (§8, rule V-VER).

### Storage layout (R2)

```
rooms/{packageId}/{version}/client.package.json
rooms/{packageId}/{version}/assets/...            (GLB, KTX2, audio, video — content-addressed keys)
rooms-private/{packageId}/{version}/server.rules.json   (no public CDN route)
```

Asset references in manifests are **CDN keys** (opaque strings resolved against the asset base URL), never absolute URLs, so environments (dev/staging/prod) can rebase them.

---

## 2. TypeScript interfaces

These live in `packages/room-schema/src/types.ts` and are the source of truth; the JSON Schema in §3 is generated from them at build time (single source, no drift).

```ts
// ─────────────────────────────────────────────
// Shared identity
// ─────────────────────────────────────────────

/** Semver string, e.g. "1.4.2". */
type SemVer = string;
/** Opaque CDN object key, e.g. "assets/glb/cockpit_a3f9.glb". */
type CdnKey = string;
/** Stable content-author-assigned id, kebab-case, unique within the package. */
type ContentId = string;

interface PackageIdentity {
  packageId: string;            // "burn-window"
  version: SemVer;              // immutable once published
  contentHash: string;          // sha256 over canonicalized source tree
  engineCompat: {
    minPlatformVersion: SemVer; // oldest platform this package runs on
    maxPlatformVersion?: SemVer;// set only when a breaking platform change is known
    schemaVersion: number;      // ROOM SCHEMA major version, currently 1
  };
  displayName: string;          // "Burn Window"
  durationSeconds: number;      // 3600 for Burn Window
  playerCount: { min: number; max: number; recommendedMin: number; recommendedMax: number };
}

// ─────────────────────────────────────────────
// CLIENT DELIVERABLE  (client.package.json)
// ─────────────────────────────────────────────

interface ClientRoomPackage {
  identity: PackageIdentity;
  scenes: SceneDef[];
  assets: AssetManifest;
  spawnPoints: SpawnPoint[];
  interactables: InteractablePresentation[];
  narrativeTriggersClient: ClientNarrativeCue[]; // presentation half of triggers (what to play/show)
  subtitles: SubtitleTrack[];                    // all operator/story speech has text
  quality: QualitySettings;
}

interface SceneDef {
  sceneId: ContentId;               // "viewing-room", "service-corridor", "cockpit", "thruster-port", "thruster-starboard"
  glb: CdnKey;                      // environment mesh, baked lightmaps referenced inside
  lightmaps: CdnKey[];              // KTX2
  environmentIbl?: CdnKey;          // .env / HDR-derived IBL
  navmesh: CdnKey;                  // binary navmesh consumed by client guided-nav AND server position validation
  collision: CdnKey;                // simplified collision mesh (server-authoritative proximity checks use this too)
  streamedAfter?: ContentId;        // scene preloaded once the named scene is entered (progressive loading, §10 brief)
  storyStates?: string[];           // e.g. ["pre-incident", "emergency"] — visual variants toggled by effects
}

interface AssetManifest {
  audio: Record<ContentId, CdnKey>;   // SFX, ambient, prerecorded operator/story clips
  video: Record<ContentId, CdnKey>;   // cinematics (briefing, success, failure)
  textures: Record<ContentId, CdnKey>;
  props: Record<ContentId, CdnKey>;   // GLB props (keys, tools, documents)
}

interface SpawnPoint {
  spawnId: ContentId;
  sceneId: ContentId;
  position: [number, number, number];
  yawDegrees: number;
  /** Which players may spawn/respawn here. "initial" points must cover max player count. */
  use: "initial" | "reconnect" | "phase";   // "phase" = e.g. thruster-station repositioning offer in Act IV
  phaseId?: ContentId;                      // required when use === "phase"
}

/**
 * CLIENT-SAFE interactable data: everything needed to render, highlight,
 * animate, and submit inputs — and NOTHING that reveals the answer.
 */
interface InteractablePresentation {
  objectId: ContentId;
  sceneId: ContentId;
  component: InteractionComponentType;      // see PUZZLE_COMPONENTS.md §2
  nodeName: string;                         // Babylon node in the scene GLB (or props key)
  displayName: string;                      // "Thruster B Arming Panel"
  focusMode?: FocusModeConfig;              // inspection camera config
  clientConfig: Record<string, unknown>;    // component presentation config (dial detent count, keypad glyph set…)
                                            // VALIDATED per-component; may not contain serverOnly fields (V-SPLIT)
  highlightAssist: boolean;                 // participates in high-contrast interactable assist (accessibility)
  visibleToRoles?: ContentId[];             // asymmetric-visibility presentation filter (server re-enforces)
}

interface FocusModeConfig {
  camera: "orbit" | "fixed" | "document";
  allowRotate: boolean;
  allowZoom: boolean;
}

interface ClientNarrativeCue {
  cueId: ContentId;
  kind: "video" | "audio" | "operatorLine" | "worldStateChange";
  asset?: ContentId;                 // AssetManifest key for video/audio
  subtitleTrack?: ContentId;
  blocksInput?: boolean;             // cinematics that pause interaction
  audioPriority: "cinematic" | "operator" | "ambient";  // see OPERATOR_AND_HINTS.md §5
}

interface SubtitleTrack {
  trackId: ContentId;
  language: string;                  // BCP-47, "en" at launch
  cues: { startMs: number; endMs: number; text: string }[];
}

interface QualitySettings {
  tiers: Record<"low" | "medium" | "high" | "ultra", QualityTier>;
  initialPayloadBudgetMB: number;    // 75 (brief §10) — validated by pipeline against actual asset sizes
  targetFps: { minimum: number; target: number };  // 30 / 60
}

interface QualityTier {
  textureMaxSize: number;
  shadowsEnabled: boolean;
  shadowMapSize?: number;
  postProcessing: ("bloom" | "ssao" | "tonemapOnly")[];
  maxDynamicLights: number;
  lodBias: number;
}

// ─────────────────────────────────────────────
// SERVER DELIVERABLE  (server.rules.json)  — SERVER-ONLY
// ─────────────────────────────────────────────

interface ServerRoomPackage {
  identity: PackageIdentity;               // must match client deliverable exactly
  interactableRules: InteractableRule[];   // authoritative half of every interactable
  puzzles: PuzzleDef[];
  dependencyGraph: DependencyEdge[];
  hintLadders: HintLadder[];               // consumed by Hint Engine — OPERATOR_AND_HINTS.md §2
  narrativeTriggersServer: ServerNarrativeTrigger[];
  roles: RoleDef[];
  scaling: ScalingRule[];
  randomization: RandomizationSpec;
  phases: PhaseDef[];
  success: SuccessRule;
  failure: FailureRule;
  operatorFacts: OperatorFact[];           // approved facts for AI rephrasing — OPERATOR_AND_HINTS.md §3
  checkpointPolicy: { intervalSeconds: number; onEveryPhaseTransition: boolean; onPuzzleSolved: boolean };
}

interface InteractableRule {
  objectId: ContentId;                       // joins to InteractablePresentation.objectId
  serverConfig: Record<string, unknown>;     // component authoritative config incl. solutions
                                             // (keypad code, dial target, sequence order…)
  lease: LeaseConfig;                        // PUZZLE_COMPONENTS.md §4
  mandatory: boolean;                        // required on at least one success path (drives V-LOST)
  respawn?: { spawnId: ContentId };          // recovery location if a mandatory portable item is stranded
  enabledAtStart: boolean;                   // interactions can be enabled later by effects
  visibleToRoles?: ContentId[];              // authoritative asymmetric filter (client copy is cosmetic)
}

interface LeaseConfig {
  exclusive: boolean;                 // one holder at a time
  maxHoldSeconds?: number;            // soft expiry for idle holds
  multiUserSlots?: number;            // for explicitly multi-user objects (MultiPlayerTrigger)
}

interface PuzzleDef {
  puzzleId: ContentId;
  displayName: string;                       // used in debrief + hint UI ("Emergency Bulkhead Release")
  required: boolean;                         // required puzzles MUST have a hint ladder (V-HINT)
  conditions: PuzzleCondition[];             // ALL must hold (AND); use nested "anyOf" condition for OR
  effects: PuzzleEffect[];                   // applied atomically when conditions are met
  repeatable: boolean;                       // final-burn attempt is repeatable; most puzzles are not
}

// PuzzleCondition / PuzzleEffect discriminated unions are specified in
// PUZZLE_COMPONENTS.md §3 and imported from packages/puzzle-engine.
type PuzzleCondition = import("puzzle-engine").PuzzleCondition;
type PuzzleEffect   = import("puzzle-engine").PuzzleEffect;

interface DependencyEdge {
  /** "from" must be solved before "to" can have its conditions satisfied. Explicit edges
   *  supplement implicit edges derived from prior-puzzle-solved conditions; the validator
   *  merges both and checks the merged graph (V-GRAPH). */
  from: ContentId;
  to: ContentId;
}

interface HintLadder {
  puzzleId: ContentId;
  tiers: [HintTier, HintTier, HintTier];     // exactly 3: nudge → direction → explicit
}

interface HintTier {
  tier: 1 | 2 | 3;
  text: string;                              // canonical deterministic text (always available fallback)
  prerecordedAudio?: ContentId;              // AssetManifest audio key (preferred delivery)
  aiRephrasable: boolean;                    // tier 3 explicit solutions are typically NOT rephrasable
  audience: "team" | "role";                 // role-targeted hints go only to that station
  roleId?: ContentId;
}

interface ServerNarrativeTrigger {
  triggerId: ContentId;
  when: TriggerCondition;                    // phase entered | puzzle solved | timer threshold | area entered
  fire: { cueId: ContentId }[];              // client cues to broadcast (ClientNarrativeCue)
  once: boolean;
}

type TriggerCondition =
  | { type: "phaseEntered"; phaseId: ContentId }
  | { type: "puzzleSolved"; puzzleId: ContentId }
  | { type: "timerRemaining"; seconds: number }
  | { type: "areaEntered"; sceneId: ContentId; anyPlayer: boolean };

interface RoleDef {
  roleId: ContentId;                         // "navigator", "thruster-port", "thruster-starboard", "engineering"
  minPlayers: number;                        // navigator: 1; thruster roles: 1 each at 3 players
  maxPlayers: number;
  assignment: "emergent";                    // V1: roles attach when a player occupies the station,
                                             // not picked from a class menu (brief §2). Enum for future modes.
  informationChannels: ContentId[];          // which asymmetric info feeds this role receives
}

interface ScalingRule {
  playerCounts: number[];                    // counts this rule applies to, e.g. [3] or [7,8]
  overrides: {
    disablePuzzles?: ContentId[];            // optional side-puzzles removed at low counts
    mergeStations?: { from: ContentId; into: ContentId }[]; // e.g. 3 players: one operator handles 2 stages sequentially
    extraClueCopies?: { clueId: ContentId; atObject: ContentId }[];
    burnStages?: number;                     // how many synchronized stages the finale generates
  };
}

interface RandomizationSpec {
  seedScope: "session";                      // one deterministic seed per session, created at start (brief §4.6)
  variables: RandomVariable[];
}

interface RandomVariable {
  variableId: ContentId;                     // "burn.thrusterAssignment", "keypad.engineering-code"
  strategy: "pickOne" | "shuffle" | "range" | "mapping";
  pool: unknown[];                           // validated set — every element must produce a solvable room (V-RAND)
  constraints?: { notEqualTo?: ContentId[]; accessibleAlternativeRequired?: boolean };
  /** Where the drawn value is injected: server config paths only. */
  bindsTo: { objectId?: ContentId; puzzleId?: ContentId; path: string }[];
}

interface PhaseDef {
  phaseId: ContentId;                        // "act1-escape-viewing-room" … "act4-burn"
  entryEffects: PuzzleEffect[];
  expectedEntrySeconds?: number;             // pacing telemetry + Hint Engine pressure signal, not a gate
}

interface SuccessRule {
  /** Success is a designated puzzle whose solve ends the game in ESCAPED. */
  terminalPuzzleId: ContentId;               // "final-burn-complete"
  cinematic: ContentId;                      // success video cue
}

interface FailureRule {
  /** Failure occurs when the canonical timer hits 0 without success. */
  timerSeconds: number;                      // 3600
  cinematic: ContentId;                      // authored failure ending, not a red screen
  softFailPolicies: {
    /** Mistimed burn: recoverable setback (recalculation) rather than hard fail (brief §2 Act IV). */
    puzzleId: ContentId;
    onFail: PuzzleEffect[];                  // e.g. recalcBurnManeuver + time-cost messaging
    maxRetries?: number;                     // absent = unlimited until timer expires
  }[];
}

interface OperatorFact {
  factId: ContentId;
  text: string;                              // canonical statement the AI may select/rephrase
  unlockedBy?: TriggerCondition;             // facts about undiscovered content stay locked
  category: "rules" | "controls" | "story" | "systemStatus" | "discoveredClue";
}
```

`InteractionComponentType` and the per-component `clientConfig`/`serverConfig` shapes are normatively defined in [PUZZLE_COMPONENTS.md](./PUZZLE_COMPONENTS.md) §2; the room-schema validator loads those component schemas to validate each interactable's config against its declared component type.

---

## 3. JSON Schema

Generated from the TypeScript types; the hand-maintained skeleton below is normative for structure and for the `serverOnly` enforcement flag. Draft 2020-12. (Abbreviated: repetitive `properties` blocks for types fully specified in §2 are elided with `"$comment"` markers; the generated schema in `packages/room-schema/schema/` is complete.)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://realtimeescape.com/schemas/room-package/v1.json",
  "title": "RealTimeEscape Room Package v1",
  "oneOf": [
    { "$ref": "#/$defs/ClientRoomPackage" },
    { "$ref": "#/$defs/ServerRoomPackage" }
  ],
  "$defs": {
    "SemVer": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "CdnKey": { "type": "string", "pattern": "^[a-z0-9][a-z0-9/_.-]*$" },
    "ContentId": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$" },

    "PackageIdentity": {
      "type": "object",
      "required": ["packageId", "version", "contentHash", "engineCompat",
                   "displayName", "durationSeconds", "playerCount"],
      "additionalProperties": false,
      "properties": {
        "packageId": { "$ref": "#/$defs/ContentId" },
        "version": { "$ref": "#/$defs/SemVer" },
        "contentHash": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
        "engineCompat": {
          "type": "object",
          "required": ["minPlatformVersion", "schemaVersion"],
          "properties": {
            "minPlatformVersion": { "$ref": "#/$defs/SemVer" },
            "maxPlatformVersion": { "$ref": "#/$defs/SemVer" },
            "schemaVersion": { "const": 1 }
          }
        },
        "displayName": { "type": "string", "minLength": 1 },
        "durationSeconds": { "type": "integer", "minimum": 60 },
        "playerCount": {
          "type": "object",
          "required": ["min", "max", "recommendedMin", "recommendedMax"],
          "properties": {
            "min": { "type": "integer", "minimum": 1 },
            "max": { "type": "integer", "minimum": 1 },
            "recommendedMin": { "type": "integer" },
            "recommendedMax": { "type": "integer" }
          }
        }
      }
    },

    "ClientRoomPackage": {
      "type": "object",
      "required": ["identity", "scenes", "assets", "spawnPoints",
                   "interactables", "narrativeTriggersClient", "subtitles", "quality"],
      "additionalProperties": false,
      "properties": {
        "identity": { "$ref": "#/$defs/PackageIdentity" },
        "scenes": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/SceneDef" } },
        "assets": { "$ref": "#/$defs/AssetManifest" },
        "spawnPoints": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/SpawnPoint" } },
        "interactables": { "type": "array", "items": { "$ref": "#/$defs/InteractablePresentation" } },
        "narrativeTriggersClient": { "type": "array", "items": { "$ref": "#/$defs/ClientNarrativeCue" } },
        "subtitles": { "type": "array", "items": { "$ref": "#/$defs/SubtitleTrack" } },
        "quality": { "$ref": "#/$defs/QualitySettings" }
      }
    },

    "InteractablePresentation": {
      "type": "object",
      "required": ["objectId", "sceneId", "component", "nodeName", "displayName",
                   "clientConfig", "highlightAssist"],
      "additionalProperties": false,
      "properties": {
        "objectId": { "$ref": "#/$defs/ContentId" },
        "sceneId": { "$ref": "#/$defs/ContentId" },
        "component": { "enum": ["PickUp", "Drop", "Examine", "Rotate", "Combine",
          "InsertRemove", "OpenClose", "LockUnlock", "PushPull", "Button", "Toggle",
          "Lever", "Dial", "Keypad", "Door", "DrawerContainer", "Terminal", "Document",
          "AudioSource", "PuzzleSocket", "SequenceInput", "MultiPlayerTrigger",
          "CrawlEntrance", "Reveal"] },
        "nodeName": { "type": "string" },
        "displayName": { "type": "string" },
        "focusMode": { "$comment": "See FocusModeConfig in types.ts" },
        "clientConfig": {
          "type": "object",
          "$comment": "Validated against the per-component clientConfig schema (PUZZLE_COMPONENTS.md §2). Build fails if any property is flagged serverOnly in the component schema (rule V-SPLIT)."
        },
        "highlightAssist": { "type": "boolean" },
        "visibleToRoles": { "type": "array", "items": { "$ref": "#/$defs/ContentId" } }
      }
    },

    "ServerRoomPackage": {
      "type": "object",
      "required": ["identity", "interactableRules", "puzzles", "dependencyGraph",
                   "hintLadders", "narrativeTriggersServer", "roles", "scaling",
                   "randomization", "phases", "success", "failure",
                   "operatorFacts", "checkpointPolicy"],
      "additionalProperties": false,
      "$comment": "Property shapes follow §2 types: InteractableRule, PuzzleDef, DependencyEdge, HintLadder, ServerNarrativeTrigger, RoleDef, ScalingRule, RandomizationSpec, PhaseDef, SuccessRule, FailureRule, OperatorFact.",
      "properties": {
        "identity": { "$ref": "#/$defs/PackageIdentity" },
        "hintLadders": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["puzzleId", "tiers"],
            "properties": {
              "puzzleId": { "$ref": "#/$defs/ContentId" },
              "tiers": { "type": "array", "minItems": 3, "maxItems": 3 }
            }
          }
        }
      }
    },

    "SceneDef": { "$comment": "See types.ts SceneDef" },
    "AssetManifest": { "$comment": "See types.ts AssetManifest" },
    "SpawnPoint": { "$comment": "See types.ts SpawnPoint" },
    "ClientNarrativeCue": { "$comment": "See types.ts ClientNarrativeCue" },
    "SubtitleTrack": { "$comment": "See types.ts SubtitleTrack" },
    "QualitySettings": { "$comment": "See types.ts QualitySettings" }
  }
}
```

The source authoring format annotates fields with `"x-serverOnly": true` in component schemas; the build splitter routes those into `server.rules.json` and the validator asserts none leak (V-SPLIT).

---

## 4. Worked example — Burn Window fragment

A trimmed excerpt showing the client/server split for one keypad puzzle in Act II and one final-burn interactable in Act IV.

### `client.package.json` (excerpt)

```json
{
  "identity": {
    "packageId": "burn-window",
    "version": "1.0.0",
    "contentHash": "sha256:8c1e0f…",
    "engineCompat": { "minPlatformVersion": "1.0.0", "schemaVersion": 1 },
    "displayName": "Burn Window",
    "durationSeconds": 3600,
    "playerCount": { "min": 3, "max": 8, "recommendedMin": 4, "recommendedMax": 6 }
  },
  "scenes": [
    { "sceneId": "viewing-room", "glb": "assets/glb/viewing-room_a19c.glb",
      "lightmaps": ["assets/ktx2/viewing-room-lm_44d2.ktx2"],
      "navmesh": "assets/nav/viewing-room_88f0.bin",
      "collision": "assets/col/viewing-room_31ab.bin",
      "storyStates": ["pre-incident", "emergency"] },
    { "sceneId": "cockpit", "glb": "assets/glb/cockpit_5be1.glb",
      "lightmaps": ["assets/ktx2/cockpit-lm_9c7e.ktx2"],
      "navmesh": "assets/nav/cockpit_02dd.bin",
      "collision": "assets/col/cockpit_e4a9.bin",
      "streamedAfter": "viewing-room" }
  ],
  "spawnPoints": [
    { "spawnId": "vr-seat-1", "sceneId": "viewing-room",
      "position": [2.1, 0, -3.4], "yawDegrees": 180, "use": "initial" }
  ],
  "interactables": [
    {
      "objectId": "svc-door-keypad",
      "sceneId": "viewing-room",
      "component": "Keypad",
      "nodeName": "SvcDoorKeypad_Mesh",
      "displayName": "Service Door Keypad",
      "focusMode": { "camera": "fixed", "allowRotate": false, "allowZoom": true },
      "clientConfig": { "digits": 4, "glyphSet": "numeric", "feedback": "perSubmit" },
      "highlightAssist": true
    },
    {
      "objectId": "thruster-b-arm-panel",
      "sceneId": "thruster-port",
      "component": "SequenceInput",
      "nodeName": "ThrusterB_ArmPanel",
      "displayName": "Thruster B Arming Panel",
      "clientConfig": { "controls": ["breaker", "valve", "arm-switch", "ignition-cover"],
                        "feedback": "perStep" },
      "highlightAssist": true,
      "visibleToRoles": ["thruster-port"]
    }
  ]
}
```

Note what is **absent**: no code for the keypad, no correct arming order, no burn timing. `feedback: "perSubmit"` tells the client to animate accept/reject only after a server verdict.

### `server.rules.json` (excerpt)

```json
{
  "interactableRules": [
    {
      "objectId": "svc-door-keypad",
      "serverConfig": { "code": "4172", "maxAttemptsBeforeCooldown": 6, "cooldownSeconds": 20 },
      "lease": { "exclusive": true, "maxHoldSeconds": 45 },
      "mandatory": true,
      "enabledAtStart": true
    },
    {
      "objectId": "thruster-b-arm-panel",
      "serverConfig": { "requiredOrder": ["breaker", "valve", "arm-switch"],
                        "ignitionRequiresArmed": true },
      "lease": { "exclusive": true, "maxHoldSeconds": 120 },
      "mandatory": true,
      "enabledAtStart": false,
      "visibleToRoles": ["thruster-port"]
    }
  ],
  "puzzles": [
    {
      "puzzleId": "open-service-door",
      "displayName": "Service Door Access",
      "required": true,
      "conditions": [
        { "type": "priorPuzzleSolved", "puzzleId": "find-crew-manifest" },
        { "type": "sequenceEntered", "objectId": "svc-door-keypad", "match": "serverConfig.code" }
      ],
      "effects": [
        { "type": "markSolved", "puzzleId": "open-service-door" },
        { "type": "openDoor", "objectId": "service-door" },
        { "type": "playCue", "cueId": "svc-door-open-sting" },
        { "type": "createCheckpoint" }
      ],
      "repeatable": false
    },
    {
      "puzzleId": "final-burn",
      "displayName": "Synchronized Manual Burn",
      "required": true,
      "conditions": [
        { "type": "priorPuzzleSolved", "puzzleId": "derive-burn-vector" },
        { "type": "multiStationReady",
          "stations": ["thruster-b-arm-panel", "thruster-c-arm-panel"],
          "readyState": "armedAndConfigured" },
        { "type": "actionsWithinTolerance",
          "actions": [
            { "objectId": "thruster-b-arm-panel", "action": "ignite" },
            { "objectId": "thruster-c-arm-panel", "action": "ignite" }
          ],
          "toleranceMs": 1500,
          "holdForMs": { "fromVariable": "burn.durationMs" } }
      ],
      "effects": [
        { "type": "markSolved", "puzzleId": "final-burn" },
        { "type": "advancePhase", "phaseId": "escaped" },
        { "type": "playCue", "cueId": "earth-return-cinematic" }
      ],
      "repeatable": true
    }
  ],
  "dependencyGraph": [
    { "from": "open-service-door", "to": "reach-cockpit" },
    { "from": "derive-burn-vector", "to": "final-burn" }
  ],
  "hintLadders": [
    {
      "puzzleId": "open-service-door",
      "tiers": [
        { "tier": 1, "text": "Crew areas are code-locked. Crew paperwork often repeats what crew members must remember.",
          "prerecordedAudio": "hint-svc-door-t1", "aiRephrasable": true, "audience": "team" },
        { "tier": 2, "text": "The crew manifest lists each astronaut's compartment assignment. The service door belongs to one of them.",
          "prerecordedAudio": "hint-svc-door-t2", "aiRephrasable": true, "audience": "team" },
        { "tier": 3, "text": "Enter the four-digit compartment number printed beside Commander Vasquez's name on the manifest.",
          "aiRephrasable": false, "audience": "team" }
      ]
    }
  ],
  "randomization": {
    "seedScope": "session",
    "variables": [
      { "variableId": "burn.durationMs", "strategy": "pickOne",
        "pool": [4000, 5000, 6000],
        "bindsTo": [{ "puzzleId": "final-burn", "path": "conditions[2].holdForMs" }] },
      { "variableId": "burn.stationAssignment", "strategy": "shuffle",
        "pool": ["stage-1", "stage-2"],
        "bindsTo": [{ "objectId": "thruster-b-arm-panel", "path": "serverConfig.stage" },
                    { "objectId": "thruster-c-arm-panel", "path": "serverConfig.stage" }] },
      { "variableId": "keypad.svc-door-code", "strategy": "pickOne",
        "pool": ["4172", "3958", "7241", "6013"],
        "constraints": { "accessibleAlternativeRequired": false },
        "bindsTo": [{ "objectId": "svc-door-keypad", "path": "serverConfig.code" },
                    { "objectId": "crew-manifest-doc", "path": "serverConfig.printedCode" }] }
    ]
  },
  "scaling": [
    { "playerCounts": [3],
      "overrides": { "mergeStations": [{ "from": "thruster-c-arm-panel", "into": "thruster-b-arm-panel" }],
                     "burnStages": 2 } },
    { "playerCounts": [7, 8],
      "overrides": { "extraClueCopies": [{ "clueId": "manifest-page-2", "atObject": "galley-locker" }],
                     "burnStages": 3 } }
  ],
  "success": { "terminalPuzzleId": "final-burn", "cinematic": "earth-return-cinematic" },
  "failure": {
    "timerSeconds": 3600,
    "cinematic": "drift-ending-cinematic",
    "softFailPolicies": [
      { "puzzleId": "final-burn",
        "onFail": [ { "type": "recalcBurnManeuver" },
                    { "type": "playCue", "cueId": "burn-recalc-warning" } ] }
    ]
  }
}
```

Key property of the `keypad.svc-door-code` variable: it binds the drawn code to **both** the keypad's answer and the manifest document's printed content, so randomization can never desynchronize clue from solution (validated by V-RAND).

---

## 5. Player-count scaling rules

Scaling is declarative (`ScalingRule[]`), applied at session start when the roster locks (brief §4.6). The base package must be authored for the recommended count; scaling rules adjust for min/max:

- **Low counts (3):** merge thruster stations or serialize burn stages so one operator plus one navigator plus one runner is sufficient. Never delete the cockpit/thruster asymmetry — it is the product.
- **High counts (7–8):** add clue copies and optional parallel side-puzzles so idle players have work; increase burn stages so more operators participate.
- The validator must prove **every** supported count solvable after its overrides are applied (V-COUNT).

## 6. Role and asymmetric-information rules

Roles in V1 are **emergent** (occupying a station attaches the role), never a lobby class picker. Asymmetry is enforced twice:

1. **Server-authoritative:** `visibleToRoles` on `InteractableRule` and role `informationChannels` gate which state patches and clue payloads each client ever receives. The navigator's burn instructions are simply never sent to thruster clients.
2. **Client presentation:** `visibleToRoles` on `InteractablePresentation` hides UI affordances. This is cosmetic only; a modified client still cannot obtain filtered data because it was never transmitted.

Disconnect safety: if a role's only holder disconnects past the lease timeout, role-locked information is re-offered to the team (effect `publishClue` with `audience: "team"`), satisfying the brief's rule that no puzzle becomes unsolvable because a specific avatar disappeared. See [PUZZLE_COMPONENTS.md](./PUZZLE_COMPONENTS.md) §4 for lease recovery.

## 7. Randomization rules

- One deterministic seed per session, created at start, stored in `GAME_SESSIONS`.
- All draws come from **validated pools** — the pipeline replays the solvability test for every element of every pool (or the full cross-product where pools interact on the same puzzle; see V-RAND).
- A variable that appears in a clue **and** an answer must bind to both via `bindsTo` (single draw, multiple injection points). Free-floating duplicate draws are a validation error.
- `accessibleAlternativeRequired` marks color/symbol mappings that must have a non-color equivalent (brief §18).
- Randomization affects: thruster IDs, power settings, arming order, burn duration, station-to-stage assignment, symbol/code mappings. It never affects: topology, dependency-graph shape, or which puzzles are required.

---

## 8. Automated validation (content pipeline)

Runs in CI on every package build; a package version cannot be published to R2 with any rule failing.

| Rule | Check |
|---|---|
| **V-REF** | Every `ContentId` reference resolves: interactable ↔ rule pairs match 1:1, every `cueId`/`asset`/`spawnId`/`sceneId`/`puzzleId`/`roleId` exists, every `CdnKey` exists in the built asset set, every GLB `nodeName` exists in its scene file. |
| **V-SPLIT** | No field flagged `x-serverOnly` in any component schema appears anywhere in `client.package.json`; string-scan client deliverable for values of all solution fields (codes, sequences, pool elements) as a second net. Build fails on any hit. |
| **V-COND** | Every condition in every puzzle is satisfiable: referenced items are obtainable, referenced patterns are reachable states of the referenced component, referenced roles can exist at every supported player count. |
| **V-COUNT** | Solvability test (§9) passes for **each** supported player count with that count's scaling overrides applied. |
| **V-LOST** | No `mandatory` object can be permanently lost: every mandatory portable item has either a `respawn` spawn point or all its sinks (sockets, containers) are reversible; simulated worst-case action sequences (drop into inaccessible volume is impossible by construction — drops resolve to navmesh) cannot strand it. |
| **V-RAND** | Every randomization pool element (and the cross-product of variables binding into the same puzzle) yields a solvable package via §9; clue/answer bindings share a single variable. |
| **V-PATH** | A success path exists from the initial state (base case of V-COUNT at recommended count, run first for fast failure). |
| **V-HINT** | Every puzzle with `required: true` has a `HintLadder` with exactly 3 tiers, each with non-empty `text`; tier text for `aiRephrasable: false` tiers must state the full action (spot-checked by content review, presence checked by CI). |
| **V-VER** | `identity` blocks of the two deliverables are byte-identical; `contentHash` recomputes correctly; at runtime the server rejects any client whose `(packageId, version, contentHash)` differs from its own. |
| **V-BUDGET** | Sum of assets reachable before first interactivity ≤ `initialPayloadBudgetMB`; per-tier texture limits respected. |
| **V-SUBS** | Every `operatorLine`/`audio`/`video` narrative cue and every hint tier with `prerecordedAudio` has a subtitle track or text equivalent (accessibility, brief §18). |

## 9. Graph-walking solvability test

The solver does **not** understand puzzles like a human. It proves the state graph reaches success by executing valid transitions:

1. **Build state:** initialize canonical server state from the package (given player count + scaling overrides + a fixed seed), exactly as a real session would, using the real puzzle engine — not a parallel implementation.
2. **Enumerate frontier:** at each step, list every legal action available to any simulated player: interactions whose component accepts input in the current state, item pickups, station configurations. For answer-bearing components the solver is allowed to read `serverConfig` (it runs server-side in CI) and submit the correct input — it is proving *reachability*, not *guessability*.
3. **Walk:** apply actions; the puzzle engine fires conditions/effects normally. Prefer actions that unlock unsolved required puzzles (guided by the dependency graph) to keep the walk near-linear; fall back to exhaustive frontier search (BFS over hashed states) if the guided walk stalls.
4. **Success criterion:** the terminal puzzle (`success.terminalPuzzleId`) is marked solved. Timer is ignored for reachability (pacing is a design concern, measured separately via `expectedEntrySeconds` telemetry).
5. **Adversarial passes:** re-run with (a) every optional action also taken (proves optional actions can't wedge required state), (b) each mandatory item dropped/misplaced at every legal opportunity before use (feeds V-LOST), (c) one simulated player removed mid-walk after each phase (proves disconnect redistribution paths exist).
6. **Matrix:** repeat for every supported player count (V-COUNT) and every randomization pool element (V-RAND). Runs are deterministic given (package, count, seed), so failures are exactly reproducible.

A dead-end (non-empty unsolved required set with an empty frontier) fails the build and prints the state hash, the walk transcript, and the unsatisfiable conditions.

---

## 10. Versioning and compatibility policy

- **Package versions are immutable.** Hotfixes bump patch version; active sessions finish on the version they started with (session stores `(packageId, version)` in `GAME_SESSIONS`).
- **Schema version** (`engineCompat.schemaVersion`) bumps only on breaking schema changes; the platform supports at most two schema majors at once during migration.
- **Activation/rollback** of a version for new bookings is an admin-dashboard operation (brief §29); rollback is instant because prior versions remain in R2.

## 11. PLANNED (not in V1)

| Item | Reason deferred |
|---|---|
| Visual room-authoring editor emitting this schema | Hand-authored JSON + validators are sufficient for Room #1–2; build tooling after we learn which authoring steps hurt (brief §23/§31). |
| Multi-language subtitle tracks | Schema supports `language` now; launch content is English-only. |
| Per-room proximity-voice rules in schema | Burn Window mandates intercom-style voice (brief §8); schema slot reserved but unimplemented until a room's design needs it. |
| Signed package manifests (cryptographic) | `contentHash` + private R2 path covers V1 threat model; signing matters when third-party/UGC rooms exist (brief §30). |
