# RealTimeEscape — Architecture

Maintained engineering documentation. Product context: [PRODUCT.md](./PRODUCT.md). Wire contract: [NETWORK_PROTOCOL.md](./NETWORK_PROTOCOL.md). Source brief: [`MASTER_BUILD_BRIEF.txt`](./MASTER_BUILD_BRIEF.txt).

Anything not yet implemented is marked **PLANNED** with the reason.

---

## 1. Stack summary

| Concern | Choice | ADR |
|---|---|---|
| Web app (site, commerce, account, lobby, HUD host) | Next.js 15 App Router, TypeScript, deployed from repo root on Vercel | [ADR-001](#adr-001--nextjs-app-at-repo-root) |
| 3D rendering | Babylon.js — WebGPU with WebGL2 fallback | [ADR-002](#adr-002--babylonjs-for-3d) |
| Authoritative multiplayer | Colyseus on Node.js/TypeScript; one private team session = one Room instance | [ADR-003](#adr-003--colyseus-for-authoritative-multiplayer) |
| Auth + application data | Supabase (Auth + Postgres) | [ADR-004](#adr-004--supabase-for-auth--postgres), [ADR-005](#adr-005--shared-supabase-project-rte_-prefix) |
| Payments | Stripe Checkout + server-verified webhooks, idempotent fulfillment | [ADR-006](#adr-006--stripe-checkout-with-server-verified-webhooks) |
| Voice | LiveKit (WebRTC), party/intercom channel — not proximity-attenuated | [ADR-007](#adr-007--livekit-party-voice-not-proximity-attenuated) |
| Large asset storage/delivery | Cloudflare R2 behind CDN | [ADR-008](#adr-008--cloudflare-r2-for-large-assets) |
| Email | Transactional email provider — PLANNED; provider selected during Phase 2 (commerce flow) implementation |
| Presence/scale-out | Colyseus presence + Redis only when horizontal multi-process scaling requires it — PLANNED; not introduced before it is needed |
| Observability | Structured logs, error reporting, session health metrics — PLANNED; lightweight provider chosen during beta hardening |

TypeScript is used throughout (strict mode). Shared client/server message and state types live in `/lib` and are imported by both the Next.js app and the game server so the protocol has a single source of truth.

## 2. Deployment topology

```
Browser ── HTTPS ──> Vercel (Next.js: site, commerce, account, lobby, HUD)
   │                        │
   │                        ├──> Supabase (auth, Postgres application data)
   │                        └──> Stripe (Checkout; webhooks → Next.js route handlers)
   │
   ├── WSS ──> Game server (Colyseus, Node.js) on Railway/Render/Fly
   │                        └──> Supabase (checkpoints, session results, event log)
   │
   ├── WebRTC ──> LiveKit (party voice)
   └── HTTPS/CDN ──> Cloudflare R2 (GLB/textures/audio/video assets)
```

Two deploy targets: the web app deploys from the repo root to Vercel; the game server in `/game-server` deploys independently to a long-lived-process host (Railway, Render, or Fly — WebSocket rooms cannot live in Vercel serverless functions). Game logic has no dependency on Vercel-specific runtime behavior.

## 3. Repository layout (as built)

This is the actual layout, which deliberately differs from the brief's suggested `apps/` + `packages/` monorepo (see [ADR-001](#adr-001--nextjs-app-at-repo-root)).

```
/app                          Next.js 15 App Router routes (site, commerce, account, lobby, HUD)
/components                   React components shared across routes
/lib                          Shared TypeScript: protocol types, Supabase/Stripe/LiveKit clients, utilities
/public                       Static web assets (small; large game assets live in R2)
/game-server                  Colyseus authoritative game server (separate deploy target)
/rooms/burn-window/content    Data-driven room package: puzzle graph, hints, burn config
/supabase/migrations          SQL migrations (rte_-prefixed tables, see §7)
/docs                         This documentation
/reference-aesthetic          User-supplied visual references (Andor → cockpit, Moon Knight → viewing room)
```

Rules:
- Large binary art/audio/video never enters the source repo; it goes through the asset pipeline to R2.
- Server-only puzzle rules and solutions in the room package are never bundled into the browser build. The client receives presentation metadata only.
- Burn Window–specific code must not leak into generic engine code; room-specific behavior belongs in `/rooms/burn-window` as data wherever possible.

## 4. Architecture Decision Records

### ADR-001 — Next.js app at repo root

**Context.** The brief suggests an `apps/web` + `packages/*` monorepo. Vercel deploys most simply when the Next.js project is the repository root, and at current scale a workspace toolchain (turborepo/workspaces config, per-package builds) adds overhead without payoff for a solo-built product.

**Decision.** The Next.js 15 App Router app lives at the repo root (`/app`, `/components`, `/lib`, `/public`). The game server is a sibling directory (`/game-server`) with its own `package.json` and deploy target. Shared protocol types live in `/lib` and are consumed by both.

**Consequences.** Vercel needs no root-directory configuration. There is no package-boundary enforcement between web and game-server code beyond convention and import-path discipline. Revisit when the game client warrants a separate build (e.g., a standalone Babylon bundle with its own toolchain), at which point extraction into a workspace is the migration path.

### ADR-002 — Babylon.js for 3D

**Context.** The brief requires Babylon.js as the V1 engine: browser-native TypeScript workflow, PBR rendering, glTF pipeline, scene picking, animation, physics (Havok) when needed, and character-controller functionality — a better fit than a renderer-only library for a reusable game platform. Three.js and PlayCanvas were considered credible alternatives.

**Decision.** Babylon.js, using the WebGPU engine when the browser supports it and falling back to WebGL2 for coverage. Unreal Pixel Streaming is explicitly rejected for the normal player experience (server-side GPU cost breaks the low-marginal-cost model).

**Consequences.** One rendering codepath with two backends; the lobby device test selects the backend and a Low/Medium/High/Ultra quality tier. The engine choice is not to be substituted casually after implementation begins. Rendering-cost decisions (baked lighting, KTX2 textures, meshopt/Draco) follow from browser delivery.

### ADR-003 — Colyseus for authoritative multiplayer

**Context.** The product requires server-authoritative state (constraint C-09 in [PRODUCT.md](./PRODUCT.md#2-product-constraints-restated-from-the-briefs-required-decisions)), room-scoped private sessions, and a TypeScript-native server. Colyseus provides room lifecycle, state sync with delta patches, and reconnection primitives out of the box.

**Decision.** Colyseus on Node.js/TypeScript in `/game-server`. **One private team session maps to exactly one Colyseus Room instance.** The server owns canonical session phase, timer, membership, validated player transforms, interactable state, object leases, inventory, doors/locks, puzzle state, hint state, randomization seed, burn maneuver state, and win/loss.

**Consequences.** Horizontal scaling is by adding game-server processes/nodes; Redis-backed presence is deferred until a single process is insufficient (PLANNED). The state schema and message contract in [NETWORK_PROTOCOL.md](./NETWORK_PROTOCOL.md) are expressed as Colyseus schema + typed messages.

### ADR-004 — Supabase for auth + Postgres

**Context.** The platform needs low-ops auth, relational application data (bookings, seats, sessions, results, checkpoints), and row-level security — without running a database.

**Decision.** Supabase provides authentication and Postgres for all persistent application data. Postgres is never in the real-time game loop: no per-frame transforms are written; the game server writes checkpoints, results, and telemetry events (see §8).

**Consequences.** RLS policies gate all client-visible tables. The game server uses a service-role connection and is the only writer for session-truth tables. See ADR-005 for the shared-project constraint.

### ADR-005 — Shared Supabase project, `rte_` prefix

**Context.** RealTimeEscape shares an existing Supabase project with other unrelated applications owned by the same person. Creating a dedicated project was deferred to ship the first release faster.

**Decision.** All RealTimeEscape tables use the `rte_` prefix (full list in §7). RTE-owned fields in Supabase auth user metadata are namespaced (an `rte` key within `user_metadata` / `app_metadata`) so they cannot collide with other apps' metadata.

**Consequences.** This is deliberate, accepted coupling: shared connection pool, shared auth user space, shared project limits, and blast radius across unrelated apps. **Migration path to a dedicated project (execute before scale or the first security review demands isolation):**
1. Export the `rte_` tables (schema + data) via `pg_dump` filtered to the prefix.
2. Migrate the subset of auth users who have RTE activity (Supabase auth export/import; password hashes are portable) — identifiable via `rte_player_profiles`.
3. Repoint `SUPABASE_URL` / keys in Vercel and game-server environment variables.
4. Re-run `/supabase/migrations` on the new project to verify parity, then cut over and drop `rte_` tables from the shared project.

### ADR-006 — Stripe Checkout with server-verified webhooks

**Context.** Payment must be self-service (zero-host), must never expose the platform to raw card data, and must not trust the browser.

**Decision.** Stripe-hosted Checkout. Fulfillment (marking seats paid, confirming bookings) is driven **only** by server-side webhook handlers that verify the Stripe signature. The client success redirect is presentational.

**Consequences.** Webhook handlers must be idempotent: Stripe retries and duplicates events, so fulfillment keys on the Stripe event/session ID recorded in `rte_payments`, and re-processing an already-fulfilled event is a no-op. Two purchase patterns are supported (host pays all; host + invitees pay individually). No raw card data ever touches RTE infrastructure.

### ADR-007 — LiveKit party voice (NOT proximity-attenuated)

**Context.** Voice is a built-in product feature (constraint C-06), and Burn Window's endgame depends on a cockpit navigator verbally directing thruster operators in distant compartments.

**Decision.** LiveKit (WebRTC) provides a per-session party/intercom voice channel. Teammate voices are **not** attenuated by in-world distance — players who physically separate across the ship remain fully intelligible. Light stereo/spatial positioning may be applied for presence only if it never undermines intelligibility.

**Consequences.** The final asymmetric mechanic works regardless of player positions. Future rooms may deliberately opt into proximity voice per room-package configuration (PLANNED — no current room needs it). Open mic + mute, optional push-to-talk, voice-activity indicators, and text chat fallback ride on the same channel. Player microphones are never recorded by default; any future recap product that includes voice requires explicit consent.

### ADR-008 — Cloudflare R2 for large assets

**Context.** A room package includes hundreds of MB of GLB/glTF geometry, compressed textures, audio, and prerecorded video. Read-heavy large-object delivery favors object-storage economics, and these assets must not bloat the git repo or the Vercel deployment.

**Decision.** Cloudflare R2, fronted by CDN/HTTP caching, stores game assets: GLB/glTF, KTX2 textures, audio, cinematics, versioned room-package asset bundles, and generated post-game artifacts. `/public` holds only small site assets.

**Consequences.** Asset URLs are versioned alongside room-package versions so client and server always agree on content. Initial interactive payload budget: ≤ ~75 MB before the opening experience is interactive, with later sections streamed/preloaded (lobby/briefing time is used for preloading). Generated private artifacts (e.g., team images tied to accounts) are served via access-controlled URLs.

## 5. Authoritative multiplayer model

**Clients render; the server decides reality.**

Canonical interaction sequence:

1. Player approaches an object; client sends an interact/lease request.
2. Server validates eligibility, proximity, and object state.
3. Server grants a temporary **object lease** or rejects the request.
4. Canonical object state changes on the server.
5. All clients receive a state patch; remote clients interpolate the visual change.

**Object leases.** Exactly one player manipulates an exclusive object at a time unless a puzzle explicitly supports multi-user manipulation. Leases carry a timeout so a disconnecting player cannot orphan a key or lever (see §8).

**Player motion.** Local movement is client-predicted for immediacy; the server validates and rebroadcasts at **10–20 authoritative movement updates/second** (tuned from testing). Remote avatars are interpolated. Synchronized avatar data is limited to transform, locomotion/action state, held object, and voice activity — never per-bone skeletal data (animations play locally from the synced state).

**Discrete puzzle events.** Puzzle state changes are discrete server events/state transitions, not continuous physics simulation — more reliable and far easier to validate. Cosmetic physics (floating debris/bodies) is deterministic or local-only.

**Session randomization.** At start, the server creates a deterministic seed from a validated set. Final-burn instructions (thruster IDs, power settings, arming order, durations, station-stage assignment, code mappings) derive from the seed; validation guarantees no impossible configuration. The server is authoritative for burn timing and success.

The complete wire contract — state schema, messages, and payload types — is specified in [NETWORK_PROTOCOL.md](./NETWORK_PROTOCOL.md).

## 6. Session lifecycle

```
CREATED
  → AWAITING_SEATS / CONFIRMED     (booking-side: seats being claimed/paid vs. fully confirmed)
  → LOBBY_OPEN                     (~15 min before start; device/voice/network tests, avatar pick)
  → READY                          (all present players readied)
  → BRIEFING                       (prerecorded opening; roster locked, seed created, logging starts)
  → ACTIVE                         (60-minute server-authoritative timer running)
  → ESCAPED | FAILED               (server-determined outcome)
  → DEBRIEF                        (results, team image, share)
  → ARCHIVED
```

Rules:
- Booking/payment/cancellation states are kept separate from game-session states — a booking is not a session. `rte_bookings` tracks commerce status; `rte_game_sessions` tracks play status.
- All stored times are UTC; presentation converts to the player's local zone with the scheduled zone made explicit.
- An individual player's disconnect does **not** pause the team timer. A verified platform/server incident can trigger an automated, deterministic, auditable pause/recovery policy — and a qualifying unrecoverable failure triggers an automated self-service replay/reschedule credit (zero-host applies to failure handling too).

## 7. Data model

All tables live in the shared Supabase Postgres under the `rte_` prefix (ADR-005). Migrations in `/supabase/migrations`. Exact columns evolve via migration; the concepts are stable:

| Table | Purpose |
|---|---|
| `rte_player_profiles` | Display name, preferences, accessibility settings, aggregate stats. Keyed to Supabase auth user. |
| `rte_games` | Catalog identity (Burn Window, future rooms): title, premise, duration, supported/recommended player counts, price. |
| `rte_game_versions` | Immutable, releasable room-content versions + compatibility metadata (asset bundle refs, schema version). |
| `rte_bookings` | A purchase event (instant or scheduled): host, start time, game version, commerce status. |
| `rte_booking_seats` | Individual seats: paid/claimed state, purchaser, assigned participant. |
| `rte_invitations` | Secure claim tokens: unguessable, expiring, claim-aware; maps recipient → booking seat. |
| `rte_payments` | Internal reference to Stripe customer/checkout-session/payment state + processed webhook event IDs (idempotency). Never raw card data. |
| `rte_game_sessions` | An instantiated play event: Colyseus room/session ID, game version, random seed, start/end, result. |
| `rte_session_players` | Participant seat, avatar, join/reconnect state, role assignment, per-player result metadata. |
| `rte_session_checkpoints` | Canonical recovery snapshots at milestones/intervals (see §8). |
| `rte_session_events` | Append-only gameplay telemetry/event log — analytics, debugging, and future recap generation. |
| `rte_media_artifacts` | Team image/recap outputs: storage ref (R2), consent, entitlement, access metadata. |

Achievements/entitlements tables are PLANNED (post-launch retention features). Per-frame transform data is never written to Postgres; `rte_session_events` samples only the transforms a future recap actually needs.

## 8. Checkpointing and reconnection

**Checkpoints.** The game server persists a canonical state snapshot to `rte_session_checkpoints`:
- at every major state transition (phase change, puzzle solved, burn milestone), and
- on an interval (starting point: 30 seconds, tuned from testing).

Checkpoints exist for recovery only; they are not part of the real-time loop.

**Player reconnection.** A returning paid participant reclaims the same seat, avatar, role, and current canonical world state via a seat-scoped reconnection token. Object leases held by a disconnected player expire on a timeout so exclusive objects are never orphaned. The rehydration handshake is specified in [NETWORK_PROTOCOL.md](./NETWORK_PROTOCOL.md#7-reconnection-and-rehydration).

**Server recovery.** After a game-server process failure, the session restores from the latest checkpoint where possible. If platform health confirms a qualifying unrecoverable failure, the automated credit/reschedule path fires (no human required).

**Role redundancy.** No puzzle may become permanently unsolvable because a specific player disappeared; the game redistributes necessary information or provides a recovery path (enforced by room-package solvability validation — PLANNED as part of the content pipeline validator).

## 9. Security and privacy

- Stripe-hosted Checkout keeps raw card data off RTE infrastructure; webhooks are signature-verified server-side and fulfillment is idempotent (ADR-006).
- Session access uses authenticated, **seat-scoped** tokens; invitation tokens are unguessable, expiring, and claim-aware.
- Postgres row-level security applies to all client-visible `rte_` tables; the game server writes session truth via service-role credentials.
- Server/API secrets never appear in browser bundles; the client bundle contains no puzzle solutions or server validation logic ("do not ship canonical answers to the browser").
- Public endpoints (invitation claim, booking creation) are rate-limited.
- Asymmetric information is enforced server-side: role-gated data is filtered per client before send, never hidden client-side (see [NETWORK_PROTOCOL.md](./NETWORK_PROTOCOL.md#8-asymmetric-information-rule)).
- User avatars and private media are signed/access-controlled. Selfie-avatar features (PLANNED, V1.1) require a published retention/deletion policy before accepting face images.
- Player voice is not recorded by default; recording anything requires explicit consent and visible recording state.
- Every result stores its room/session version so bugs are reproducible.
- Browser-delivered assets are never treated as secret; security protects payment, identity, private data, and canonical puzzle decisions — not obfuscation.
