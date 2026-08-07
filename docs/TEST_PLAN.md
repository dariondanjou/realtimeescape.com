# TEST_PLAN.md

**Scope:** RealTimeEscape platform + Burn Window
**Status:** Testing strategy, v1. This document defines what is tested, with concrete example cases, and which tests gate merges and production deploys. Test suites marked **PLANNED** do not exist yet because the code they test does not exist yet (pre-Phase 0 repo); they are listed here so the suites are built *with* the features, not retrofitted (brief, Section 26, rules 9–10).

Related documents:

- [Performance budgets](../docs/PERFORMANCE_BUDGET.md) — the perf/payload/network gates referenced in Section 11 are defined there.
- [Architecture](../docs/ARCHITECTURE.md) — authoritative-server model, session lifecycle, and room-package structure under test. *(PLANNED — file not yet written; listed in the brief's required first documents.)*
- [Master build brief](MASTER_BUILD_BRIEF.txt) — Section 27 is the source testing strategy; Section 32 is the paid-beta definition of done that this plan operationalizes.

Core testing principles:

1. **The server is the truth; tests assert server truth.** Client-side assertions verify *presentation of* canonical state, never define it.
2. **The zero-host constraint is a tested property, not a policy statement.** Every automated-operations claim (hints, fallbacks, recovery, refund path) has a failure-injection test (Section 10).
3. **Solvability is proven by machine, not by playtester luck.** Every shipped room version and every randomization seed class must pass automated reachability tests (Section 5).
4. **Determinism first.** Puzzle logic is discrete conditions/effects with seeded randomization, so unit and solvability tests can be exact, not flaky.

Layers (bottom-up): unit → state/solvability → multi-client E2E → network chaos → device/browser matrix → payment/booking E2E → zero-host failure injection.

---

## 1. Test Infrastructure Overview

| Layer | Runner | Where it lives | Status |
|---|---|---|---|
| Unit | Vitest (TypeScript, monorepo packages) | `packages/*/test`, `rooms/burn-window/tests` | PLANNED — created with each package per brief rule 9 |
| State/solvability | Vitest + room-package solver harness | `packages/room-schema`, `rooms/burn-window/tests` | PLANNED — harness is part of room-schema validation tooling |
| Multi-client E2E | Playwright (multiple browser contexts + real Colyseus server) | `e2e/` | PLANNED — required "early" per brief rule 10; first target is the Phase 0 acceptance scenario |
| Network chaos | Playwright + network condition injection (CDP throttling, proxy-level loss) + server kill/restart scripts | `e2e/network` | PLANNED — depends on checkpoint/reconnect implementation |
| Device/browser matrix | Playwright projects (Chromium/Edge/WebKit) + manual device lab passes | `e2e/` + release checklist | PLANNED |
| Payment/booking E2E | Playwright + Stripe test mode + `stripe` CLI webhook forwarding | `e2e/commerce` | PLANNED — built with Phase 2 commerce |
| Zero-host failure injection | E2E harness with service fault flags | `e2e/zero-host` | PLANNED — fault flags are a required design feature of each external-service adapter |

Convention: every reusable puzzle/interaction component ships with its unit tests in the same PR (brief rule 9). A component PR without tests is an incomplete PR.

---

## 2. Unit Tests

Fast, deterministic, no network, no browser. Run on every PR. Concrete example cases per area:

### 2.1 Puzzle conditions/effects (`packages/puzzle-engine`)

- Condition `item-in-inventory` is true only when the item is in the specified (personal vs. team) inventory.
- Condition `switch-pattern` matches exact pattern, rejects partial and superset states.
- Condition `multi-station-ready` requires *all* declared stations, not any subset.
- Condition `within-time-tolerance` accepts two events at tolerance boundary, rejects boundary + 1 ms (server clock).
- Effect `open-door` transitions door state and is idempotent (applying twice does not corrupt state or double-fire triggers).
- Effect `publish-clue` publishes to exactly the declared audience scope (team / role / player).
- Effect ordering: effects of one solved puzzle apply atomically — a client can never observe a half-applied effect list.
- Unknown condition/effect type in room data is rejected at load, not at first evaluation mid-game.

### 2.2 Inventory transitions (`packages/interaction-engine` / `game-core`)

- Pickup moves object world → personal pocket; object remains a canonical server object.
- Transfer personal → team evidence tray preserves object identity and history.
- Drop/place is rejected where puzzle rules disallow placement; state unchanged on rejection.
- Personal pocket capacity limit enforced; over-capacity pickup rejected with a typed error.
- An item consumed by a puzzle effect is removed exactly once even under duplicate client requests.
- Pinning an object to the team clue board creates a reference, not a duplicate canonical object.

### 2.3 Interaction leases

- Lease grant: first eligible requester gets the lease; concurrent second request is rejected.
- Lease scope: leaseholder alone may send manipulation inputs for that object.
- Lease release on explicit drop; lease auto-expiry after inactivity timeout.
- **Disconnect reclamation:** leaseholder disconnect starts the lease-recovery timer; after timeout the object is released and interactable by others (this is also asserted end-to-end in Sections 5 and 8).
- Multi-user objects declared `multi-manipulation` accept concurrent leases up to the declared count.

### 2.4 Session timing / state machine

- Lifecycle transitions follow `CREATED → AWAITING_SEATS/CONFIRMED → LOBBY_OPEN → READY → BRIEFING → ACTIVE → ESCAPED|FAILED → DEBRIEF → ARCHIVED`; illegal transitions (e.g. `LOBBY_OPEN → ESCAPED`) throw.
- 60-minute timer is server-authoritative: timer derives from server start timestamp, not accumulated ticks (drift-proof under event-loop delay).
- Timer reaching zero in `ACTIVE` with no valid trajectory transitions to `FAILED` exactly once.
- Individual player disconnect does **not** pause the timer; verified-platform-incident pause does, and both decisions produce audit events.
- Roster locks at start; late join attempts after lock are rejected with the correct error.
- All stored times are UTC.

### 2.5 Hint eligibility and tiering (`packages/operator`)

- Hint engine selects only *unsolved, currently reachable* puzzles as hint-eligible.
- Tier progression 1 → 2 → 3 in order; tier N+1 unavailable until tier N delivered and cooldown elapsed.
- Hints for already-solved puzzles are never offered.
- Every required puzzle in the room package has a complete 3-stage hint ladder (this is also a schema-validation failure, Section 2.8).
- Hint audience scoping: role-scoped hint is queued only to that role's players.
- Deterministic fallback: with the LLM/TTS adapters disabled, the engine returns the canonical authored hint text for the same state (paired with Section 10 E2E).

### 2.6 Burn timing tolerance (`rooms/burn-window/server` + `puzzle-engine`)

- Two-station burn: both burn events inside tolerance window ⇒ stage valid.
- One event outside tolerance by 1 ms ⇒ stage invalid; server issues recalculation/setback per rules, **not** an immediate session fail.
- Three-station variants: all N stations must be inside tolerance, pairwise and against the commanded window.
- Burn duration validated (held ≥ commanded duration − tolerance, ≤ + tolerance).
- Arming order enforced when the seed's instructions specify order.
- Timing truth uses server receipt timestamps; client-supplied timestamps are ignored (anti-spoof).
- Retry cost: failed burn consumes time / triggers recalculation, and retry state is consistent (no stuck "armed" flags).

### 2.7 Player-count scaling

- Room scaling rules produce a valid configuration for every supported count 3–8.
- At 3 players, the final act requires 1 cockpit + 2 thruster operators and the generated instructions never require more simultaneous stations than players present.
- At 8 players, all seats receive a defined role-information allocation (no idle player receives zero asymmetric content by accident of scaling rules).
- Mid-game disconnect below minimum does not generate instructions requiring more simultaneous operators than connected players (redistribution rule fires — see Section 5).

### 2.8 Room schema validation (`packages/room-schema`)

- Valid Burn Window package parses; every negative case below is rejected with a precise error path:
  - Reference to a nonexistent object id in any condition/effect.
  - Missing hint ladder for a required puzzle.
  - Client bundle containing server-only solution data (canonical answers must never ship to the browser).
  - Version mismatch between server and client package manifests.
  - Randomization rule whose variable domain includes an unsolvable combination (cross-checked with Section 5 seed validation).
  - Missing player-count scaling entry for any supported count 3–8.
  - Interactable declared exclusive **and** multi-manipulation (contradictory).

---

## 3. State/Solvability Tests

Automated solver harness executes valid state transitions against the real server-side puzzle graph — it does not "understand" puzzles, it proves the graph reaches success (brief, Section 12). Run on every room-package change and nightly.

Example cases:

- **Path to success exists:** from the initial `ACTIVE` state, the solver reaches `ESCAPED` using only legal transitions, for every supported player count 3–8.
- **Every randomized final-burn seed validates:** for the full seed domain (exhaustive if enumerable, otherwise a fixed large sample plus all boundary combinations), the generated burn instructions are executable by the available stations/player count and the solver completes the burn. A single invalid seed fails the room-package build.
- **Required items cannot permanently disappear:** for every mandatory item, no sequence of legal transitions (drop, place, consume, transfer, disconnect of holder) reaches a state where the item is unreachable and success is unreachable. Model-checked over the item-state graph; any absorbing "lost" state fails.
- **Disconnect cannot orphan an exclusive object forever:** for every exclusive interactable, simulate leaseholder disconnect at every lease-holding state; assert the lease-recovery timeout returns the object to an interactable state and the solver can still reach success.
- **Solved-state monotonicity:** no effect can un-solve a required puzzle or close a door whose closure makes success unreachable.
- **Hint completeness under randomization:** for each seed, every required puzzle in that seed's configuration has a resolvable hint ladder (no ladder referencing a variable value that seed didn't generate).

---

## 4. Multi-Client E2E (Playwright)

Real Next.js client + real Colyseus server + N Playwright browser contexts in one session. Voice media paths use LiveKit test rooms with synthetic audio tracks where full audio E2E is impractical; voice *connection* success is always asserted. This suite's first milestone is the Phase 0 acceptance scenario (brief, Section 24).

Example cases:

- **3 clients join:** three contexts create/join one private session; all reach `ACTIVE`; server roster shows exactly 3.
- **8 clients join:** scale case at max supported count; join order shuffled; all reach `ACTIVE` without roster corruption.
- **Remote avatars appear and update:** client A moves; clients B/C observe A's avatar transform and locomotion state change within an interpolation-appropriate window (assert on observed state stream, not pixel comparison).
- **Shared object changes replicate:** A picks up an object; B and C see the world object removed and the team tray updated; A drops it; all clients converge.
- **Asymmetric views correctly DIFFER:** in the final act, the cockpit client displays the generated maneuver instructions; thruster clients do **not** — asserted at two levels: (1) UI: instructions absent from thruster DOM/HUD; (2) protocol: the serialized state received by thruster clients contains no cockpit-only fields, and the cockpit client receives no thruster-station-only control data (captured via instrumented client transport). A leak at the protocol level fails even if the UI hides it.
- **Shared inventory syncs:** team evidence tray and clue-board pins converge across all clients after concurrent additions from two clients.
- **Hints reach the intended audience only:** trigger a role-scoped hint; the target role's clients receive text (and TTS event where enabled); other clients receive nothing — asserted at the protocol level as above.
- **Final burn coordination validates:** scripted clients execute the seed's instructions — cockpit arms/confirms, thruster clients configure and fire within tolerance; server declares stage success; a deliberately mistimed run produces the recalculation/setback path, not a hard fail.
- **Result is identical on all clients:** on `ESCAPED` (and separately `FAILED`), every client renders the same result, completion time, and debrief data; server session record matches.
- **Reconnect mid-session (Phase 0 step 15):** one client drops and rejoins; it reclaims the same seat/avatar and current canonical state; other clients' worlds are undisturbed.

---

## 5. Network Tests

Same multi-client harness under injected network conditions (CDP network throttling per context; proxy-level loss injection where CDP is insufficient; process-level kill for server restart).

Example cases:

| Condition | Injection | Assertion |
|---|---|---|
| Typical broadband latency | 40 ms RTT, all clients | Full happy-path E2E passes; burn coordination succeeds; bandwidth within [network budgets](../docs/PERFORMANCE_BUDGET.md#6-network-budgets) |
| Elevated latency | 150–250 ms RTT on one client, mixed-latency team | Session playable; burn tolerance validation remains server-clock-fair (the high-latency player is not spuriously failed when pressing on time relative to received cues); no desync in shared state |
| Brief packet loss | 5% loss for 30 s bursts | State converges after each burst; no permanently missed puzzle-state patch (reliable channel or reconciliation covers gaps); no duplicate effect application |
| Client disconnect/reconnect | Kill one client's socket mid-act; rejoin after 60 s | Seat reclaimed, state rehydrated (snapshot ≤ 64 KB budget), leases held by the player recovered per timeout rules, timer never paused |
| Game-server restart / checkpoint recovery | Kill the Colyseus room process mid-`ACTIVE`; restart | Session restores from the latest checkpoint (≤ 30 s + last major transition old); all clients auto-reconnect and converge; timer policy applied deterministically (verified-incident pause rules) and audit events recorded; if recovery is impossible, the automated technical-credit path fires (Section 10) |

---

## 6. Device/Browser Matrix

Automated where Playwright supports the engine; manual lab passes (release checklist) where it does not. WebKit/Safari automation approximates Safari — real-Safari manual passes are required before launch.

| Target | How tested | Gate |
|---|---|---|
| Modern Chrome (current − 1) | Playwright Chromium project, full E2E | PR + nightly |
| Modern Edge (current − 1) | Playwright `msedge` channel, smoke + nightly full | Nightly |
| Safari (where supported by final requirements) | Playwright WebKit smoke + manual real-device pass | Release checklist; Safari support level is a launch-requirements decision recorded in [ARCHITECTURE.md](../docs/ARCHITECTURE.md) *(PLANNED)* |
| WebGPU path | Chromium with WebGPU enabled; render smoke asserts WebGPU engine actually active (not silently fallen back) | Nightly |
| WebGL2 fallback | Chromium with WebGPU force-disabled; identical gameplay E2E must pass | Nightly — fallback is a first-class path, not best-effort |
| Integrated-GPU baseline | Pinned baseline machine (device lab, PLANNED): lobby device test result, tier selection = Low/Medium, frame-time percentile budgets per [PERFORMANCE_BUDGET.md](../docs/PERFORMANCE_BUDGET.md#12-frame-time-budgets-measured-not-averaged) | Release checklist + beta telemetry |
| Discrete-GPU high profile | Pinned strong machine: tier selection = High/Ultra, 60 FPS-target percentiles | Release checklist + beta telemetry |

Cross-cutting assertions: quality tier auto-selection is correct per profile; a Low-tier client and an Ultra-tier client in one session see identical puzzle-relevant content (tier changes rendering cost only — any clue unreadable on Low is a content bug).

---

## 7. Payment/Booking E2E

Stripe test mode only until flows are fully verified (brief rule 11). Webhooks, not client redirects, provision access — every case asserts **database truth** (bookings, seats, invitations, payments) after webhook processing, plus the customer-visible outcome. PLANNED — built with Phase 2 commerce.

Example cases:

- **Host pays all:** host buys N seats in one Checkout session; webhook provisions booking + N seats; lobby admits exactly N claimed players.
- **Split payment:** host pays own seat, sends invites; each friend pays own seat via their invitation; all seats map to the same booking; partial-paid team state renders correctly in lobby.
- **Invite claim:** valid invitation token claims a seat exactly once; second claim attempt of the same token fails cleanly; token is unguessable-format (asserted by construction, entropy check).
- **Expired invite:** claim after expiry is rejected with the correct customer-facing state and no seat mutation.
- **Duplicate webhook idempotency:** replay the same `checkout.session.completed` event (same event id) 3×; exactly one provisioning occurs; replayed events are acknowledged without side effects. Also: out-of-order event delivery does not corrupt booking state.
- **Failed/cancelled checkout:** abandoned and card-declined Checkout sessions leave no claimed seat, no entitlement, and a booking state from which the customer can retry.
- **Scheduled lobby:** scheduled booking's lobby opens ~15 minutes before start (clock-controlled test), admits only paid/claimed seats, and transitions to `READY`/`BRIEFING` correctly.
- **Instant lobby:** PLAY NOW creates a private lobby + shareable invitation immediately after payment; end-to-end from payment to `ACTIVE` with 3 clients.
- **Also load-bearing:** payload/asset load success in lobby is part of the lobby health check E2E (ties to [PERFORMANCE_BUDGET.md](../docs/PERFORMANCE_BUDGET.md#2-asset-payload-budgets) payload gate).

---

## 8. ZERO-HOST Failure Tests

The defining constraint (brief, Sections 3, 27): **no live human is ever a gameplay dependency.** Each external dependency adapter (LLM, TTS, media CDN, LiveKit, Colyseus transport) must expose a fault-injection flag in test builds — this is a required design property, so these tests are buildable. In every scenario below, the assertion is the same shape: *the team retains a defined, automated path to continue and finish, and at no point is any player waiting on a human game master.* A test also fails if any UI surface tells players to "contact support to continue" as the primary path.

| Broken on purpose | Injection | Required automated behavior asserted |
|---|---|---|
| **LLM operator response** | LLM adapter returns errors/timeouts | Hint engine serves the canonical authored hint text deterministically; operator Q&A degrades to authored responses/text; hint ladders remain fully usable; session completable end-to-end |
| **TTS** | TTS adapter fails | Every operator/hint line is delivered as on-screen text and/or prerecorded fallback audio; essential information is never voice-only; subtitles path verified |
| **A prerecorded clip load** | CDN 404/timeout for one narrative clip | Playback layer skips/substitutes per fallback rules (text summary or fallback audio of the essential content); game state advances past the trigger; no stuck state waiting on media |
| **One player's voice connection** | Kill one client's LiveKit connection, block reconnect | Player sees clear voice-down state; text chat fallback available; game remains completable — critical burn instructions can be relayed via teammates and text; the session never blocks on that player's audio |
| **One player's game connection** | Hard-drop one client's Colyseus connection during the final act, no rejoin | Leases recover per timeout; role-critical information is redistributed or an alternate path opens so remaining players can still succeed (Section 2.7/3 redistribution rules); timer continues; if the player returns, reconnection restores them |

Additional zero-host case: **unrecoverable platform failure** (server restart test in Section 5 with recovery forced to fail) must automatically produce the self-service replay/reschedule credit path — no human contact required to be made whole.

---

## 9. Test Commands

Canonical commands (wired into the monorepo root as the packages come into existence; names are the contract, PLANNED until each suite lands):

```bash
pnpm test                  # all unit tests (Vitest, all packages) — fast, no network
pnpm test:unit             # alias of the above
pnpm test:solver           # state/solvability harness incl. full seed validation
pnpm test:schema           # room-package schema validation for all rooms
pnpm test:e2e              # Playwright multi-client suite (spins up server + web app)
pnpm test:e2e -- --grep @phase0    # Phase 0 acceptance scenario only
pnpm test:network          # network-condition and server-restart suites
pnpm test:commerce         # Stripe test-mode payment/booking E2E (requires stripe CLI webhook forward)
pnpm test:zero-host        # failure-injection suite
pnpm test:perf             # perf smoke + payload measurement (see PERFORMANCE_BUDGET.md §7)
pnpm test:matrix           # cross-browser Playwright projects (chromium, msedge, webkit)
```

CI invokes the same commands — there is no CI-only test logic that cannot be run locally.

---

## 10. CI Gating Rules

| Suite | PR (blocks merge) | Nightly | Release (blocks production deploy) |
|---|---|---|---|
| Unit (`test:unit`) | ✅ required | ✅ | ✅ |
| Schema validation (`test:schema`) | ✅ required on any room/schema change | ✅ | ✅ |
| Solvability + seeds (`test:solver`) | ✅ required on any room-package change (sampled seeds); full domain nightly | ✅ full | ✅ full |
| Multi-client E2E core (3-client join, replicate, asymmetry, burn, result) | ✅ required (tagged `@core`) | ✅ full incl. 8-client | ✅ full |
| Network suites | — | ✅ | ✅ |
| Browser matrix | Chromium only | ✅ chromium + msedge + webkit | ✅ + manual Safari/device-lab checklist |
| Payment/booking E2E | ✅ on commerce-path changes | ✅ | ✅ |
| Zero-host failure suite | ✅ on operator/hint/media/voice adapter changes | ✅ | ✅ |
| Performance/payload gates | Bundle + asset-format + scene-stats gates per [PERFORMANCE_BUDGET.md §7](../docs/PERFORMANCE_BUDGET.md#7-ci-enforcement) | ✅ perf smoke + payload + network budgets | ✅ |

**Production deploy is blocked unless all of the following are green on the release candidate:**

1. Full unit + schema + solvability (entire seed domain) suites.
2. Full multi-client E2E including the 8-client case and reconnect.
3. Network suite including game-server restart/checkpoint recovery.
4. Payment/booking E2E in Stripe test mode against the release build.
5. Complete zero-host failure suite — a paid game must be completable with every single external AI/media/voice dependency broken.
6. All performance budget gates in [PERFORMANCE_BUDGET.md](../docs/PERFORMANCE_BUDGET.md#7-ci-enforcement).
7. Manual release checklist: real-Safari pass (if Safari-supported), integrated-GPU and discrete-GPU device-lab passes.

Flake policy: a flaky gating test is a P1 defect — it is fixed or quarantined *with an owner and a linked issue* within one working day; quarantined tests cannot remain quarantined across a release.
