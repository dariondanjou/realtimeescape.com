# BURN WINDOW — GAME DESIGN SPECIFICATION

Room package: `rooms/burn-window`
Content version: `1.0.0-graybox`
Engine contract: see [ROOM_SCHEMA.md](./ROOM_SCHEMA.md) and [PUZZLE_COMPONENTS.md](./PUZZLE_COMPONENTS.md)
Art direction: see [BURN_WINDOW_VISUAL_BIBLE.md](./BURN_WINDOW_VISUAL_BIBLE.md)
Parent document: [MASTER_BUILD_BRIEF.txt](./MASTER_BUILD_BRIEF.txt)

> **Relationship to the master brief.** The master brief establishes Burn Window's premise,
> four-act shape, endgame mechanic and production constraints. It intentionally stops short of
> naming individual puzzles, codes, dependencies, hint text, failure costs or scaling tables.
> **This document is the authoritative source for all of that.** Where the two disagree on a
> product constraint (duration, player count, zero-host operation, server authority), the master
> brief wins. Where they disagree on a design detail, this document wins and the change is
> recorded in §14.

---

## 1. IDENTITY

| Field | Value |
|---|---|
| Title | Burn Window |
| Format | Real-time multiplayer 3D escape-room thriller, browser-based |
| Duration | 60 minutes, server-authoritative |
| Players | 3–8 supported; 4–6 recommended |
| Price | $20 per player |
| Setting | Low Earth orbit, present-adjacent near future |
| Intensity | Suspense and body horror at one controlled beat (§5, Act II). No jump scares, no gore. |
| Failure | Permitted and authored. A failed run gets a complete cinematic ending, not a red screen. |

### 1.1 Fiction

**Anterra Orbital Flight AO-114**, marketed as the *Blue Marble Loop* — a six-hour civilian
orbital sightseeing flight aboard the passenger vehicle **CSV Meridian**. Two professional
flight crew, up to eight passengers, a viewing lounge with a nine-meter Earth-facing window.

Passengers are sedated for the ascent burn as a matter of routine — Anterra's marketing calls it
"sleep through the hard part." They are supposed to wake in stable orbit.

They wake to a dark lounge, a silent intercom, and Earth in the wrong part of the window.

### 1.2 The AI operator

**CASS** — *Cabin Assistance and Safety System*. Anterra's passenger-facing service voice:
originally scripted for beverage service and viewing commentary, now running on emergency power
with most of its subsystems unavailable. Warm, over-rehearsed hospitality diction colliding with
catastrophe. CASS is the diegetic delivery mechanism for hints and status.

CASS is **never** the source of canonical puzzle truth. See
[OPERATOR_AND_HINTS.md](./OPERATOR_AND_HINTS.md) for the binding architecture. In-fiction, the
reason CASS cannot simply solve the problem is stated out loud in the opening: *flight-critical
subsystems require crew authorization, and CASS has no crew to authorize it.*

### 1.3 What happened

A micrometeoroid penetration during the ascent burn breached the flight deck's environmental
loop. The two crew, unsedated and on station, lost consciousness before they could reach
pressure suits. The automatic hull seal worked. It worked four minutes too late for them.

The ship is intact, pressurized and flying. It simply has nobody flying it.

**Authored deliberately shallow.** The players learn *what* killed the crew and *that nobody is
coming*. They do not learn why the breach defeated a system rated to survive it, why AO-114 was
off its filed trajectory before the impact, or what the sealed cargo module in the aft frame
contains. Those threads are reserved for later releases and must not be resolved here.

---

## 2. THE SHIP

Seven playable zones. Zone IDs are stable and referenced by the room package.

| ID | Zone | Function | Act | Visual state |
|---|---|---|---|---|
| `Z1` | Passenger Viewing Lounge | Start. Eight seats, the great window, service alcoves. | I | Moon Knight DNA |
| `Z2` | Service Corridor | Spine of the ship. Pressure interlock at each end. | II | Transitional |
| `Z3` | Galley & Stowage | Consumables, tools, EVA prep lockers. | II | Transitional |
| `Z4` | Crew Quarters | Two bunks, personal effects, crew terminal. | II | Cockpit DNA |
| `Z5` | Flight Deck | Cockpit. Navigation, flight computer, the crew. | II–IV | Cockpit DNA |
| `Z6` | Port Thruster Bay | Manual thruster station **A**. | III–IV | Cockpit DNA, industrial |
| `Z7` | Starboard Thruster Bay | Manual thruster station **B**. | III–IV | Cockpit DNA, industrial |
| `Z8` | Aft Gimbal Trim Bay | Manual thruster station **C**. Live only at 5+ players. | III–IV | Cockpit DNA, industrial |

**Critical spatial rule.** Z5 (flight deck), Z6, Z7 and Z8 have **no line of sight to one
another** and are far enough apart that no player can occupy two of them. This is not set
dressing — it is the load-bearing constraint that forces the endgame onto the voice channel.
Level layout must be validated against it: a straight-line traversal between any thruster bay
and the flight deck must take no less than 25 seconds at normal movement speed.

### 2.1 Movement and microgravity

Players wear Anterra emergency magnetic footwear, auto-engaged when the lounge loses power.
Movement is therefore ordinary walking. **Unsecured objects and the crew bodies float.**

This is the accessibility decision that keeps the room playable by first-time casual users while
still selling microgravity. Floating objects use deterministic keyframed drift, not networked
rigid-body physics — see [PERFORMANCE_BUDGET.md](./PERFORMANCE_BUDGET.md).

---

## 3. ROLES

Roles are emergent, not classes. Nothing is locked to a role; the game assigns nobody.

| Role | Where | Sees | Cannot |
|---|---|---|---|
| Navigator | Z5 | Burn solution, all station readiness, trajectory, master clock | Touch any thruster control |
| Cockpit systems | Z5 | Fault schematic, propellant state, interlock codes | Touch any thruster control |
| Station operator A/B/C | Z6/Z7/Z8 | Local panel, local gauges, local hardware | See the burn solution or any other station |
| Runner | Anywhere | Whatever they walk to | Be in two zones at once |

The asymmetry is enforced **server-side**. The flight deck's burn solution is never transmitted
to a client whose player is in a thruster bay, and station panel state is never transmitted to
the flight deck except as the coarse readiness booleans the navigator is entitled to. A client
that requests data for a zone it is not in receives a rejection, not the data.

### 3.1 Player-count scaling

| Players | Live stations | Burn stages | Notes |
|---|---|---|---|
| 3 | A, B | 2 | Minimum viable split: 1 navigator + 2 operators. Station C is faulted out by the Act III damage survey. |
| 4 | A, B | 2 | 2 cockpit + 2 operators, or 1 + 2 + 1 runner. |
| 5 | A, B, C | 2 | Station C activates. |
| 6 | A, B, C | 3 | Recommended configuration. Three-stage burn. |
| 7 | A, B, C | 3 | Extra players absorb into cockpit systems and runner work. |
| 8 | A, B, C | 3 | Full manifest. Act I code fragments spread to 4 locations rather than 3. |

Scaling is applied at roster lock (session start) and is **not** re-evaluated mid-session.
A disconnect does not reduce the station count — see §9.

---

## 4. PUZZLE DEPENDENCY GRAPH

Fourteen puzzles. `P` = puzzle ID used in the room package.

```
                        ┌── P1 Restraint Release ──┐
                        │                          │
                   P2 Emergency Power ─────────────┤
                        │                          │
                        └── P3 Lounge Door ────────┘   ACT I
                                   │
                        ┌──────────┴──────────┐
                   P4 Pressure Interlock      │
                        │                     │
                   P5 Tool Recovery ──────────┤            ACT II
                        │                     │
                   P6 Crew Locker ────────────┤
                        │                     │
                        └── P7 Flight Deck Hatch ─┘
                                   │
                            [CREW REVEAL]
                                   │
                   P8 Flight Computer Restore
                                   │
                        ┌──────────┴──────────┐
                   P9 Damage Survey      P10 Cross-Feed      ACT III
                        │                     │
                        └──────────┬──────────┘
                                   │
                   P11 Override Key Distribution
                                   │
                   P12 Station Bring-Up
                                   │
                   P13 Burn Solution                        ACT IV
                                   │
                   P14 SYNCHRONIZED BURN
                                   │
                        ESCAPED  /  FAILED
```

`P2` and `P1` are independent and may be solved in either order. `P9` and `P10` are independent
of each other. Everything else is strictly ordered.

---

## 5. ACT-BY-ACT DESIGN

### ACT I — WAKE (target 0:00–12:00)

Opens on a prerecorded cinematic: the Anterra safety-video jingle degrading into an emergency
tone, cabin lights failing, CASS beginning a service greeting and aborting it mid-sentence.
The 60-minute clock starts when the cinematic ends.

Act I's real job is **teaching the game** while appearing to be story.

---

**P1 — RESTRAINT RELEASE** · Zone Z1 · Components: `Document`, `Lever`, `MultiPlayerTrigger`

Every player wakes strapped into a seat. The powered release is dead.

The seat-back safety card (`Document`) shows the manual release: a lever inside the armrest,
which requires the **adjacent** seat's occupant to hold their own release simultaneously — an
Anterra anti-tamper design that keeps children from unstrapping in flight.

*Teaches:* examine, read, interact, and that some things need two people. The very first action
of the game is cooperative.

*Server validation:* two `MultiPlayerTrigger` inputs on paired seat IDs within 2.0 s.
*Solo-safe:* if a player has no adjacent occupied seat (3-player sessions), their card shows the
single-occupancy override instead. Never soft-locks.

| Tier | Hint |
|---|---|
| 1 | "Anterra reminds passengers that the safety card is located in the seat pocket ahead of them." |
| 2 | "Manual restraint release is a paired operation. Please coordinate with the passenger beside you." |
| 3 | "Hold the lever inside your armrest. Your neighbor must hold theirs at the same time." |

---

**P2 — EMERGENCY POWER** · Zone Z1 · Components: `Open/Close`, `Toggle`, `Terminal`

The lounge is on battery. A service hatch below the window bench opens to a breaker panel with
six breakers, three tripped. A placard states the bus rule: *lighting and comms cannot be
energized while the cabin heater is loaded.*

Solving requires shedding the heater breaker before closing the other two. Trying the naive
order trips the whole bus and forces a 15-second reset — a **cost, not a failure**.

*Teaches:* read the rule, order matters, retries are cheap.

Solving P2 restores lounge lighting and brings CASS to full voice. CASS's first full line
delivers the stakes: the ship is not in the orbit it should be in.

| Tier | Hint |
|---|---|
| 1 | "Cabin power is available but the distribution bus is unbalanced." |
| 2 | "The placard beside the panel describes a load rule. Something must be shed before something else can be restored." |
| 3 | "Open the cabin heater breaker first. Then close comms, then lighting." |

---

**P3 — LOUNGE DOOR** · Zone Z1 · Components: `Document`, `Keypad`, `Examine`

The lounge door is under a four-digit maintenance lock. The code is **not written anywhere**. It
is Anterra's standard construction: the flight number, seat-block letter and departure day,
assembled from four different objects on four opposite sides of the lounge:

| Fragment | Object | Location in Z1 |
|---|---|---|
| Digit 1–2 | Boarding pass in a seat pocket | Forward port |
| Digit 3 | Seat-block placard above the alcove | Aft starboard |
| Digit 4 | Departure stamp on the itinerary card | Forward starboard |
| Ordering rule | Framed Anterra maintenance notice | Aft port |

No single player can see two fragments at once from any standing position. **This is the first
asymmetric-information puzzle and the moment the team learns to talk.**

At 8 players the ordering rule moves to a fourth distinct location; at 3 players two fragments
share a location to keep the search tractable.

*Randomization:* the four-digit value is session-seeded. Fragment objects and the ordering rule
are regenerated to match. A walkthrough is worthless.

| Tier | Hint |
|---|---|
| 1 | "The maintenance lock accepts a four-digit code. Anterra does not print codes on doors." |
| 2 | "Your boarding documents and the cabin placards each carry part of a flight identifier. Compare what each of you is looking at." |
| 3 | Names the four objects and the ordering rule, without giving the digits. |

---

### ACT II — DESCENT INTO THE SHIP (target 12:00–28:00)

Tone shifts from confused to purposeful. The ship gets colder, more industrial, less finished —
the visual transition documented in the visual bible.

---

**P4 — PRESSURE INTERLOCK** · Zones Z1→Z2 · Components: `Dial`, `Lever`, `Terminal`

The corridor door will not open across a pressure differential. A manual equalization valve sits
in the lounge; the differential gauge that reports the result is mounted **inside the corridor
vestibule**, visible only through a small port on the far side.

One player works the valve blind. Another reads the gauge and talks them onto the target band.
Overshooting vents and restarts — again a time cost, not a failure.

*The second asymmetric puzzle, and the first where one player's hands and another's eyes are
separated.* This is a deliberate rehearsal of the endgame in miniature.

| Tier | Hint |
|---|---|
| 1 | "Hatch actuation is inhibited across a pressure differential." |
| 2 | "The equalization valve and its gauge are not in the same room. Someone will have to read the number out loud." |
| 3 | "Turn the valve slowly toward the green band and stop at the reading your partner calls." |

---

**P5 — TOOL RECOVERY** · Zone Z3 · Components: `Drawer/Container`, `PickUp`, `Combine`

Galley stowage yields the run's physical inventory: a **multi-tool**, an **EVA glove** (needed to
touch a cold-soaked valve in Act III), and a **crew ration tin** whose lid carries a scratched
four-character string — a red herring that resolves into flavor, not a code. The tin is
deliberate: teams that assume every number matters lose time, and learning to discard is part of
the room.

The tool locker is a simple combination container; the combination is stenciled inside the
galley hatch that P4 just opened.

*Team evidence tray:* all three objects publish to the shared inventory, teaching that item
discovery is a team event.

---

**P6 — CREW LOCKER** · Zone Z4 · Components: `Terminal`, `Document`, `Keypad`, `Lock/Unlock`

The crew terminal boots to a personal account, not a flight system. It contains the run's
narrative payload: a half-finished message home, a maintenance gripe about the environmental
loop filed twice and closed twice without action, and the ascent-burn checklist with two
initials on it.

The locker holding the **crew authorization token** opens on a combination the log makes
derivable but never states: the gripe's ticket number, read in the order the checklist initials
appear.

*Narrative function:* by the time the flight deck opens, players already know the crew as people.
The reveal in P7 lands because of what they read here.

| Tier | Hint |
|---|---|
| 1 | "Crew lockers use personal combinations, not flight codes." |
| 2 | "Something in the maintenance record is numbered. Something else in the checklist tells you what order to read it in." |
| 3 | Names the ticket number and the initial ordering, without giving the combination. |

---

**P7 — FLIGHT DECK HATCH** · Zones Z4→Z5 · Components: `PuzzleSocket`, `MultiPlayerTrigger`, `Door`

The flight deck hatch takes the crew token in its socket — and then, with the ship on emergency
power, will not drive itself. Two players must work the manual crank arms on opposite sides of
the frame, in phase, for six seconds.

The hatch opens.

**[CREW REVEAL]** — the authored horror beat. Prerecorded, non-interactive, ~25 seconds. The
flight deck is intact, lit, calm, its displays quietly running. The two crew float in their
restraints. There is no music sting and no shock cut. The room simply lets the players look.

The visual bible's instruction governs: *the flatness is the horror.* Existing flight-deck
practicals only. No dramatic key light on the bodies.

CASS, immediately after, in unchanged hospitality diction, delivers the Act III turn: the
trajectory is wrong, an automatic correction is unavailable without crew authorization, and
there are `T` minutes until the return maneuver window closes.

---

### ACT III — DIAGNOSE AND PREPARE (target 28:00–45:00)

The team stops exploring and starts operating a spacecraft.

---

**P8 — FLIGHT COMPUTER RESTORE** · Zone Z5 · Components: `Terminal`, `SequenceInput`, `Button`

The navigation computer is in a safe state after the breach. Restoring it is a cold-start
sequence printed on the console bezel — but two of the listed subsystems fail their self-test and
must be **skipped**, not repeated. The console reports which.

*Teaches:* read the machine's own output; the printed procedure is not always the right one.

On success the flight deck comes alive: trajectory display, Earth-return plot, and the
**master Burn Window countdown**, which from this moment is visible on every client's HUD as the
canonical clock.

---

**P9 — DAMAGE SURVEY** · Zones Z5 + Z6/Z7/Z8 · Components: `Terminal`, `Document`, `Examine`

The flight deck schematic shows four thruster clusters, each with a three-character fault code.
**The fault-code legend is not on the flight deck.** It is a laminated card in each thruster bay.

Cockpit reads codes aloud. Station players read meanings back. Together they determine which
clusters are usable.

*Randomization:* which clusters fault, and their codes, are session-seeded. Validation guarantees
the surviving set always matches the live-station count for the locked player count (§3.1) — the
randomizer can never produce an unwinnable configuration.

This is where the team discovers, from the machine rather than from CASS, that the correction
must be **manual and simultaneous**. The room tells them the shape of its own ending.

---

**P10 — PROPELLANT CROSS-FEED** · Zones Z5 + Z6 + Z7 · Components: `Lever`, `Dial`, `Terminal`

The surviving clusters are dry; the breach isolated their feed. Cross-feed valves in the port and
starboard bays must open **in an order determined by current tank pressures**, which only the
flight deck can see, and pressures shift as each valve opens — so the order must be recalculated
live rather than read once.

Opening out of order slams a check valve and costs 30 seconds to re-seat.

The cold-soaked starboard valve requires the **EVA glove** from P5. A team that skipped the galley
must go back — a real cost, never a soft-lock.

*This is the first true three-location puzzle and the dress rehearsal for P14.*

| Tier | Hint |
|---|---|
| 1 | "Cross-feed is a sequenced operation. Tank pressures determine the sequence." |
| 2 | "Only the flight deck can see tank pressure, and it changes as each valve opens. Call the next valve, not all of them." |
| 3 | Names the current correct next valve. |

---

**P11 — OVERRIDE KEY DISTRIBUTION** · All zones · Components: `PickUp`, `PuzzleSocket`

Physical manual-override keys — burnt-orange, unmistakable, the accent color the room has been
teaching since Act I — are recovered from the flight deck key rack and the galley EVA locker.
One key per live station. Each must be physically carried to its bay and socketed.

*Design function:* this is the moment the team **commits to the split**. It is deliberately not a
puzzle; it is a decision. Who goes where, for the rest of the game, is chosen here. The game
provides no guidance, and it should not.

CASS marks the moment: *"Anterra recommends that passengers remain seated together during
maneuvering. That recommendation is no longer available."*

---

**P12 — STATION BRING-UP** · Zones Z6/Z7/Z8 · Components: `Toggle`, `Keypad`, `Lever`

Each station powers up locally: main bus, gimbal hydraulics, ignition interlock. The **interlock
release code is displayed only on the flight deck**, one per station, and each is different.

Navigator reads codes to stations. Stations enter them. The flight deck's readiness board lights
one lamp per armed station — coarse booleans, nothing more.

By the end of P12 the team is fully separated, communicating only by voice, with every player
looking at something no one else can see. **The game is now in its final configuration and there
are roughly fifteen minutes left.**

---

### ACT IV — THE BURN (target 45:00–60:00)

---

**P13 — BURN SOLUTION** · Zone Z5 · Components: `Terminal`, `Document`

The flight computer produces the maneuver: for each stage, a target station, a **thrust
percentage**, a **gimbal angle**, an **arming order**, and a **burn duration**. Plus the ignition
epoch — the exact second on the master clock at which all stages must fire together.

The solution is generated server-side from the session seed and exists **only** on the flight
deck. It is never sent to a station client. The only path from the solution to the hardware is a
human being saying it out loud.

The navigator must also translate: the computer emits cluster designations (`PX-2`, `SB-4`), and
the station panels are labeled with bay-local positions (`UPPER`, `LOWER`, `TRIM`). The mapping is
on the same laminated legend cards from P9. Cockpit cannot read them; stations must.

---

**P14 — THE SYNCHRONIZED BURN** · Zones Z5 + Z6 + Z7 (+ Z8) · Components: `Dial`, `Lever`, `Button`, `MultiPlayerTrigger`

The endgame. For each stage:

1. Navigator calls thrust percentage and gimbal angle to each station.
2. Each operator sets two physical dials on their panel. **Dials are analog** — approach and
   overshoot are visible, and a value is a value the operator has to hold.
3. Each operator arms, in the navigator's called order. Arming out of order safes the whole
   ship and costs 20 seconds.
4. Navigator counts down to the ignition epoch from the master clock.
5. All live stations press and **hold** ignition. Hold must begin within the tolerance window
   and last the full burn duration.

**Server validation** — canonical, on the game server, never on any client:

| Check | Rule |
|---|---|
| Thrust setting | Within ±2% of the commanded value |
| Gimbal angle | Within ±1.5° of the commanded value |
| Arming order | Exact |
| Ignition sync | All stations begin holding within a **900 ms** window |
| Burn duration | Each station holds within ±400 ms of commanded duration |
| Release | No station releases early |

**Outcomes**

- **All checks pass** → stage complete. Trajectory updates visibly on the flight deck and
  audibly through the whole ship. Remaining stages proceed.
- **Any check fails** → *recoverable setback*, never instant loss. The flight computer
  recalculates, the burn solution is **regenerated with new values**, and the team loses
  **90 seconds** plus the time spent re-reading new numbers. Failing does not repeat the same
  problem — it gives a new one, which keeps the pressure honest and prevents brute force.
- Setbacks are unlimited. The clock is the only limit. A team may attempt the burn until the
  window closes.

**Success.** Final stage validates → the Burn Window countdown stops → prerecorded success
cinematic: the ship's attitude settles, Earth swings back into the lounge window, and CASS —
for the first time in the entire run — says something that is not in its service script.

**Failure.** Countdown reaches zero without a valid trajectory → prerecorded failure cinematic.
The burn does not simply fail to happen. The team is *mid-attempt* when the window closes, and
the ship carries on into a long, quiet, survivable drift. Anterra will reach them. It will take
a while. CASS, still in hospitality diction, begins to explain the consumables situation and is
cut off by the credits.

**Both endings are complete pieces of authored drama.** A team that fails must still feel it
finished something.

---

## 6. RANDOMIZATION

All per-session variation derives from a single server-generated seed, recorded on
`rte_game_sessions.random_seed` so any run is exactly reproducible for debugging.

| Randomized | Range |
|---|---|
| P3 lounge door code | 4 digits, with fragments and ordering rule regenerated to match |
| P6 locker combination | Derived from generated ticket number + initial order |
| P9 faulted clusters | Constrained so survivors always equal the live-station count |
| P9 fault codes | 3-character alphanumeric, legend regenerated to match |
| P10 valve order | Derived from generated tank pressures |
| P12 interlock codes | One distinct code per live station |
| P13 thrust % | 40–95%, per stage per station |
| P13 gimbal angle | −20° to +20°, per stage per station |
| P13 arming order | Any permutation of live stations |
| P13 burn duration | 4–11 s, per stage |
| P13 station↔stage assignment | Any valid assignment |

**Validation gate (blocking, run on every seed in CI).** The room package's automated solver must
prove, for every player count 3–8 and 10,000 seeds: a success path exists from the initial state;
no generated code is ambiguous or unreachable; the surviving thruster set always supports the
required stage count; and no randomized value falls outside the tolerance the panels can
physically express. A seed that fails any check is rejected and regenerated — **the game must
never be able to deal an impossible hand.**

---

## 7. HINT LADDERS

Every one of P1–P14 carries a three-tier ladder. Tier 1 reframes, tier 2 directs attention,
tier 3 states the action without performing it. **No tier ever enters a code, moves an object or
changes state.** Ladders live in `rooms/burn-window/content/hints.json`.

Eligibility is deterministic (see [OPERATOR_AND_HINTS.md](./OPERATOR_AND_HINTS.md)): the engine
picks the *frontier* puzzle — solvable now, not yet solved, longest time since the team last made
progress on it. Escalation requires 180 s of no progress on that same puzzle. Teams may also
request a hint, which advances the ladder immediately.

**Act IV exception.** During P14, hints never touch the burn *values* — those exist only on the
flight deck and only a human may relay them. Act IV hints address *procedure* only
("arming order was called before the gimbal was set"). This preserves the mechanic under every
hint condition.

---

## 8. TIMELINE AND PACING

| Clock | Expected state | Behind-pace intervention |
|---|---|---|
| 0:00 | Cinematic ends, clock starts | — |
| 0:12 | Out of the lounge (P3) | CASS offers tier-1 unprompted at 0:14 |
| 0:28 | Flight deck open, crew revealed (P7) | CASS escalates at 0:32 |
| 0:45 | Stations armed, team split (P12) | **Hard nudge at 0:47:** CASS reads the remaining procedure aloud as a checklist |
| 0:52 | First burn stage attempted | — |
| 0:60 | Window closes | Failure cinematic |

The hard nudge at 0:47 is the zero-host safety net. A team that has not split by then gets an
explicit, unmissable instruction to do so — because the ending is worth more than the difficulty.

---

## 9. RESILIENCE

| Event | Behavior |
|---|---|
| Player disconnects | Seat and avatar held 120 s. Any exclusive object lease they held releases after 20 s. Team timer does **not** pause. |
| Player reconnects | Reclaims same seat, avatar, role and zone; full canonical state rehydrated. |
| Operator disconnects mid-burn with no one to replace them | Their station **auto-safes**. The flight computer recalculates for the reduced station set at the next attempt. The room remains winnable at any point with as few as two live stations. |
| Fewer live players than live stations | Stations beyond the player count auto-safe and are removed from the solution. |
| Server process failure | Restore from the most recent checkpoint (every major transition + 30 s interval). Verified platform incident triggers automated pause and self-service credit — never a support ticket. |
| LLM / TTS unavailable | Hints degrade to prerecorded audio, then to on-screen text. Identical content. The run completes. |
| Prerecorded cinematic fails to load | Text-and-still fallback for every authored beat, including both endings. |

**The binding rule:** no combination of failures may leave a paying team unable to finish and
unable to get a defined automated outcome.

---

## 10. ACCESSIBILITY

- Every code, fault code and interlock is **alphanumeric**, never color-only. Color is redundant
  reinforcement, never sole carrier.
- The burnt-orange accent always pairs with a distinct shape and a text label.
- All CASS speech and all cinematic dialogue is subtitled; all audio cues have a visual twin.
- Analog dials show a numeric readout alongside the needle.
- Guided movement (click-to-navigate) reaches every interactable in the room; nothing requires
  FPS input. Validated by automated navmesh reachability test.
- The P1 paired-release, P7 crank and P14 ignition holds all work with one hand and one input.
- Reduced-motion setting removes the floating-object drift and the attitude-change camera roll.
- Text chat is a first-class fallback for every voice-dependent step, including the burn call —
  slower, but never impossible.

---

## 11. WHAT THE PLAYER TAKES AWAY

Debrief shows: outcome, time remaining or clock at failure, hints used per act, per-puzzle times
against the team-average band, the burn attempt log (every stage, every value, every miss), and a
team image generated from avatars.

The burn log is the shareable artifact. *"We missed the second stage by 1.1 seconds"* is a story
people retell — and it is the referral engine.

---

## 12. CONTENT MANIFEST

```
rooms/burn-window/
  content/
    manifest.json        identity, version, engine compatibility, player-count scaling
    zones.json           Z1–Z8, spawn points, navmesh + collision refs, traversal rules
    interactables.json   every object, client-safe presentation metadata only
    puzzles.server.json  SERVER ONLY — conditions, effects, solutions, validation tolerances
    graph.json           P1–P14 dependency graph, act boundaries, pacing thresholds
    hints.json           42 authored hints (14 puzzles × 3 tiers)
    narrative.json       CASS lines, cinematic triggers, both endings, subtitle tracks
    randomization.json   seeded generator rules + validation constraints
    scaling.json         3–8 player station/stage tables
  server/                burn validation, cross-feed sequencing, damage-survey generation
  client/                station panel UI, flight-deck displays, HUD countdown
  tests/                 solvability, seed validation, scaling, tolerance boundaries
```

`puzzles.server.json` is **never bundled into the browser payload.** Enforced by a build-time
check that fails the deploy if any server-only key appears in the client bundle.

---

## 13. BUILD STATUS

| Layer | Status |
|---|---|
| Design (this document) | Complete |
| Visual bible | Complete |
| Room package schema | Complete — see [ROOM_SCHEMA.md](./ROOM_SCHEMA.md) |
| Content JSON | Graybox: P13/P14 authored, P1–P12 stubbed |
| Colyseus room + burn validation | Phase 0 prototype implemented |
| Babylon graybox scene | Phase 0 prototype implemented |
| Commerce, accounts, booking, invitations | Implemented |
| LiveKit voice | PLANNED — needs LiveKit credentials |
| Environment art | PLANNED — visual bible gate passed, production not started |
| Cinematics and CASS VO | PLANNED |

Phase 0 is the master brief's acceptance scenario: three browsers, one session, separated
stations, asymmetric information, voice-coordinated synchronized burn, server-validated,
reconnect-safe. **That is the piece worth proving before any art is made**, and it is what the
prototype in this repository does.

---

## 14. DESIGN DECISIONS THAT EXTEND THE MASTER BRIEF

| # | Decision | Rationale |
|---|---|---|
| D-01 | Named the ship CSV Meridian, operator Anterra Orbital, AI operator CASS | Brief left naming open |
| D-02 | Cause of death: micrometeoroid breach of the flight deck environmental loop | Brief asked to preserve room for later story; this explains the deaths without explaining the trajectory deviation or the cargo module |
| D-03 | Three thruster stations rather than two, with the third live only at 5+ players | Gives 6-player sessions — the recommended count — a genuinely three-way split; keeps 3-player sessions viable |
| D-04 | Failed burn regenerates a **new** solution rather than repeating the old one | Prevents brute-forcing by retry; keeps every attempt a real communication task |
| D-05 | 900 ms ignition sync tolerance | Tight enough to require a real countdown, loose enough to survive typical browser and network jitter. To be tuned from beta telemetry. |
| D-06 | Hard pacing nudge at 0:47 | Zero-host guarantee: the room must not lose a team to a decision they didn't know to make |
| D-07 | The ration tin red herring | Teaches discarding information — a skill the Act IV information flood requires |
| D-08 | Act IV hints address procedure only, never values | Protects the core mechanic from being trivialized by the hint system |
