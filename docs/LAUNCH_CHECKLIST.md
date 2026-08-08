# LAUNCH CHECKLIST

What is done, what is blocked on a credential, and what is still real engineering work.

Last updated 7 August 2026.

---

## DONE — live in production

| Item | Where |
|---|---|
| Marketing site, catalog, game briefing | https://realtimeescape.com |
| Playable burn demo, running the real validation module | https://realtimeescape.com/demo |
| Booking flow: instant / scheduled, host-pays-all / split | `/book/burn-window` |
| Stripe Checkout session creation, server-validated pricing | `app/api/checkout` |
| Stripe webhook with signature verification and idempotent fulfilment | `app/api/stripe/webhook` |
| Seat + invitation model with single-use expiring tokens | `lib/bookings.ts` |
| Guest seat claim and self-pay | `/invite/[token]`, `app/api/claim` |
| Booking management page with per-seat invite links | `/booking/[id]` |
| Lobby with real device checks (browser, GPU, frame time, mic, network) | `/lobby/[id]` |
| Magic-link auth and account page | `/account` |
| Database schema with row-level security | `supabase/migrations/0001_init.sql` |
| Authoritative Colyseus room enforcing asymmetric information | `game-server/` |
| Maneuver generator + burn validator, 66k passing checks | `shared/burn.mjs`, `npm run test:room` |
| Full engineering documentation suite | `docs/` |
| Custom domain, HTTPS, apex + www, auto-deploy from `main` | Vercel |

---

## REMAINING

### 1. ~~Apply the database schema~~ — **DONE, 8 August 2026**

All four migrations are applied: **26 `rte_` tables, 3 views, 13 row-level-security policies**, and
the Burn Window catalog row seeded. Verified end to end — a demo booking was created and confirmed,
its session shell provisioned, and a feedback row captured.

Re-runnable at any time (both are idempotent):

```bash
node scripts/apply-migrations.mjs <token-file>   # applies supabase/migrations/*.sql in order
node scripts/verify.mjs <token-file>             # read-only smoke check
```

Both use the **Supabase Management API** (`POST /v1/projects/{ref}/database/query`), which executes
DDL. It needs a **personal access token** (`sbp_…`) from
https://supabase.com/dashboard/account/tokens — the anon and service-role keys are rejected here
with `401 JWT failed verification`, because they authenticate to PostgREST and can move rows but
cannot create tables. This is the same mechanism the aimakersgeneration project uses
(`cohorts/seed-push.mjs`).

<details>
<summary>Manual fallback, if you ever need to start from scratch</summary>

Open the Supabase SQL editor for project `xnejbxdvqmzlaljkgwaf` and run these files in order,
pasting each in full:

```
supabase/migrations/0001_init.sql                       accounts, bookings, seats, invitations, sessions
supabase/migrations/0002_credits_recording_players.sql  credits, session recording, issue triage, player numbers
supabase/migrations/0003_feedback_queue.sql             feedback capture and the collated bug/feature queue
supabase/migrations/0004_demo_and_credit_spend.sql      demo bookings, credit redemption accounting
```

All four are guarded and safe to re-run.

> Do **not** reach for `supabase link` / `supabase db push` — `link` fails against the API with an
> upstream timestamp-parsing bug (`LegacyLinkApiKeysNetworkError`) unrelated to this project, and
> `db push` would need the database password, which nothing here has. The Management API path
> above avoids both problems.

</details>

**Also done:** the private **`feedback-audio`** storage bucket exists (created via the Storage
API), and `ANTHROPIC_API_KEY`, `CONSENT_IP_SALT` and `DEMO_MODE_KEY` are set in Vercel production.

### 1b. Top up the Anthropic account  ← **the live gap**

The API key is correct and installed — it authenticates fine, and is rejected on **billing**:

```
400 "Your credit balance is too low to access the Anthropic API"
```

Until it is topped up, AI triage and feedback collation stay in their fallback modes: issue reports
are stored and routed to a human, and feedback is stored with `topic_id` null awaiting a collation
sweep. Nothing breaks; the automation simply does not run, and `/roadmap` stays empty.

**Or from the CLI**, if you supply the database password:

```bash
npx supabase link --project-ref xnejbxdvqmzlaljkgwaf
npx supabase db push
```

> The Supabase CLI on this machine is logged in, but its stored token could not be read
> programmatically, and `supabase link` currently fails against the API with an upstream
> timestamp-parsing bug (`LegacyLinkApiKeysNetworkError`). The SQL editor path avoids both.

**Verify it worked:** load https://realtimeescape.com/book/burn-window and complete a test
booking. A booking row should appear in `rte_bookings`.

### 2. Switch on payments

The Stripe integration is complete and reads three environment variables. None are set, so
checkout is deliberately disabled and the booking page says so plainly.

```bash
vercel env add STRIPE_SECRET_KEY production               # sk_test_… first
vercel env add STRIPE_WEBHOOK_SECRET production           # whsec_… from the webhook endpoint
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
```

Then register the webhook endpoint in the Stripe dashboard:

```
https://realtimeescape.com/api/stripe/webhook
events: checkout.session.completed, checkout.session.expired, charge.refunded
```

**Use test keys until the whole flow is verified end to end** — this is a REQUIRED constraint
from the master brief (§26.11), and the UI shows a test-mode banner while `sk_test_` is in use.
A live secret key belonging to a different project of yours exists on this machine; it was
deliberately not reused here, because the brief also forbids coupling RealTimeEscape to an
unrelated application's secrets (§8).

Verify with Stripe's `4242 4242 4242 4242`, then run the payment E2E cases in
[TEST_PLAN.md](./TEST_PLAN.md): host pays all, split payment, invite claim, expired invite,
duplicate webhook, cancelled checkout.

### 3. ~~Deploy the game server~~ — **DONE, 8 August 2026**

Live on Railway at `wss://realtimeescapecom-production.up.railway.app` (EU West, 1 replica,
healthcheck `/health`). `RESULT_WEBHOOK_URL` and `RESULT_WEBHOOK_SECRET` (= `CRON_SECRET`) are set
in Railway; `NEXT_PUBLIC_GAME_SERVER_URL` is set in Vercel production and baked into the lobby
bundle. Verified end to end: a demo booking's matchmake request created a real `burn_window` room
and returned a session.

One deploy gotcha, already fixed: Nixpacks bind-mounts its build cache at
`/app/tsconfig.tsbuildinfo`, so that file being committed broke the build with
`mount … not a directory`. It is now gitignored — do not commit it again.

### 4. ~~Switch on AI triage and feedback collation~~ — done

`ANTHROPIC_API_KEY` and `CONSENT_IP_SALT` are set in Vercel production. Issue triage and feedback
collation are live once the schema exists. See
[REFUNDS_RECORDING_AND_FEEDBACK.md](./REFUNDS_RECORDING_AND_FEEDBACK.md) for what the model is and
is not allowed to decide.

### 4b. Demo mode

Gated on `DEMO_MODE_KEY` (set in Vercel production). Click **demo** in the site header, enter the
key, and seats become free with a minimum party size of one so a room can be walked solo. Demo
bookings are flagged `is_demo` and excluded from revenue, the player ticker, and escape-rate stats.

Rotate the key any time with `vercel env rm DEMO_MODE_KEY production` followed by a fresh
`vercel env add`. Removing the variable entirely makes demo mode unreachable — the toggle
disappears and the API returns 404.

### 5. Legal review of the recording defaults  ← **blocking for EU/UK sales**

Images and video are captured and usable publicly **by default, with an opt-out**. That is a
deliberate product decision with real jurisdictional exposure — GDPR generally requires affirmative
consent for marketing use of a recognisable person's image, and several US states have their own
biometric and likeness statutes. Team voice is already opt-in everywhere.

The schema supports flipping images and video to opt-in per region by changing one default
(`rte_session_consents.media_social_use`). Get this reviewed before taking money in the EU or UK.

### 6. Transactional email

No provider is wired. Booking confirmations, invitations and results are currently surfaced
on-page rather than emailed. Pick a provider, then send: booking confirmation, invitation,
24-hour reminder, lobby-open notice, results.

---

## THE GAME — built, playable end to end in graybox (8 August 2026)

The complete room now exists and is proven completable:

- **All fourteen puzzles** run as an authoritative server state machine
  (`rooms/burn-window/content/puzzles.mjs`): dependency graph P1→P14, seeded randomization that
  cannot deal an impossible hand, zone-gated actions, three-tier hint ladders, CASS lines, and
  solo scaling so one tester can walk the whole room.
- **The 3D client** (`app/play/[id]`): Babylon graybox ship, eight zones, sliding doors driven by
  puzzle state, the lounge built to the visual bible, interactable hover + E-to-use, remote
  avatars, full HUD — server clock, objective, CASS subtitles with speech synthesis, team text
  chat, hints, every puzzle panel, the cockpit burn console and station panels, debrief.
- **Proof**: `game-server/playthrough-test.mjs` — a bot plays the entire session to ESCAPED. Plus
  21,508 generator checks across player counts 1–8, and a manual browser session verifying the
  world, movement, panels and P1 end to end.
- **Asymmetry is enforced server-side**: interlock codes and the burn solution are unreadable
  outside the flight deck (the playthrough asserts the denial).

### To take it live: deploy the game server (10 minutes)

1. Railway → New Project → Deploy from GitHub → `dariondanjou/realtimeescape.com`, root directory
   at the repo root (`railway.json` handles build/start).
2. Settings: generate a public domain; confirm app sleeping is OFF.
3. Environment: `RESULT_WEBHOOK_URL=https://realtimeescape.com`,
   `RESULT_WEBHOOK_SECRET=<the CRON_SECRET value>`.
4. `vercel env add NEXT_PUBLIC_GAME_SERVER_URL production` → `wss://<railway-domain>`, redeploy.
   The lobby switches to Enter-the-ship on its own.

## STILL TO BUILD — quality, not function

1. **LiveKit party voice.** The endgame is played over the built-in text chat until then;
   voice is what the spec intends. Needs LiveKit credentials.
2. **Environment art.** The gate is passed — [BURN_WINDOW_VISUAL_BIBLE.md](./BURN_WINDOW_VISUAL_BIBLE.md)
   has palettes, lighting DNA and prompt blocks. The ship is deliberately graybox until the
   puzzle pacing has been playtested (the brief's own ordering).
3. **CASS recorded voice and cinematics.** CASS speaks via browser speech synthesis today;
   the crew reveal and both endings deserve authored audio.
4. **Post-game team image generation.**
5. **Playwright multi-client E2E** — the bot playthrough covers solo; the multi-client
   asymmetry test (cockpit and station clients receive disjoint data) should run in CI.

---

## BEFORE THE FIRST REAL CUSTOMER

Non-negotiable, from the master brief's definition of done (§32):

- [ ] Schema applied and a real booking completed end to end
- [ ] Stripe verified in test mode, then a single controlled live transaction
- [ ] Three separate browsers in one session, each with an independent view
- [ ] Voice working well enough for the endgame
- [ ] Every required puzzle has its authored hint tiers loaded
- [ ] A disconnected player can reconnect and reclaim their seat
- [ ] Player counts 3, 4, 6 and 8 all tested for soft-locks
- [ ] The zero-host failure tests pass: break the LLM, the TTS, a clip, one player's voice, one
      player's connection — the team must always have an automated path
- [ ] At least two first-time groups have played it, and neither needed a human

The last one matters most. Everything else can be inspected; that one has to be observed.
