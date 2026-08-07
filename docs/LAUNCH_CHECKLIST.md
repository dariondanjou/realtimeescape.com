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

## BLOCKED — needs one credential each

### 1. Apply the database schema  ← **do this first, nothing else works without it**

Booking, accounts, invitations, credits, recording and feedback all write to tables that do not
exist yet. Until this runs, the site is a brochure.

**Fastest path (about a minute):** open the Supabase SQL editor for project
`xnejbxdvqmzlaljkgwaf` and run these three files in order, pasting each in full:

```
supabase/migrations/0001_init.sql                       accounts, bookings, seats, invitations, sessions
supabase/migrations/0002_credits_recording_players.sql  credits, session recording, issue triage, player numbers
supabase/migrations/0003_feedback_queue.sql             feedback capture and the collated bug/feature queue
supabase/migrations/0004_demo_and_credit_spend.sql      demo bookings, credit redemption accounting
```

All four are guarded and safe to re-run.

**Or from the CLI**, if you supply the database password:

```bash
npx supabase link --project-ref xnejbxdvqmzlaljkgwaf --password '<db password>'
npx supabase db push --password '<db password>'
```

> The Supabase CLI on this machine is logged in, but `supabase link` currently fails against the
> API with an upstream timestamp-parsing bug (`LegacyLinkApiKeysNetworkError`) unrelated to this
> project. The SQL-editor path avoids it entirely.

**Already done:** the private **`feedback-audio`** storage bucket exists (created via the Storage
API), and `ANTHROPIC_API_KEY`, `CONSENT_IP_SALT` and `DEMO_MODE_KEY` are set in Vercel production.

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

### 3. Deploy the game server

```bash
cd game-server && npm install
fly launch --name rte-game-server && fly deploy    # or railway up
vercel env add NEXT_PUBLIC_GAME_SERVER_URL production   # wss://rte-game-server.fly.dev
```

Until this exists the lobby's network check reports "not configured", which is accurate.

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

## STILL TO BUILD — real work, not configuration

Ordered by what unblocks the most.

1. **Babylon.js scene and player controller.** The 3D client does not exist yet. This is the
   largest remaining engineering item. Classic + guided movement, focus/inspection mode,
   contextual traversal, remote avatar interpolation.
2. **Puzzles P1–P12.** [BURN_WINDOW_GAME_SPEC.md](./BURN_WINDOW_GAME_SPEC.md) specifies all
   fourteen in full. P13 and P14 (the burn) are built. The other twelve are designed and
   unimplemented.
3. **Room package content JSON.** The schema is specified in
   [ROOM_SCHEMA.md](./ROOM_SCHEMA.md); the Burn Window content files are stubs.
4. **LiveKit party voice.** Architecturally decided, not integrated. Needs credentials.
5. **Environment art.** The visual gate is passed — [BURN_WINDOW_VISUAL_BIBLE.md](./BURN_WINDOW_VISUAL_BIBLE.md)
   has sampled palettes, lighting DNA, lens language and ready-to-use prompt blocks for both
   hero locations. Production has not started.
6. **CASS voice and cinematics.** Both endings, the crew reveal, the briefing.
7. **Hint engine implementation.** Deterministic selection is fully specified in
   [OPERATOR_AND_HINTS.md](./OPERATOR_AND_HINTS.md); the server currently returns a placeholder.
8. **Post-game team image generation.**
9. **Playwright multi-client E2E.** Especially the test that asserts cockpit and thruster
   clients receive strictly disjoint data.

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
