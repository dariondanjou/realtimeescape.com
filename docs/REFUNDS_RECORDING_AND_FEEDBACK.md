# REFUNDS, RECORDING AND FEEDBACK

The commercial and data policy behind `/legal/terms`, and how it is enforced in code.

Related: [PRODUCT.md](./PRODUCT.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [BURN_WINDOW_GAME_SPEC.md](./BURN_WINDOW_GAME_SPEC.md)

---

## 1. THE POLICY

**All payments are non-refundable. Money never goes back to a card.** Qualifying problems are
resolved with **account credit**, which can be spent on a replay or on any other game, never
withdrawn as cash.

The justification stated to customers, and the one the product must live up to:

> RealTimeEscape is a **premium beta**. Real-time multiplayer 3D worlds in a browser, with live
> voice and an authoritative server, sit at the frontier of what this medium can do — and work at
> that frontier sometimes has problems. The trade is honest: players get access to something
> genuinely new, earlier, at $20 a seat, and the business gets the freedom to build ambitiously
> without every rough edge becoming a chargeback.

Two obligations follow from taking a customer's money and not giving it back, and both are
engineering obligations, not marketing ones:

1. **We must be able to prove what happened.** A no-refund policy adjudicated on vibes is a
   grievance machine. Every session is recorded in enough detail to replay it. See §3.
2. **We must actually fix things.** Credit for a problem we never repair is a subscription to
   disappointment. Every report feeds the collated queue in §5.

### Severity ladder

| Severity | Definition | Remedy |
|---|---|---|
| **Major** | Experience significantly compromised — could not finish, a puzzle became unsolvable, the server failed, or a defect consumed enough of the clock to change the outcome | Credit equal to what each player in the session paid |
| **Moderate** | A real disruption, but the game stayed winnable | In-game compensation where possible (clock freeze, time added back); partial credit where not |
| **Minor** | Cosmetic glitch, brief hitch, an audio line that did not fire | Logged against the exact moment and fixed. No credit. |

The moderate tier is the one that matters most in practice: **fixing it during the session beats
compensating after it.** `rte_session_adjustments` records clock freezes, added time, puzzle
bypasses and checkpoint restores applied live, so a player whose experience was repaired in-flight
never needs to file anything.

### Credit rules

Credit is an append-only ledger (`rte_credit_ledger`), never a stored balance. A balance is the sum
of the ledger, so it can never drift, and every dollar is traceable to the report that minted it.

- Applies against the price of any seat, on any game
- Never expires
- Can cover seats for other people in the holder's group
- **No cash value. Not withdrawable. Not transferable between accounts. Never paid out** — there is
  deliberately no ledger entry kind that represents a payout.

A database trigger rejects any entry that would take a balance negative.

---

## 2. AI TRIAGE — AND ITS LIMITS

`lib/triage.ts` classifies a report against the session record using Claude. Two design rules keep
it honest:

**The model sees evidence, not just the complaint.** It receives the gameplay event log, the input
log, applied adjustments and the outcome, and is instructed to cite specific events. A report
describing catastrophic failure with nothing corroborating it in the record cannot be graded major —
the model is told to say so and let a human look.

**The model never issues credit.** It returns a severity and a confidence; `decideOutcome()` — plain
deterministic code — decides what that recommendation is permitted to do:

| Verdict | Confidence | Outcome |
|---|---|---|
| minor | ≥ 0.75 | Auto-resolved, logged, no credit |
| moderate | ≥ 0.80 | Auto-resolved, partial credit (half a seat) |
| **major** | any | **Human review, always** |
| anything | below threshold | Human review |

The asymmetry is deliberate. **Automation may close cheap cases; it may never close expensive
ones.** A wrong "minor" costs an apology. A wrong "major" costs money, and at scale a model that
can mint credit is a model that can be talked into minting credit.

If the model is unavailable, the report is still stored and routed to a human. A player must never
lose their report to an outage.

---

## 3. SESSION RECORDING

Three streams, three separate consent positions. Bundling them into one switch would be simpler and
worse.

| Stream | Default | Table | Retention |
|---|---|---|---|
| Gameplay events | Always on | `rte_session_events` | 24 months |
| Input events | Always on | `rte_input_events` | 24 months |
| Images and video | **On, with opt-out** | `rte_session_recordings` | 24 months, or indefinite if published with consent |
| Team voice | **Off, opt-in only** | `rte_session_recordings` | 90 days |

**Input capture records which control was operated, never free text.** Chat and notebook content is
captured as gameplay events, so a player's typing is never reconstructable character by character.

**Images and video are opt-out.** Session footage and the team image are captured by default and may
be used publicly, including on social media. The lobby states — at the moment of choosing, not
afterwards — that opting out also removes the visual record used to investigate problems, so an
opted-out session is harder to diagnose and its reports harder to substantiate.

**Voice is opt-in and requires every player to agree.** Two reasons this one is not negotiable:
recording a conversation without every participant's knowledge is illegal in many jurisdictions, and
a room whose central mechanic is people talking freely to each other is a worse room if they are
unsure who is listening. Recording state is displayed in the HUD the entire time it is active.

> ⚠️ **Legal review required before launch.** The opt-out default for images and video is a
> deliberate product decision, and it carries jurisdictional exposure that a lawyer — not this
> document — should sign off on. Under GDPR, using a recognisable person's image for marketing
> generally requires **affirmative** consent, and several US states have biometric and likeness
> statutes with their own requirements. The schema supports flipping images and video to opt-in per
> region with a single default change (`rte_session_consents.media_social_use`); the voice stream is
> already opt-in everywhere for the same reason. **Do not take money in the EU or UK before this is
> reviewed.**

Consent is recorded per seat per session with a salted hash of the request IP and the user agent —
enough to prove consent was given, without retaining the IP itself.

---

## 4. PLAYER NUMBERING

Every person who pays for a seat is assigned a permanent sequential number: player #1, player #2,
and so on. Identity is the lowercased email, so a player keeps their number whether or not they
later create an account.

`rte_claim_player_number(email, user_id)` is idempotent — calling it repeatedly returns the same
number and never mints a second one.

The count of assigned numbers drives the public ticker on the landing page, shown against a target
of **50,000 players**. At $20 a seat that is $1,000,000 of gross revenue — the threshold the business
treats as its first real milestone. The ticker reads from `rte_public_stats`, a view exposing counts
only, so the anon key can render it with no access to any player row.

The number is also a retention hook. Being player #47 is worth something to the kind of person who
books a beta.

---

## 5. FEEDBACK AND THE COLLATED QUEUE

### Capture

`components/FeedbackWidget.tsx` sits in the corner of **every page, including during a game**.
Players can type or speak. The moment somebody notices something is the moment they can best
describe it; making them hold the thought until a debrief loses most of what they would have said.

Audio is recorded with `MediaRecorder`, uploaded, and queued for transcription
(`transcription_state = 'pending'`). Text is collated immediately.

### Collation

`lib/feedback.ts` matches each piece of feedback against existing topics. Same underlying idea →
joins that topic and adds weight. Genuinely new → opens a topic with a **value statement** saying
what fixing it is worth, in terms of the player experience, not a restatement of the problem.

The model is instructed to **prefer matching**. A queue carrying three near-duplicate topics ranks
each at a third of the signal the real issue deserves — over-merging is recoverable by splitting;
signal spread across duplicates is invisible.

The model may only select an existing topic by id or declare a new one. **It cannot rewrite, merge
or delete topics, and it never sets weight.**

### Weighting

Weight is computed in Postgres from the feedback rows themselves — recomputed, never incremented, so
a reclassification or merge can never leave a stale score behind:

```
weight = (distinct_players + sqrt(repeat_mentions)) × kind_factor × severity_factor

kind_factor:      bug 1.6 · confusion 1.3 · feature 1.0 · other 0.8 · praise 0.4
severity_factor:  major 3.0 · moderate 1.75 · minor 1.0
```

**Distinct players dominate.** One person reporting something five times contributes far less than
five people reporting it once — the square root on repeat mentions makes that explicit rather than
leaving it to whoever reads the list.

### Prioritisation

`rte_feedback_queue` ranks by weight divided by an effort divisor (trivial 0.5 → large 2.2), so a
cheap fix several people hit outranks an expensive one a couple of people mentioned. Effort is a
divisor rather than a filter: a large-but-important item still climbs rather than being excluded.

The queue is published at `/roadmap`. Topics carry no personal data; the raw feedback behind them
stays private.

---

## 6. WHAT STILL NEEDS DOING

| Item | Why it matters |
|---|---|
| Legal review of the image/video opt-out default | §3. Blocking for EU/UK sales. |
| Audio transcription | Spoken feedback is stored but not yet collated. Everything else is ready for it — collation runs on `body`, so a transcript is all that is missing. |
| A `feedback-audio` storage bucket | Create it in Supabase; uploads currently degrade to storing the report without the audio. |
| Admin review UI for `awaiting_review` reports | Every major determination is a human decision, and there is no screen for making it yet. |
| Retention job | `rte_session_recordings.delete_after` is set on every row; nothing deletes them yet. |
| ~~Credit redemption at checkout~~ | **Done.** `lib/credit.ts` reads the balance server-side at checkout and applies it as a Stripe coupon (so it appears on the receipt) or bypasses Stripe entirely when it covers the full amount. A negative ledger entry is written before the Stripe session is created, and the database trigger rejects any spend that would go negative — so two concurrent checkouts fail loudly rather than double-spending. |
