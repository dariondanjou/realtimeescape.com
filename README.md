# RealTimeEscape.com

Browser-based real-time multiplayer 3D escape rooms. First release: **Burn Window**.

Live at **https://realtimeescape.com**

---

## What is here

```
app/                    Next.js 15 App Router — site, commerce, lobby, demo, API routes
components/             Shared UI (brand mark, glitch wordmark, header, footer)
lib/                    Supabase clients, Stripe, catalog, booking logic
shared/burn.mjs         Maneuver generation + authoritative burn validation
                        (imported verbatim by BOTH the game server and the browser demo)
game-server/            Colyseus authoritative game server — SEPARATE deploy target
rooms/burn-window/      Room package: content and solvability tests
supabase/migrations/    SQL schema
docs/                   Engineering documentation (see below)
reference-aesthetic/    User-supplied visual references — the canonical art direction source
```

## Documentation

Read in this order:

| Document | What it settles |
|---|---|
| [docs/MASTER_BUILD_BRIEF.txt](docs/MASTER_BUILD_BRIEF.txt) | The product brief. Source of every REQUIRED constraint. |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Vision, customer journey, business model, definition of done |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | As-built stack, ADRs, data model, session lifecycle |
| [docs/NETWORK_PROTOCOL.md](docs/NETWORK_PROTOCOL.md) | Client/server message contract |
| [docs/ROOM_SCHEMA.md](docs/ROOM_SCHEMA.md) | Versioned room-package format |
| [docs/PUZZLE_COMPONENTS.md](docs/PUZZLE_COMPONENTS.md) | Reusable interaction + puzzle engine |
| [docs/OPERATOR_AND_HINTS.md](docs/OPERATOR_AND_HINTS.md) | Zero-host automated operator and hint engine |
| [docs/BURN_WINDOW_GAME_SPEC.md](docs/BURN_WINDOW_GAME_SPEC.md) | **The game.** Puzzle graph, acts, scaling, randomization, hints |
| [docs/REFUNDS_RECORDING_AND_FEEDBACK.md](docs/REFUNDS_RECORDING_AND_FEEDBACK.md) | No-refund/credit policy, session recording and consent, AI triage limits, the collated feedback queue |
| [docs/BURN_WINDOW_VISUAL_BIBLE.md](docs/BURN_WINDOW_VISUAL_BIBLE.md) | Sampled palettes, lighting, lens and prompt blocks |
| [docs/PERFORMANCE_BUDGET.md](docs/PERFORMANCE_BUDGET.md) | Enforceable frame, payload and network budgets |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Full testing strategy and CI gates |

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
```

Copy `.env.example` to `.env.local` and fill it in.

The game server runs separately:

```bash
cd game-server && npm install && npm start   # ws://localhost:2567
```

## Tests

```bash
npm run test:room      # 66,000+ solvability and tolerance checks across 2,000 seeds
npm run typecheck
npm run build
```

`test:room` proves that every generated maneuver is winnable, that no tolerance is trivially
passable, and that a retry after a failed burn deals genuinely new numbers.

## Deployment

The **website** deploys to Vercel from `main` automatically.

The **game server** does not belong on Vercel — it holds long-lived stateful WebSocket
sessions. Deploy it to Railway, Render or Fly, then set `NEXT_PUBLIC_GAME_SERVER_URL`.

See [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) for what is still required before
taking real money.

## The one rule

The server decides reality. Clients render and predict; they never decide whether a puzzle is
solved or a burn succeeded, and they are never sent information their player has not earned.
Asymmetric information is the product — if it leaks, there is no game.
