# OPERATOR_AND_HINTS.md — Zero-Host Automated Operator

Status: engineering specification for `packages/operator/`.
Related: [ROOM_SCHEMA.md](./ROOM_SCHEMA.md) (hint ladders, operator facts, and narrative cues are authored in the room package) · [PUZZLE_COMPONENTS.md](./PUZZLE_COMPONENTS.md) (canonical puzzle state that grounds every hint).

**Defining product constraint (brief §3):** a normal paid RealTimeEscape session has NO live human game master, host, or clue giver — ever. The session starts itself, tracks progress, gives hints, answers approved questions, handles reconnects, decides win/loss, and debriefs, all automatically. Developers and support staff exist, but a paid session must never *depend* on one being online. Any design that quietly assumes "someone will jump in" is a defect.

In Burn Window the operator is an in-fiction damaged ship-assistance system (persona/naming is a creative decision, not locked here). Architecturally the operator is three layers:

```
┌────────────────────────────────────────────────────────────┐
│ 1. CANONICAL STATE (Colyseus server)                       │
│    exact puzzle/session truth — the only source of truth   │
├────────────────────────────────────────────────────────────┤
│ 2. DETERMINISTIC HINT ENGINE (packages/operator)           │
│    picks eligible puzzle + tier; no AI involved            │
├────────────────────────────────────────────────────────────┤
│ 3. DELIVERY (optional AI voice-wrapping on top)            │
│    prerecorded audio → TTS → on-screen text                │
│    AI may rephrase approved facts; may never invent        │
└────────────────────────────────────────────────────────────┘
```

The LLM is an optional stylist at layer 3. Layers 1–2 fully determine *what* help is given; the game is completable with layer 3's AI entirely offline. No continuously running LLM: the operator is state-driven and invokes AI per-utterance only when useful (cost + failure-surface control, brief §3).

---

## 1. What the operator does

| Responsibility | Source of content | Typical delivery |
|---|---|---|
| Welcome/briefing, rules | Authored script | Prerecorded |
| Mission/context reminders, time milestones | Authored script + timer state | Prerecorded |
| State-aware hints (3 tiers) | Hint ladders in room package | Prerecorded → TTS → text |
| Repeating already-discovered information | `OperatorFact` (discoveredClue) | TTS → text |
| Explaining controls / UI indicators | `OperatorFact` (controls) | TTS → text |
| Confirming system readiness (e.g. thruster armed) | Canonical component state | Prerecorded stingers + text |
| Success/failure/debrief lines | Authored script | Prerecorded |
| Optional state-grounded spoken Q&A | `OperatorFact` selection | TTS → text (PLANNED, see §8) |

The operator is **never** the source of canonical puzzle truth. It reports and rephrases truth owned by the server.

---

## 2. Deterministic Hint Engine

The Hint Engine runs inside the game server process, on canonical state only. It is pure and deterministic: same state + same history ⇒ same decision. That makes it unit-testable (brief §27, "hint eligibility/tiering") and auditable from the session event log.

### 2.1 Which puzzle is eligible

1. Compute the **frontier**: unsolved puzzles whose dependency-graph predecessors ([ROOM_SCHEMA.md](./ROOM_SCHEMA.md) `dependencyGraph` + implicit `priorPuzzleSolved` edges) are all solved. Only frontier puzzles are hintable — never hint a puzzle the team can't act on yet (spoiler + confusion).
2. Filter to `required: true` puzzles first; optional puzzles are hintable only when no required frontier puzzle qualifies under §2.2 pressure rules.
3. If multiple candidates remain, rank by **stall score** (descending):
   `stallScore = timeSinceLastProgressOnPuzzle + phaseOverrun`
   where `phaseOverrun = max(0, timeInPhase − expectedEntrySeconds delta)` from the package's pacing metadata. Deterministic tie-break: dependency-graph topological order, then `puzzleId` lexicographic.
4. Role-scoped hints (`audience: "role"`) are eligible only while at least one connected player holds the role; otherwise the engine substitutes the team-audience form (disconnect safety, [PUZZLE_COMPONENTS.md](./PUZZLE_COMPONENTS.md) §4).

“Progress on puzzle” means any accepted interaction event on an object referenced by that puzzle's conditions — component signals give this for free ([PUZZLE_COMPONENTS.md](./PUZZLE_COMPONENTS.md) §1).

### 2.2 When and which tier

Hints are offered two ways; both go through the same tier ladder:

- **Requested:** any player presses the HELP control (always visible; zero-host means help is never hidden behind a human).
- **Proactive:** the engine offers (not forces) a hint when stall thresholds trip.

Tier selection for the chosen puzzle:

| Situation | Serve |
|---|---|
| No hints yet given for this puzzle | Tier 1 (nudge) |
| Tier 1 given ≥ `tierCooldownSeconds` ago and puzzle still unsolved | Tier 2 (direction) |
| Tier 2 given ≥ `tierCooldownSeconds` ago and puzzle still unsolved | Tier 3 (explicit) |
| Highest tier already given | Re-deliver highest tier verbatim (repeat is free) |

Defaults (per-room tunable in the package, values below are Burn Window launch settings):

```
proactiveOfferAfterSeconds  = 240   // stall with no accepted interactions on frontier puzzle
requestServesNextTierAfter  = 90    // a request < 90s after last hint re-serves same tier
tierCooldownSeconds         = 120   // minimum spacing between tiers of one puzzle
finalActPressureMultiplier  = 0.5   // Act IV halves thresholds; the clock is the drama
```

Requests always serve **at most one tier step up** per cooldown window — a team spamming HELP gets the same tier repeated, not an instant walkthrough. Every decision is logged to `SESSION_EVENTS` with `(puzzleId, tier, trigger, stallScore)` for the hint-analytics dashboard (brief §28/§29).

### 2.3 What the engine outputs

The engine never emits prose of its own. It emits a `HintDecision` (see §6) referencing the authored `HintTier` from the room package — canonical text, optional prerecorded clip, rephrasability flag, audience. Delivery (§4) takes it from there.

---

## 3. The AI boundary — hard rules

When AI is used at all, it operates under this contract:

**The AI may:**
- Select among, and rephrase, **authored, server-approved facts** (`HintTier.text` with `aiRephrasable: true`, and `OperatorFact` entries whose `unlockedBy` condition is satisfied) in the operator's persona and tone.
- Add connective persona phrasing ("Auxiliary systems report…") around the fact.
- Compress or repeat previously delivered approved content.

**The AI may NEVER:**
- Invent puzzle solutions, codes, sequences, or object locations not present in the supplied approved facts.
- Alter game state. The AI has **no tool calls, no write path, and no message channel to the game server**. It is a text-in/text-out stylist; enforcement is architectural, not a prompt request.
- Create new rules, promises, or mechanics ("try restarting", "you have extra time").
- Reference objects, rooms, characters, or systems absent from the grounding payload (§6.2) — the payload is the AI's entire visible world; it never sees the full room package, solutions to unsolved puzzles beyond the approved tier text, or other sessions.
- See or repeat player personal data beyond display names.

**Post-generation gate (deterministic, server-side):** before delivery, the rephrased text is checked: (a) length bounds; (b) must not contain digit/code-like tokens absent from the source fact (regex over `[0-9]{3,}` and authored solution vocabulary); (c) `aiRephrasable: false` content is never sent to the AI at all — tier-3 explicit solutions are delivered verbatim from authored text/audio. Any gate failure silently falls back to the canonical authored text (§4). A failed rephrase must be invisible to the player, not an error state.

---

## 4. Layered fallback chain

A paid game must remain completable when the LLM, speech pipeline, or TTS vendor is down (brief §3.7). Every utterance resolves through this chain, per utterance, with short timeouts:

```
1. PRERECORDED AUDIO   HintTier.prerecordedAudio / narrative cue clip exists
   │                   and loads from CDN within timeout (2s)
   ▼ else
2. TTS                 canonical (or gate-passed rephrased) text → TTS vendor,
   │                   hard budget 3s to first audio byte
   ▼ else
3. ON-SCREEN TEXT      canonical authored text rendered in the operator HUD panel
                       + persisted to the team clue board. Always available:
                       text ships inside server.rules.json — zero external
                       dependencies. This layer cannot fail independently of
                       the game itself.
```

Rules:

- The chain degrades **per utterance**, and recovers per utterance — one TTS timeout doesn't disable TTS for the session, but 3 consecutive failures trip a session-local circuit breaker that skips straight to text for 5 minutes (no repeated 3s stalls).
- AI rephrasing sits *inside* step 2 with its own budget (2s): LLM timeout/failure/gate-failure ⇒ TTS of the canonical text; TTS failure ⇒ step 3. Failure of the optional layer never blocks the mandatory content.
- Subtitles/text (§5.2) accompany steps 1 and 2 anyway, so step 3 is a floor, not a different experience.
- Major narrative moments (briefing, reveal, success, failure) are **always** prerecorded (brief §3.6) — polished, reliable, and cinematically consistent; TTS is for dynamic/synthesized lines only.
- All fallback transitions are logged (`operator.fallback` event) for the session-health dashboard.

---

## 5. Audio priority & accessibility

### 5.1 Operator audio queue

One operator voice; it must never talk over cinematics or itself (brief §15). Single-consumer priority queue on the server; clients receive ordered play directives.

| Priority | Class | Examples | Preemption behavior |
|---|---|---|---|
| P0 | Cinematic | briefing, crew reveal, success/failure endings | Preempts and **pauses the operator queue**; operator never speaks during P0 |
| P1 | Critical game state | burn-window milestones (T-10:00, T-5:00, T-1:00), burn result | Queues ahead of P2/P3; may interrupt a P3 line at a sentence boundary |
| P2 | Hints | tier deliveries, readiness confirmations | FIFO; waits for current line to finish |
| P3 | Flavor/reminders | context reminders, control explanations | FIFO; dropped if stale (staleness window 30s) when higher classes are queued |

Rules: at most one operator line audible at a time; a line preempted mid-sentence is re-queued from its start; time-critical lines carry a `notAfter` game-time — a "T-5:00" warning that couldn't play by T-4:40 is dropped, not played late and wrong. Ambient/music duck under operator speech and team voice (brief §15); the operator does not duck under team voice — it is short-spoken by design instead.

### 5.2 Subtitles & accessibility (required, brief §18)

- Every operator utterance — prerecorded, TTS, or rephrased — renders synchronized text in the operator HUD panel. Prerecorded clips use authored `SubtitleTrack`s; TTS lines display their source text.
- Every delivered hint is **persisted** to the team clue board, not just spoken — late joiners, reconnecting players, and players who missed the audio can re-read it.
- Essential audio-only information always has a visual equivalent (build rule V-SUBS, [ROOM_SCHEMA.md](./ROOM_SCHEMA.md) §8).
- No essential information is conveyed by color alone; randomized symbol/color mappings carry `accessibleAlternativeRequired` in the schema.
- Operator text respects UI-scaling settings; reduced-motion setting suppresses any operator-panel animation.
- A player with no working audio output must be able to complete the room via subtitles + clue board + team text chat. This is a zero-host failure test case (§7).

---

## 6. TypeScript contracts

`packages/operator/src/contract.ts`:

```ts
// ─────────────────────────────────────────────
// Hint Engine (deterministic, server-side)
// ─────────────────────────────────────────────

interface HintEngine {
  /** Pure decision from canonical state + hint history. No I/O, no AI. */
  decide(input: HintDecisionInput): HintDecision | null;   // null = nothing eligible
}

interface HintDecisionInput {
  trigger: "playerRequest" | "proactiveTick";
  requestingPlayerId?: string;
  state: CanonicalHintState;          // see §6.1
  history: HintHistoryEntry[];        // all prior decisions this session
  tuning: HintTuning;                 // per-room thresholds (§2.2)
}

interface HintDecision {
  puzzleId: ContentId;
  tier: 1 | 2 | 3;
  isRepeat: boolean;                  // re-delivery of already-served tier
  audience: "team" | "role";
  roleId?: ContentId;
  /** Resolved authored content — the ONLY content delivery may use. */
  content: {
    canonicalText: string;
    prerecordedAudio?: ContentId;
    aiRephrasable: boolean;
  };
  reason: {                           // logged to SESSION_EVENTS for auditability
    stallScore: number;
    frontier: ContentId[];
    trigger: HintDecisionInput["trigger"];
  };
}

interface HintHistoryEntry {
  puzzleId: ContentId; tier: 1 | 2 | 3; atGameTimeMs: number;
  deliveredVia: "prerecorded" | "tts" | "text";
}

interface HintTuning {
  proactiveOfferAfterSeconds: number;
  requestServesNextTierAfter: number;
  tierCooldownSeconds: number;
  finalActPressureMultiplier: number;
}

// ─────────────────────────────────────────────
// §6.1 Canonical state visible to the Hint Engine
// ─────────────────────────────────────────────

interface CanonicalHintState {
  gameTimeMs: number;
  timeRemainingMs: number;
  phaseId: ContentId;
  puzzles: Record<ContentId, {
    solved: boolean;
    required: boolean;
    onFrontier: boolean;
    lastProgressAtMs: number | null;   // last accepted interaction on a referenced object
  }>;
  roles: Record<ContentId, { connectedHolders: number }>;
  connectedPlayers: number;
}

// ─────────────────────────────────────────────
// Operator delivery pipeline
// ─────────────────────────────────────────────

interface OperatorDelivery {
  /** Resolve an utterance through the fallback chain (§4) and enqueue (§5.1). */
  deliver(u: OperatorUtterance): Promise<DeliveryReceipt>;
}

interface OperatorUtterance {
  utteranceId: string;
  priorityClass: "P0" | "P1" | "P2" | "P3";
  notAfterGameTimeMs?: number;         // stale-drop deadline (§5.1)
  audience: "team" | "role"; roleId?: ContentId;
  source:
    | { kind: "hint"; decision: HintDecision }
    | { kind: "narrativeCue"; cueId: ContentId }               // authored, always prerecorded for P0
    | { kind: "fact"; factId: ContentId; canonicalText: string; aiRephrasable: boolean };
}

interface DeliveryReceipt {
  utteranceId: string;
  deliveredVia: "prerecorded" | "tts" | "text";
  aiRephrased: boolean;                // false on any AI timeout/gate failure
  fallbacksTaken: ("prerecordedFailed" | "aiFailed" | "aiGateRejected" | "ttsFailed")[];
  subtitleShown: true;                 // structurally always true (§5.2)
}

// ─────────────────────────────────────────────
// §6.2 AI state-grounding payload — the ENTIRE world the LLM sees
// ─────────────────────────────────────────────

/**
 * Built server-side per utterance. Nothing outside this object reaches the model.
 * Contains NO unsolved-puzzle solutions beyond the approved tier text itself,
 * NO room-package internals, NO other players' private notes, NO PII beyond
 * display names.
 */
interface OperatorGroundingPayload {
  persona: {
    name: string;                      // in-fiction operator name
    styleGuide: string;                // authored voice/tone rules from the package
  };
  session: {
    phaseId: ContentId;
    timeRemainingClock: string;        // "23:41" — preformatted; model never does arithmetic
    playersConnected: number;
    playerDisplayNames: string[];
  };
  /** The single approved fact to deliver. Never more than one per utterance. */
  approvedContent: {
    kind: "hintTier" | "operatorFact";
    canonicalText: string;             // the fact; rephrase THIS and nothing else
    audienceNote: "team" | "role";
  };
  /** Facts already legitimately known to the team; the model may reference them
   *  for continuity but must not extend them. */
  discoveredContext: { factId: ContentId; text: string }[];   // capped at 12, most recent
  constraints: {
    maxSentences: number;              // typically 2
    mustNotInclude: "anything not stated in approvedContent or discoveredContext";
  };
}
```

Wiring: Colyseus room ticks the Hint Engine (`proactiveTick` every 15s; `playerRequest` on HELP), passes any `HintDecision` to `OperatorDelivery`, and appends the receipt to `SESSION_EVENTS`. The AI client used inside `deliver` is an isolated HTTP dependency with no reference to the room object — the no-write-path rule (§3) is a compile-time property, not a convention.

---

## 7. Zero-host failure tests

CI + staging suite (brief §27) that intentionally breaks each dependency and asserts the automated path holds. The team must never be stranded waiting for a human. Each test runs a scripted 3-client session against a real server with fault injection at the named boundary.

| Test | Injected failure | Required automated outcome |
|---|---|---|
| ZH-1 LLM down | AI endpoint returns 500 / times out for entire session | Every hint still delivered via prerecorded or TTS of canonical text; `aiRephrased: false` on all receipts; zero player-visible errors; session completable |
| ZH-2 TTS down | TTS vendor unreachable | Dynamic lines render as on-screen text + clue board; prerecorded clips unaffected; circuit breaker trips after 3 failures (no repeated stalls); session completable |
| ZH-3 Prerecorded clip broken | One hint clip + one P1 milestone clip return 404 from CDN | Per-utterance fallback to TTS (or text if ZH-2 also active); P0 cinematics tested separately with a bundled low-res fallback asset; session completable |
| ZH-4 One player's voice down | Kill one client's LiveKit connection during Act IV | Voice-down player can still play; team text chat + persisted hint/clue text suffice; burn coordination achievable (navigator types, or another player relays); no engine dependency on voice presence |
| ZH-5 One player's game connection down | Hard-disconnect one client (a) mid-puzzle holding an exclusive item, (b) as sole navigator during Act IV | Timer continues (individual loss doesn't pause, brief §17); lease grace → force-release lands item reachable ([PUZZLE_COMPONENTS.md](./PUZZLE_COMPONENTS.md) §4.5); role-locked info re-published to team; reconnect restores seat/avatar/leases; solvability maintained at reduced player count |
| ZH-6 Everything at once | ZH-1 + ZH-2 + ZH-3 simultaneously | Pure-text operator mode end-to-end; scripted session still reaches success |

Assertions common to all: no state divergence across clients, no orphaned lease, `SESSION_EVENTS` records every fallback, and no code path pages/notifies a human as part of recovery (grep-level assertion on the recovery paths: alerting exists for ops observability, but no recovery step *waits* on anything human).

If platform health confirms a qualifying unrecoverable failure (none of the above — e.g. total server loss with unrestorable checkpoint), the automated self-service credit/reschedule flow triggers (brief §17). That flow is commerce-side and specified with the booking system, but its *trigger* is emitted by the session health monitor, not a person.

---

## 8. PLANNED (not in V1)

| Item | Reason deferred |
|---|---|
| Spoken Q&A (players ask the operator questions by voice) | Requires STT + intent matching against `OperatorFact`s; the HELP button + fact browsing covers the need at launch. Q&A adds STT as a new failure surface and must ship with its own fallback (typed question → same fact selector) — build after core zero-host suite is green. |
| Per-client RTT compensation in burn-timing fairness | Tolerance window (1,500 ms) exceeds expected jitter for supported broadband; revisit only if beta telemetry shows unfair mistimed failures ([PUZZLE_COMPONENTS.md](./PUZZLE_COMPONENTS.md) MultiPlayerTrigger). |
| Voice-driven operator persona continuity across sessions (remembering a returning team) | Needs profile-linked memory + privacy review; no gameplay dependency. |
| Multi-language operator | Subtitle schema and fact text are language-keyed already; content is English-only at launch. |
| Dynamic difficulty (auto-serving hints faster to struggling teams beyond the pressure multiplier) | Needs real playtest distributions first (brief §28 analytics); tuning knobs exist, policy changes deferred. |
