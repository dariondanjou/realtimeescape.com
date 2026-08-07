# PERFORMANCE_BUDGET.md

**Scope:** RealTimeEscape platform + first room, Burn Window
**Status:** Engineering budgets, v1. All numbers in this document are *enforceable starting targets*, not marketing claims. They exist so that regressions are caught mechanically, and they will be re-tuned from real device telemetry (FPS/frame-time percentiles, load times, and device-tier distribution are collected from launch — see the Session Health analytics requirements in the [master brief](MASTER_BUILD_BRIEF.txt), Section 28).

Related documents:

- [Test plan](../docs/TEST_PLAN.md) — how these budgets are verified in CI and E2E.
- [Architecture](../docs/ARCHITECTURE.md) — system topology these budgets apply to. *(PLANNED — file not yet written; listed in the brief's required first documents.)*
- [Master build brief](MASTER_BUILD_BRIEF.txt) — Sections 8–10 (stack, multiplayer model, art pipeline) are the source of the constraints below.

Principles:

1. **A budget that is not measured does not exist.** Every budget below names how it is measured.
2. **Percentiles, not averages.** A 60 FPS average with 200 ms hitches during the final burn is a failed session. All frame-rate budgets are expressed as frame-time percentiles.
3. **Budgets fail builds.** Exceeding a hard budget is a CI failure, not a Slack message (see [CI Enforcement](#7-ci-enforcement)).
4. **Profile before optimizing, but enforce budgets from the beginning** (brief, Section 26, rule 15).

---

## 1. Frame Rate and Frame Time

### 1.1 Hardware profiles

| Profile | Definition | Requirement |
|---|---|---|
| **Baseline desktop** | Recent-generation integrated GPU (e.g. current Intel Iris Xe / AMD RDNA-class iGPU), 8 GB RAM, 1080p display, modern Chrome/Edge, WebGL2 path | 30 FPS minimum acceptable gameplay |
| **Strong desktop** | Mid-range or better discrete GPU, 16 GB RAM, 1080p–1440p, WebGPU path where available | 60 FPS target |

The exact reference machines are pinned when the device lab is set up (PLANNED — no hardware lab exists yet; until then, the CI perf smoke test runs on a fixed CI GPU configuration and the budgets below are validated on developer hardware plus beta telemetry).

### 1.2 Frame-time budgets (measured, not averaged)

Measured over a rolling 60-second gameplay window in a representative scene (worst authored room section, full player count of 8 remote avatars, voice active). "Interactive" excludes cinematics and loading screens.

| Metric | Baseline desktop (30 FPS floor) | Strong desktop (60 FPS target) | Rationale |
|---|---|---|---|
| p50 frame time | ≤ 28 ms | ≤ 14 ms | Headroom below the hard ceiling so median play is smooth, not borderline |
| p95 frame time | ≤ 33.3 ms | ≤ 16.7 ms | The perceptual budget: 95% of frames must meet the tier's FPS promise |
| p99 frame time | ≤ 50 ms | ≤ 25 ms | Bounds hitching; occasional long frames are tolerable, frequent ones are not |
| Hitches > 100 ms | ≤ 1 per 60 s window; **0 during the final burn sequence** | same | A 100 ms hitch during a synchronized burn input can cause a mistimed burn and a perceived-unfair failure |

Why percentiles: an average hides exactly the frames that ruin the burn mechanic. p95/p99 catch GC pauses, shader compilation stalls, texture upload spikes, and physics spikes that averages absorb.

### 1.3 How frame time is measured

- Client instrumentation wraps the Babylon render loop (`engine.getDeltaTime()` / `performance.now()` per frame) and maintains a ring buffer of frame times.
- Percentiles are computed client-side per 60 s window and reported as telemetry events (aggregate numbers only — no per-frame stream to the server, and never to Postgres).
- The lobby device test (Section 4) runs a short standardized stress scene and reports the same percentile metrics; the result selects the quality tier.
- CI runs an automated perf smoke scene headlessly/on a pinned GPU runner and asserts the percentile budgets for that runner's profile (PLANNED — requires the graybox scene from Phase 0 before it can be wired up; blocked on there being a scene to measure).
- Shader compilation is warmed during loading/lobby (`engine.compileShaders` / material pre-warm pass) so first-interaction frames do not pay compilation cost. First-frame-after-load spikes are excluded from the rolling window only if they occur behind the loading screen.

---

## 2. Asset Payload Budgets

Delivery is Cloudflare R2 + CDN; formats and pipeline are in Section 5.

| Budget | Hard limit | Rationale |
|---|---|---|
| **Payload before the opening experience is interactive** (engine + app shell + first playable section of the passenger viewing room + avatars in scene + critical audio) | **≤ 75 MB** compressed transfer size | Brief requirement. On a 50 Mbps connection this is ~12 s of transfer; combined with lobby-time preloading the player should never stare at a blank screen |
| **Complete Burn Window streamed package** (all sections, cinematics excluded) | **≤ 300 MB** compressed transfer size | Brief: "a few hundred MB or less." 300 MB is the enforced ceiling; the working target is lower and will be tuned from telemetry on real load times |
| Prerecorded cinematic video | Streamed on demand, adaptive bitrate; never counted inside the 75 MB interactive budget | Video is large and time-localized; it must not delay interactivity |
| JS bundle (Next.js app + Babylon + game client) within the 75 MB | ≤ 8 MB compressed | Parse/compile cost hits weak CPUs even after transfer finishes; code is the most cache-hostile payload |

Rules:

- The 75 MB budget is measured as **actual compressed bytes transferred** before the first interactive frame of the lobby/viewing-room scene, asserted by an automated Playwright load test that sums network transfer (see [TEST_PLAN.md](../docs/TEST_PLAN.md), Section 7).
- Later ship sections (crew corridor, cockpit, thruster stations) are **streamed/section-loaded** behind doors and act transitions, and **preloaded during lobby idle time and cinematics** — the briefing video is a guaranteed multi-second window in which the next section downloads.
- Every room package manifest declares its per-section byte sizes; the manifest build step fails if a section pushes a budget over its limit (Section 7).

---

## 3. Per-Category Scene Budgets

These apply to the **worst visible view** of each room section at the High tier (Ultra may exceed some render-cost lines where noted; Low/Medium must come in under). All numbers are **starting targets to be tuned from real device telemetry** — they are deliberately conservative because the baseline is an integrated GPU in a browser.

| Category | Budget (High tier, per visible view) | Rationale |
|---|---|---|
| Triangles rendered | ≤ 1,500,000 | Enclosed escape-room interiors with occlusion culling rarely need more; iGPU vertex throughput and browser overhead make multi-million-triangle views hitch on baseline hardware |
| Draw calls | ≤ 250 (WebGL2), ≤ 400 (WebGPU) | Draw-call CPU overhead is the classic WebGL bottleneck on baseline machines; WebGPU gets more headroom but is not the floor we ship against |
| Active materials (unique effective materials after instancing/atlas merge) | ≤ 60 | Each unique material is shader/bind overhead; escape-room prop density makes material sprawl the most likely silent regression |
| GPU texture memory (resident, after KTX2 transcode) | ≤ 768 MB (High) / ≤ 384 MB (Low–Medium) | iGPUs share system RAM; exceeding this causes eviction thrash that shows up as p99 spikes, not lower averages |
| Real-time shadow-casting lights | ≤ 2 simultaneously visible (Low: 0, shadows baked only) | Each shadow caster is a scene re-render into a shadow map. Baked lighting (Section 5) is the design answer; dynamic shadows are reserved for gameplay-critical moving lights |
| Real-time (non-baked) dynamic lights of any kind | ≤ 6 visible | Everything else is baked or emissive; dynamic lights exist for alarms, flashlights, thruster glow and story-state changes |
| Simultaneous audio sources (mixed, excluding voice) | ≤ 24 active voices, ≤ 8 spatialized | Web Audio mixing cost is CPU on the main/audio thread; alarms + machinery + footsteps for 8 players can explode without a voice cap and priority-based virtualization |
| Skinned/animated characters visible | ≤ 8 (full player count) + 2 corpse rigs | Corpses use deterministic animation, not synced physics (brief, Section 2); skinning cost scales with bones × vertices, so avatar rigs share one normalized skeleton contract |
| Particle systems visible | ≤ 8 systems / ≤ 4,000 particles | Overdraw from particles (floating dust, thruster exhaust) is a fill-rate killer on iGPUs |

Enforcement: a scene-stats gate in the room-package build walks the exported scene per section, computes these numbers for authored camera probe points, and fails the build on any hard-limit violation (Section 7). Runtime telemetry (draw calls, triangles, texture memory via Babylon's instrumentation) validates that shipped reality matches build-time predictions.

---

## 4. Quality Tier System

Four tiers: **Low / Medium / High / Ultra.** Selected automatically by the lobby device test (a short standardized render benchmark plus WebGPU/WebGL2 capability detection), overridable by the player in settings. **The room art is identical across tiers** — the same geometry, the same baked lighting, the same puzzles. Only rendering cost knobs change. A player on Low must never be puzzle-disadvantaged (e.g. a clue readable only at High texture resolution is a content bug, tested in the [test plan](../docs/TEST_PLAN.md)).

| Knob | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Render resolution scale | 0.66× | 0.85× | 1.0× | 1.0× (native, up to 1440p+) |
| Real-time shadows | Off (baked only) | 1 caster, 1024 px map | 2 casters, 2048 px | 2 casters, 4096 px |
| Texture detail | Highest mip dropped (½ res) | Full res, aggressive streaming | Full res | Full res + higher anisotropy (8×→16×) |
| Post-processing | Tonemapping only | + FXAA, restrained bloom | + SSAO, motion-safe effects | + higher-quality AO/bloom |
| Reflections | Static env map only | Static probes | Local reflection probes | Higher-res probes |
| Particles | Halved counts | Full | Full | Full |
| Target profile | Baseline iGPU floor | Baseline iGPU comfort | Discrete GPU | Strong discrete GPU |

Tier selection policy: the lobby test picks the highest tier whose stress-scene result meets that tier's p95 frame-time budget with ≥ 20% headroom. If mid-session telemetry shows sustained budget violation, the client may automatically drop one tier (with a subtle notification) — never mid-burn-sequence.

---

## 5. Art Pipeline Optimization Requirements

These are **requirements on content, enforced in the asset build**, not suggestions to artists. Pipeline: Blender → PBR → bake → optimize → glTF/GLB → compress → R2/CDN → Babylon (brief, Section 10).

| Requirement | Rule | Why |
|---|---|---|
| **Baked lightmaps for static architecture** | All static architecture ships with baked GI/lightmaps; dynamic lights only where gameplay or moving sources need them | Escape rooms are enclosed, mostly static environments — the single best perf/quality trade available. Rendering time is spent once at authoring, not per-frame in every player's browser |
| **KTX2/Basis texture compression** | All textures ship as KTX2 (UASTC for normal maps/hero surfaces, ETC1S for the rest); raw PNG/JPG in a room package fails the build (UI/HUD images exempt) | GPU-native compressed textures cut texture memory ~4–8× and transfer size, directly serving the Section 2 and Section 3 budgets |
| **Meshopt / Draco** | Meshopt compression is the default for GLB geometry; Draco only where A/B testing on target hardware shows a net win (decode time vs. transfer saved) | Compression that costs more in decode stalls than it saves in transfer is a loss on baseline CPUs — hence "where testing shows a win," per the brief |
| **LODs** | Props above a triangle threshold (initial: 10k tris) ship ≥ 2 LOD levels; architecture LODs where section sightlines justify it | Distant/peripheral props at full density waste the Section 3 triangle budget |
| **Instancing** | Repeated props (seats, panels, conduit, fasteners) must be instanced/thin-instanced; the scene-stats gate flags duplicate non-instanced meshes | Converts N draw calls into 1; the cheapest draw-call recovery available |
| **Occlusion culling** | Sections are portal/zone-organized so non-visible compartments are not rendered; the scene-stats gate measures worst-view triangle counts assuming culling is active | An enclosed ship is ideal for coarse zone culling; without it the Section 3 budgets are unmeetable |
| **Progressive / section-based loading** | The room package is split into sections loadable independently; no section may require another section's assets to render | Serves the 75 MB interactive budget and the streamed-package model |
| **Preloading during lobby and cinematics** | The loader uses lobby idle time and every prerecorded cinematic as a guaranteed prefetch window for the next likely sections | Players should never hit a loading wall at a door mid-game; the 60-minute timer makes mid-game stalls a product failure, not just a perf issue |

---

## 6. Network Budgets

Authoritative server is Colyseus; clients render and predict, the server decides reality (brief, Sections 8–9). Voice is LiveKit/WebRTC and is budgeted separately by LiveKit's own adaptive stack — the numbers below are **game-state traffic only**.

| Budget | Target | Rationale |
|---|---|---|
| Authoritative movement update rate | **10–20 Hz** (initial default 15 Hz; tuned from testing per brief) | A puzzle game does not need shooter-grade 60 Hz; interpolation makes 10–20 Hz avatars look continuous while cutting bandwidth 3–6× |
| Per-player downstream game-state bandwidth (steady state, 8-player room) | ≤ 30 kbps average, ≤ 64 kbps p95 | 8 remote avatars at 15 Hz with quantized transforms plus object patches fits comfortably; the ceiling keeps the game playable on constrained connections alongside voice |
| Per-player upstream | ≤ 10 kbps average | Client sends inputs/intents and its own transform, nothing else |
| Movement message payload | ≤ 32 bytes per avatar update (quantized position + yaw/pitch + locomotion state + held-object id + voice-activity bit) | Full-precision floats and per-bone data are banned on the wire; animation is synced as high-level state and played locally (brief, Section 9) |
| Non-movement state patch size | ≤ 1 KB typical, ≤ 8 KB hard cap per patch | Puzzle events are discrete state transitions; a patch approaching 8 KB indicates schema bloat, not gameplay |
| Full state snapshot (join/reconnect rehydration) | ≤ 64 KB | Bounds reconnect time; rehydration must feel instant relative to a 60-minute timer |
| Asymmetric-data filtering | Server-side per-client view filtering: cockpit-only data is never serialized to thruster clients and vice versa | Bandwidth *and* anti-cheat: canonical answers must not ship to clients that shouldn't have them (brief, Sections 12, 19) |
| **Postgres write rule** | **Per-frame or per-tick transforms are NEVER written to Postgres.** Postgres receives: checkpoints (every major state transition + ~30 s interval), session events, and sampled transforms only at the low rate needed for future recap generation | Postgres is the durability layer, not the game loop (brief, Sections 8–9). Violating this is an architecture defect, enforced by code review rule and a server-side write-rate assertion in tests |
| Burn-input timing transport | Burn press/release events are timestamped server-side on receipt; tolerance validation uses server clock only | The synchronization tolerance mechanic must be latency-fair and un-spoofable; clients never self-report timing truth |

Measured by: server-side per-room bandwidth/patch-size metrics (exported to observability), plus network E2E tests in the [test plan](../docs/TEST_PLAN.md), Section 8.

---

## 7. CI Enforcement

Budgets are encoded in a machine-readable manifest (`perf-budgets.json`, PLANNED alongside the first room-package build tooling — it must exist before the first room package is merged) consumed by the checks below. Changing a budget number requires editing that file in a reviewed PR — budget changes are explicit decisions, never silent drift.

| Check | Stage | Fails the build when |
|---|---|---|
| **Bundle-size gate** | Every PR | Compressed JS bundle exceeds its Section 2 limit, or grows > 5% in one PR without a budget-manifest change |
| **Asset-format gate** | Room-package build | Any texture is not KTX2 (outside the UI exemption list); any GLB lacks Meshopt (or approved Draco) encoding; any audio asset is uncompressed PCM |
| **Payload gate** | Room-package build + nightly E2E | Sum of the interactive-critical asset set exceeds 75 MB compressed, or total package exceeds 300 MB; nightly Playwright load test measures real transferred bytes to first interactive frame and asserts the same limit |
| **Scene-stats gate** | Room-package build | Any camera-probe view exceeds Section 3 hard limits (triangles, draw calls, materials, shadow casters, particles); any prop over the LOD threshold lacking LODs; duplicate meshes that should be instances |
| **Perf smoke test** | Nightly (PLANNED — blocked on the Phase 0 graybox scene existing) | p50/p95/p99 frame-time budgets for the pinned CI GPU profile are exceeded in the standardized stress scene; any hitch > 100 ms during the scripted burn sequence |
| **Network-budget test** | Nightly multi-client E2E | Measured per-client bandwidth, patch sizes, or snapshot size exceed Section 6 caps; any Postgres write from the transform path (asserted via instrumented test double) |

Gating policy (mirrored in [TEST_PLAN.md](../docs/TEST_PLAN.md), Section 11):

- PR-stage gates (bundle, asset-format, scene-stats on changed packages) **block merge**.
- Nightly gates (payload E2E, perf smoke, network budgets) **block production deploy** of the affected room-package/server version until green or until the budget manifest is explicitly revised in review.
- Telemetry review: budget numbers are revisited against real-device percentile telemetry at each beta milestone; the manifest is the single place numbers change.
