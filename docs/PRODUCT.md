# RealTimeEscape — Product Definition

Maintained engineering documentation. Source brief: [`MASTER_BUILD_BRIEF.txt`](./MASTER_BUILD_BRIEF.txt).
Related: [ARCHITECTURE.md](./ARCHITECTURE.md) · [NETWORK_PROTOCOL.md](./NETWORK_PROTOCOL.md)

---

## 1. What the product is

RealTimeEscape.com is a browser-based platform for real-time, multiplayer, 3D escape rooms sold as private paid digital events. The first commercial game is **Burn Window**: a 60-minute spacecraft-emergency thriller for 3–8 players (4–6 recommended) at approximately $20 per player.

The platform is an engine; each game is a versioned, data-driven **room package** running on it. Burn Window is content package #1, not a bespoke application.

The core experience: several friends in different physical locations open a URL, enter the same synchronized 3D world with independent first-person cameras, see one another as avatars, talk over built-in party voice, and solve a room whose ending structurally requires them to separate and communicate.

## 2. Product constraints (restated from the brief's REQUIRED decisions)

These are constraints, not preferences. Deviations require an ADR in [ARCHITECTURE.md](./ARCHITECTURE.md).

| # | Constraint |
|---|-----------|
| C-01 | Brand and business is RealTimeEscape.com. First game is Burn Window. |
| C-02 | Product form: browser-based, real-time, multiplayer 3D escape rooms. No download, no dedicated game client. |
| C-03 | Burn Window runs 60 minutes on a server-authoritative timer. |
| C-04 | Business model: paid digital event, initially ~$20 per player. |
| C-05 | Every player has an independent camera/view of one synchronized world; other players appear as 3D avatars in that world. |
| C-06 | Real-time player voice is built into the experience (not an external Discord/Zoom dependency). |
| C-07 | **Zero-host**: a normal customer session must be completely self-operated. No live Game Master, remote host, human clue giver, or staff member may be required to start, run, complete, fail, recover, or debrief a game. |
| C-08 | Narrative guidance and hints are automated (prerecorded media, deterministic logic, AI operator voice). A live human is never a gameplay dependency. |
| C-09 | Authoritative game state lives on the server. Clients render and predict locally but never decide canonical puzzle state. |
| C-10 | Puzzle logic is data-driven so new rooms do not require rewriting the platform. |
| C-11 | Desktop/laptop browser gameplay is the V1 target. Commerce, account, and invitation pages are mobile-friendly; phone gameplay is not a V1 requirement. |
| C-12 | V1 is private-group play only. Public stranger matchmaking is deferred. |
| C-13 | Burn Window must be excellent before attempting a rapid room-release cadence. |
| C-14 | Burn Window player count: 3–8 supported, 4–6 recommended. The signature cockpit/thruster ending is not compromised to reach a 2-player minimum. |

## 3. Differentiators

1. **Same world, different eyes.** Each player moves and looks independently. One shared server-maintained reality; players can be in the cockpit, engineering, and a thruster crawlspace simultaneously.
2. **Communication as a game mechanic.** Clues are deliberately split across people and locations. Nobody holds all the information; talking is part of solving. This is enforced at the protocol level — see the asymmetric-information rule in [NETWORK_PROTOCOL.md](./NETWORK_PROTOCOL.md#8-asymmetric-information-rule).
3. **Software-only live event.** A scheduled game feels like an appointment with friends, but any number of isolated private sessions can start at the same clock time — there is no physical-room inventory. Capacity is real but horizontally scalable, not literally infinite.
4. **Worlds physical rooms cannot build.** Spaceflight, microgravity, collapsing environments, dangerous machinery — impossible or unsafe to stage physically.
5. **Reusable engine + room packages.** New rooms are content, not forks. See [ARCHITECTURE.md](./ARCHITECTURE.md#3-repository-layout-as-built) for the room-package location.

## 4. The zero-host principle

This is the defining business constraint. A normal paid session must, without any staff member online, be able to:

- Accept payment and provision seats.
- Send invitations.
- Open the lobby and run connection/audio/GPU tests.
- Start itself and play the narrative briefing.
- Track every puzzle and detect progress.
- Give hints and answer approved gameplay questions.
- Handle common reconnections.
- Determine win/loss and produce the debrief.
- Deliver post-game media and results.
- Issue an automated recovery credit/reschedule path after a qualifying technical failure.

The company may employ developers, support staff, and administrators — but no paid customer session ever *depends* on one of them being present in real time. Internal admin tooling exists for operations and debugging; its existence does not imply live monitoring of normal games.

**AI operator model.** Each room has an in-fiction automated operator voice (for Burn Window: a damaged ship-assistance system; final persona is a creative decision). The operator is never the source of canonical puzzle truth:

1. The game server knows exact canonical session/puzzle state.
2. A deterministic Hint Engine decides which unsolved puzzle is hint-eligible and which of its 3 authored hint tiers applies.
3. Room content contains authored facts, solution data, and hint ladders.
4. An LLM may select/rephrase approved information in the operator's voice; TTS may speak it.
5. Major narrative moments use polished prerecorded audio/video.
6. If LLM/TTS/speech services are unavailable, the same canonical hint appears as deterministic text and/or prerecorded fallback. **A paid game must remain completable with all AI services down.**

The operator must not invent puzzle solutions, alter game state, create rules, or reference objects that do not exist. No continuously-reasoning LLM runs for the full 60 minutes; most session behavior is state-driven and AI is invoked only when useful.

## 5. Customer journey

### 5.1 Discovery
RealTimeEscape.com presents a cinematic catalog. At launch there is one flagship paid game: Burn Window. Each game card carries title, trailer/hero visual, premise, duration, recommended/supported player count, difficulty, intensity, price per player, and device/browser guidance.

### 5.2 Purchase paths
Two primary options, both creating **private** sessions:

- **PLAY NOW** — instant private lobby plus a shareable invitation link.
- **SCHEDULE** — pick a future date/time for a private group.

There is no artificial time-slot inventory; many isolated team sessions can begin at the same time. No public matchmaking in V1 (constraint C-12).

### 5.3 Payment
Stripe Checkout with two purchase patterns:

- **A. Host pays all seats.**
- **B. Host pays/claims one seat** and sends secure invitations letting friends pay for their own seats.

Stripe webhooks — never the client redirect alone — provision paid access. Every invitation/seat maps to a booking and eventually to a session participant. See [ARCHITECTURE.md](./ARCHITECTURE.md#adr-006--stripe-checkout-with-server-verified-webhooks) for fulfillment idempotency.

### 5.4 Pre-game anticipation (PLANNED — content, not platform, gates this)
Scheduled games extend the story before game day: digital boarding pass, orbital-tour itinerary, passenger safety video, countdown email, non-essential lore. Rule: pre-game material enriches immersion but never contains mandatory puzzle information — a player who ignores every email enters at no disadvantage.

### 5.5 Lobby
Opens ~15 minutes before a scheduled start. Functions: roster/seat confirmation, avatar selection, microphone/speaker test, browser/GPU test, network quality test, movement tutorial, ready state, team voice. For Burn Window the lobby is diegetic: players gather in the civilian viewing room before the incident; when everyone is ready, the story event fires and the 60-minute clock starts.

### 5.6 Briefing and start
Prerecorded, polished opening sequence. At start the server locks the participant roster, assigns/rebalances role-specific information, creates the deterministic random seed, starts the canonical timer, transitions session state, and begins event logging.

### 5.7 Gameplay
Players explore, communicate, solve, separate, recombine, and execute the final coordinated manual burn. The 60-minute timer is server-authoritative. Final-burn instructions are server-generated per session from a validated seed so walkthroughs lose value and communication stays genuine; randomization can never create an impossible configuration.

### 5.8 Success or failure
- **Success:** burn completes, navigation confirms a valid return trajectory, cinematic payoff, completion time and hint usage recorded.
- **Failure:** the Burn Window reaches zero without a valid trajectory. Failure gets a satisfying cinematic conclusion, not a red error screen.

### 5.9 Debrief
Automatic: team result, time remaining/final progress, hints used, puzzle milestones, team photo, achievements (PLANNED), share action, next-game action.

### 5.10 Aftercare
Immediately sent: results link, free team image/certificate, share link, referral/next-room offer where appropriate. Paid add-ons (cinematic highlight reel, expanded media pack) are PLANNED post-launch features; the session event log is captured from day one so recaps can be reconstructed later.

## 6. Business model and pricing

**Core offer:** Burn Window at ~$20/player for a 60-minute private digital escape event. 3–8 players supported, 4–6 recommended.

Launch simplifications:
- Same base seat price for instant and scheduled private games.
- Host-pays-all or split payment.
- No subscriptions before repeat demand exists.

Later pricing options (PLANNED, demand-dependent): premium new-release seats, prepaid full-team discount, gift passes, catalog bundles, self-service corporate tier, post-game media/cosmetic add-ons.

**Unit economics principle.** The model removes physical rent/buildout and per-session Game Master labor. Compute, bandwidth, voice, payment fees, refunds, content development, and customer acquisition remain real costs that scale with usage. Describe the business as highly scalable with potentially high gross margin after room-development amortization — never as zero-cost/infinite-capacity. Host-paid group transactions reduce the impact of fixed per-transaction payment fees versus eight independent charges. Revalidate all payment-processor pricing before financial forecasting.

**Reference volume math** (illustrative, not forecast): 10,000 paid player sessions/year × $20 = $200k gross ≈ 32 team games/week at 6 players/team. 100,000 player sessions/year = $2M gross ≈ 320 team games/week. Capacity at these volumes is an infrastructure-scaling exercise; acquisition and retention are the harder constraints.

## 7. Definition of done — first paid beta

Burn Window enters controlled paid beta only when **all** of the following hold:

1. A new customer can discover Burn Window and understand the requirements.
2. A host can purchase and create a private game without staff.
3. Friends can securely claim/pay for seats without staff.
4. Scheduled or instant lobby opens automatically.
5. The lobby reliably tests graphics, network, and voice.
6. 3–8 players can enter the same room on separate systems.
7. Each player has an independent view.
8. Everyone sees synchronized remote avatars and important object changes.
9. Classic and guided movement are usable by first-time testers.
10. Team voice works well enough for the final asymmetric communication mechanic.
11. Inventory/notebook/clue functionality needed by the designed puzzles works.
12. Every required puzzle has authored hint tiers.
13. The AI operator delivers state-aware help without being a single point of failure.
14. If AI speech fails, required clues/help remain available automatically.
15. A disconnected player can reconnect.
16. Supported player counts cannot soft-lock the room.
17. The final cockpit/thruster split requires real communication and feels satisfying.
18. The server authoritatively validates the final manual burn.
19. The 60-minute success/failure outcome is consistent on all clients.
20. Debrief/results are automatic.
21. The free post-game team image/result artifact is delivered automatically or has a deterministic generation/retry path.
22. Meaningful session telemetry is recorded.
23. No live Game Master, host, or clue giver is necessary anywhere in the normal customer path.
24. The experience passes multiple first-time-group playtests and performance testing on the actual supported device/browser matrix.

## 8. Deferred until the core business is proven

Public matchmaking, full mobile 3D gameplay, VR, user-generated rooms/marketplace, full facial performance capture, exact clothing recreation from selfies, continuous free-form AI NPC conversation, cloud GPU streaming as the standard experience, complex subscriptions, corporate tournament orchestration, fully automated cinematic replay, and weekly flagship releases. These are potential features, not launch dependencies.
