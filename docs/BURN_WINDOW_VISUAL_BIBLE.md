# BURN WINDOW — VISUAL BIBLE

Art-direction source of truth for the Burn Window environments. Every concept-image prompt,
Blender lighting setup and Babylon material/postprocess decision for the two hero locations
derives from this document.

**Status of references.** Analysis is evidence-based from the files actually present in
`reference-aesthetic/`:

| Expected group | File found | Status |
|---|---|---|
| `andor` | `andor.jpg` (967×405, 2.39:1 letterboxed still) | Present |
| `andor-colorpalette` | `andor-colorpalette.png` (1097×865 composite: still + 15-swatch strip + metadata block) | Present |
| `moonknight` | `moonknight.jpg` (967×405, 2.39:1 letterboxed still) | Present |
| `moonknight-colorpalette` | — | **MISSING.** No palette file supplied. The Moon Knight palette below is sampled directly from `moonknight.jpg` rather than from an authored swatch strip, and should be reconciled if the palette file is added later. |

Mapping is fixed and must not be reversed:

- **Andor references → SPACECRAFT COCKPIT / FLIGHT DECK**
- **Moon Knight references → CIVILIAN PASSENGER VIEWING ROOM**

All color values below were sampled programmatically from the supplied files (swatch-strip
pixel reads and posterized dominant-color histograms), not estimated by eye. Lens and camera
notes are labeled VISUAL ESTIMATE where the image cannot establish them as fact — the one
exception is the Andor palette file, which carries a printed production metadata block whose
values are recorded as SOURCE METADATA.

The purpose is extraction of a visual language, **not** recreation of copyrighted sets, props,
logos or production designs. Burn Window builds an original spacecraft that inherits selected
visual properties.

---

## PART 1 — COCKPIT / FLIGHT DECK (from Andor references)

### 1A. Sampled color palette

The supplied `andor-colorpalette.png` carries an authored 15-swatch strip. These are exact
pixel reads, ordered dark → light as presented:

| # | HEX | RGB | Role in the Burn Window cockpit |
|---|---|---|---|
| 1 | `#252b2a` | 37, 43, 42 | Deep shadow / black level. Slightly green-cyan, never neutral black. |
| 2 | `#263033` | 38, 48, 51 | Recessed structure, cable runs, unlit machinery interiors. |
| 3 | `#3e3028` | 62, 48, 40 | Warm dark — the only genuinely warm dark in the set. Leather, worn rubber, scorch. |
| 4 | `#745b4d` | 116, 91, 77 | Warm mid — restraint straps, grip surfaces, aged composite. |
| 5 | `#59696c` | 89, 105, 108 | Cool structural mid. Primary shadowed metal. |
| 6 | `#626c6b` | 98, 108, 107 | Neutral structural mid. |
| 7 | `#768484` | 118, 132, 132 | Base metal in indirect light. **Workhorse surface tone.** |
| 8 | `#738588` | 115, 133, 136 | Base metal, cooler variant. |
| 9 | `#979088` | 151, 144, 136 | Warm neutral — the palette's skin/separation tone. |
| 10 | `#92a4a7` | 146, 164, 167 | Lit panel face. |
| 11 | `#9faead` | 159, 174, 173 | Lit panel face, upper range. |
| 12 | `#b5c4c6` | 181, 196, 198 | Bright architecture. |
| 13 | `#b6c4c4` | 182, 196, 196 | Bright architecture. |
| 14 | `#c2ced0` | 194, 206, 208 | Near-highlight surfaces. |
| 15 | `#cad4d4` | 202, 212, 212 | Brightest diffuse surface. **Not white** — the frame has no true white. |

Dominant-color histogram of `andor.jpg` confirms the strip: `#a7b8b8` (20.3%), `#96a8a9`
(16.8%), `#87989a` (10.4%), `#778789` (5.3%), `#b6c5c5` (3.9%). Over half the frame sits in a
narrow desaturated blue-green band between L160 and L191.

**Accent.** Sampled warm pixels from the uniform stripes return `#743718` → `#814525` (peak /
top-decile average). This reads as a **burnt, desaturated orange, not a saturated safety
orange** — it is the only chromatic accent permitted to break the cyan-grey field. Burn Window
uses it for hazard striping, restraint hardware and manual-override controls.

**Luminance structure** (percentiles across the full frame):

| | p1 | p5 | p50 | p95 | p99 |
|---|---|---|---|---|---|
| Value | `#1d1e1d` (L30) | `#323737` (L54) | `#90a4a5` (L160) | `#b6c1bf` (L191) | `#c9d5d6` (L211) |

Read: **blacks are rich but not crushed** (p1 still at L30, retaining detail), the midpoint is
unusually high at L160, and highlights roll off early — p99 never reaches white. This is a
**high-key, low-contrast, compressed-highlight** image. Reproducing it means resisting the
instinct to add contrast.

**Color relationships.** Warm/cool balance is decisively cool: the neutral axis is biased
green-cyan (G and B consistently exceed R by 10–20 across the entire midtone range). Saturation
is very low — most pixels sit under 12% saturation. Shadows are cyan-biased; highlights are
cyan-biased; only the accent and swatch 3/4 carry warmth. Practical lights are barely brighter
than the environment they sit in, which is what produces the flat, institutional feel.

### 1B. Lighting / exposure DNA

The palette file's own metadata block records LIGHTING TYPE: *Artificial light, Practical
light, Fluorescent* and COLOR: *Cyan* — SOURCE METADATA, consistent with the pixel evidence.

- **Primary motivated sources:** overhead fluorescent-style linear fixtures, ceiling-recessed,
  arranged in a regular grid. Secondary illumination from large luminous ceiling panels.
- **Directionality:** overwhelmingly top-down, from many sources at once.
- **Character:** soft. Many broad sources at moderate distance produce near-shadowless fill.
  Contact shadows under equipment are present but weak and diffuse.
- **Key-to-fill:** very low ratio, approaching 1.5:1. There is no dramatic key.
- **Shadow density:** light. Shadows are a *tint* rather than an absence of light.
- **Highlight rolloff:** early and gentle. Specular hits on machinery compress rather than clip.
- **Blacks:** rich-but-detailed. Not lifted, not crushed.
- **Practical brightness relative to room:** low. Fixtures read only marginally brighter than
  the surfaces they light — a signature property. Do not blow out the emissives.
- **Back/rim light:** minimal. Figures separate from background by *value and warmth*
  (warm-neutral skin against cool-neutral architecture), not by rim light.
- **Reflections:** floor is semi-gloss and returns soft, wide, low-contrast reflections.
  Machinery is satin, not mirror.
- **Haze/volumetrics:** essentially none. Air is clean. Do not add god rays.

**Translation to Blender / Babylon.**

- Bake indirect lighting; the space is static and enclosed. Lightmaps carry nearly all of it.
- Model fixtures as large area emitters (long rectangles), emissive strength kept low —
  target roughly 1.5–2× the diffuse albedo of lit surfaces, not 10×.
- Set the environment/IBL tint cool (cyan-green bias); avoid a neutral grey HDRI.
- Roughness for architecture ~0.35–0.55 (satin); floor ~0.2–0.3 with high reflectance.
- Keep real-time shadow casters to a small budget — soft, low-density, short-range contact
  shadows only.
- Tonemap with a filmic curve, then **lift the black point slightly and pull the white point
  down** to reproduce the p1/p99 compression. Bloom minimal to absent.
- Post: very slight cyan lift in shadows, cyan bias in highlights, global desaturation pass.

### 1C. Camera and lens DNA

SOURCE METADATA from the palette file: ASPECT RATIO 2.39; FORMAT Digital, Large Format;
FRAME SIZE Wide; SHOT TYPE *Group shot, Low angle*; LENS SIZE Wide; COMPOSITION *Balanced,
Symmetrical*; CAMERA Sony VENICE; LENS *Panavision C series, Panavision Ultra Vista, Panavision
G series*; RESOLUTION 6K.

Everything below is VISUAL ESTIMATE unless marked otherwise:

- **Apparent lens category:** wide. Given large-format capture, a full-frame-equivalent range
  of roughly **21–28 mm** is consistent with the visible field of view and the mild edge
  stretching on figures at frame extremes.
- **Camera height:** slightly below standing eye level — a shallow low angle, confirmed by the
  metadata's *Low angle* tag. Ceiling is fully visible; the horizon line sits low in frame.
- **Camera-to-subject distance:** moderate. Foreground figures at roughly 2–3 m, with the room
  receding far behind them.
- **Perspective:** exaggerated depth. Converging floor tiles and ceiling ribs drive strong
  one-point recession.
- **Layering:** disciplined three-plane construction — foreground workers at frame edges,
  midground work benches, deep background wall and machinery.
- **Edge distortion:** mild; figures at the extreme edges show slight lateral stretch.
- **Depth of field:** deep. Foreground and far background both hold detail — the image is
  essentially in focus throughout. Aperture *character* is deep-focus; no f-stop is claimed.
- **Bokeh:** not evaluable from this frame.
- **Anamorphic cues:** the Ultra Vista entry in the metadata indicates anamorphic large-format
  glass (SOURCE METADATA); the still itself shows no strongly diagnostic oval bokeh or blue
  streak flare, so do not over-apply anamorphic artifacts.
- **Flare/halation:** none visible.
- **Symmetry:** strongly symmetrical and balanced, per metadata and visible construction. The
  room is composed around its own center axis.
- **Negative space:** the upper third is largely empty ceiling — deliberate breathing room
  above dense human activity.
- **Human scale:** architecture dominates. People are small within a large engineered volume;
  the ceiling is high and the room reads as institutional infrastructure, not a set built
  around a person.

No camera movement is inferred — a single still cannot establish it.

### 1D. Composition / production-design DNA

- **Architectural shapes:** rectilinear, panelized, faceted. Chamfered corner transitions
  instead of curves. Ceiling is a coffered grid of recessed rectangular bays.
- **Spatial density:** high object density at working height, empty above. Dense floor,
  clean air.
- **Repetition/modularity:** extreme. Identical workstations repeat across the floor;
  identical ceiling bays repeat overhead; identical wall panels repeat around the perimeter.
  Modularity is the dominant design statement.
- **Visible construction logic:** panel seams, visible fasteners, exposed suspension rods and
  cable runs from ceiling to equipment. Nothing hides how it was assembled.
- **Screen/control density:** low. Surprisingly few glowing displays — this is a *machinery*
  space, not a UI space. Resist the sci-fi instinct to cover the cockpit in screens.
- **Prop density:** high but organized. Tools and components are laid out in rows.
- **Material families:** white/pale-grey composite panel, brushed and painted metal, dark
  rubber/polymer, glass. Three families only.
- **Condition:** clean and maintained, with functional wear at contact points. Not grimy,
  not pristine.
- **Surface character:** satin. Almost nothing is glossy except the floor; almost nothing is
  fully matte.
- **Signage:** severely restrained. Minimal graphics, no decorative typography.
- **Negative space:** used as a compositional tool overhead and along the upper walls.

**Burn Window cockpit principles derived from this:**

1. Build the flight deck as a repeating modular panel system, not a bespoke sculpted set.
2. Keep displays sparse and physical controls plentiful — the manual-burn fiction depends on
   the ship reading as machinery a person operates by hand.
3. Light it flat and institutional. The horror is that the room looks *fine* while the crew is
   dead in it.
4. Reserve the burnt-orange accent exclusively for manual override, hazard and restraint
   hardware — so that when players finally need the manual thruster path, the color has
   already taught them where to look.
5. Let architecture dwarf the players. High ceiling, deep recession, low camera.

---

## PART 2 — CIVILIAN PASSENGER VIEWING ROOM (from Moon Knight references)

> No `moonknight-colorpalette` file was supplied. Palette below is sampled from `moonknight.jpg`.

### 2A. Sampled color palette

Dominant-color histogram of `moonknight.jpg`:

| # | HEX | RGB | Share | Role in the viewing room |
|---|---|---|---|---|
| 1 | `#768a9a` | 118, 138, 154 | 17.8% | **Dominant base.** Cool blue-grey. |
| 2 | `#7a93a7` | 122, 147, 167 | 12.1% | Secondary architectural tone. |
| 3 | `#657a89` | 101, 122, 137 | 8.0% | Shadowed wall/tile. |
| 4 | `#8395a8` | 131, 149, 168 | 7.8% | Lit wall plane. |
| 5 | `#6b8496` | 107, 132, 150 | 6.5% | Mid shadow. |
| 6 | `#788ea2` | 120, 142, 162 | 5.1% | Structural mid. |
| 7 | `#89aac6` | 137, 170, 198 | 3.7% | Cool light through glazing. |
| 8 | `#5b7487` | 91, 116, 135 | 3.3% | Deep shadow — note it is **not dark**. |
| 9 | `#87a3bb` | 135, 163, 187 | 3.3% | Bright cool plane. |
| 10 | `#849cb3` | 132, 156, 179 | 3.2% | Bright cool plane. |
| 11 | `#95bad7` | 149, 186, 215 | 3.1% | Brightest cool — window light. |
| 12 | `#556a79` | 85, 106, 121 | 2.2% | Darkest common tone. |

**Warm practical.** Sampled from the pendant lamp cluster: peak `#583016`, top-decile average
`#e6946d`. The lamps are a **soft amber-peach**, notably desaturated and low in intensity — a
warm island in an otherwise entirely cool room. There are only three of them, hung in a line.

**Luminance structure:**

| | p1 | p5 | p50 | p95 | p99 |
|---|---|---|---|---|---|
| Value | `#496371` (L94) | `#546c83` (L105) | `#7c8fa0` (L140) | `#ffc39f` (L205) | `#c8f3fa` (L234) |

Read this carefully — it is the defining property of the location. **p1 is L94.** There are
effectively *no dark pixels in the frame at all.* The darkest one percent of the image is still
a mid-tone. Blacks are radically **lifted**. Meanwhile p95 is a warm `#ffc39f` (the lamps) and
p99 is a cold `#c8f3fa` (the windows) — the two extremes of the image are opposite in
temperature while the entire body of it is a narrow cool band.

**Color relationships.** Overwhelmingly cool and blue-biased; blue exceeds red by 25–40 across
the midtones — a far stronger cast than the cockpit's subtle cyan. Saturation is low but higher
than the cockpit. Shadow hue is blue. Highlight hue splits: window highlights cold, practical
highlights warm. Contrast is extremely low — the entire frame spans roughly L94 to L234, under
60% of the available range.

### 2B. Lighting / exposure DNA

- **Primary motivated sources:** large windows/glazed panels along both side walls providing
  cold daylight, plus three warm pendant lamps down the center axis.
- **Directionality:** bilateral and lateral from the windows; the pendants add small pools of
  downward warm light that barely disturb the ambient.
- **Character:** extremely soft. Large glazed sources at close range give near-shadowless
  wraparound illumination.
- **Key-to-fill:** near 1:1. There is no key light in any conventional sense.
- **Shadow density:** almost none. Contact shadows beneath the figure are the only real ones,
  and they are faint.
- **Highlight rolloff:** the reflective floor produces the brightest values through specular
  return rather than through direct source exposure.
- **Blacks:** heavily **lifted** — the single most important reproduction note for this room.
- **Practical brightness relative to room:** the pendants are *warmer* than the room but barely
  brighter. They read as warmth, not as illumination.
- **Back/rim:** the figure is separated by silhouette value against a bright background —
  effectively backlit by the far window.
- **Reflections:** the polished tile floor is highly reflective and returns a full soft mirror
  of the corridor, doubling the apparent light and the apparent depth.
- **Haze:** slight atmospheric softening in the deep background; the far end of the corridor
  loses contrast with distance. This is genuine and should be reproduced.

**Translation to Blender / Babylon.**

- Large area lights behind glazing on both side walls, cool (roughly 7000–9000 K in feel).
- Three small warm emissive pendant volumes on the center axis, low intensity, warm
  (roughly 2700–3000 K in feel). They exist for color contrast, not illumination.
- Floor material: low roughness (~0.1–0.2), high reflectance, with a screen-space or probe
  reflection budget allocated to it. **The floor reflection is a hero feature of this room** —
  budget for it rather than cutting it as an optimization.
- Bake indirect; the room is static.
- Tonemap and then **raise the black point substantially.** Add a mild atmospheric depth fade.
- Post: blue lift across shadows and midtones, protect the warm practicals from the cast,
  low global contrast, restrained bloom around the pendants and window edges only.

### 2C. Camera and lens DNA

No metadata block was supplied for this reference. All VISUAL ESTIMATE:

- **Apparent lens category:** wide, but less extreme than the cockpit. Full-frame-equivalent
  roughly **28–35 mm**, consistent with the modest edge behavior and the corridor's rate of
  convergence.
- **Camera height:** approximately standing eye level, level with the horizon. Neutral, not
  low-angle.
- **Angle:** dead-on horizontal. The camera is centered in the corridor and aimed straight
  down its axis.
- **Camera-to-subject distance:** far. The figure is small in frame and deep in the space.
- **Perspective:** strong one-point recession driven by the corridor, but with less foreground
  exaggeration than the cockpit frame.
- **Layering:** deep sequential layering — repeating door bays step back on both sides in a
  regular rhythm, creating frames within frames.
- **Edge distortion:** minimal.
- **Depth of field:** deep. Near doors and the far end both hold. Deep-focus character.
- **Bokeh:** not evaluable.
- **Anamorphic cues:** none reliably visible; the 2.39 ratio is present but is achieved by
  letterboxing in the supplied file.
- **Flare/halation:** mild halation around the pendant lamps and the brightest window edges.
- **Symmetry:** **rigorous, near-perfect bilateral symmetry** about the vertical center axis —
  the strongest formal property of the image, even more pronounced than in the cockpit.
- **Negative space:** substantial empty floor in the foreground; the lone figure is
  deliberately isolated in a large volume.
- **Human scale:** a single small human in a long, tall, repeating institutional corridor.
  The architecture is calm, clean and indifferent.

### 2D. Composition / production-design DNA

- **Architectural shapes:** orthogonal, corridor-driven. Tall rectangular door bays repeating
  at a fixed rhythm. Coffered ceiling.
- **Spatial density:** low. This is a space defined by emptiness and repetition.
- **Repetition/modularity:** extreme, and rhythmic — the repeat interval itself is the design.
- **Visible construction logic:** small square tile grid on walls and floor, exposed door
  hardware. Construction is legible but understated.
- **Window placement:** high slot windows in the doors and large glazed panels between bays,
  admitting cold light at regular intervals.
- **Depth corridors:** the entire composition is a depth corridor with frames within frames.
- **Screen/control density:** essentially zero. This is a civilian space with no visible
  technology.
- **Prop density:** minimal, near-empty.
- **Material families:** glossy ceramic tile, painted plaster/panel, glass, pale metal
  hardware. Clean and clinical.
- **Condition:** immaculate. Institutional cleanliness.
- **Surface character:** the tile is genuinely glossy — the strongest specular contrast with
  the cockpit's satin machinery.
- **Signage:** none visible. Wayfinding is architectural.

**Burn Window viewing room principles derived from this:**

1. Design the passenger room around **rhythm and symmetry** — repeating bays of viewing
   alcoves and seating along a central axis, with the Earth-facing window at the far end as
   the vanishing point.
2. Keep it **clinically clean and empty.** Its unease comes from being too tidy and too calm,
   not from clutter or damage.
3. Use a **glossy reflective floor** and budget the reflection. It doubles the room and is the
   location's signature.
4. Light it cold from the windows with a **small number of warm practicals** as the only
   warmth in the space. Three, not thirty.
5. **Lift the blacks.** Nothing in this room hides in shadow — which is exactly why players
   will feel exposed when the emergency state arrives.

---

## PART 3 — SHARED SPACECRAFT DESIGN LANGUAGE

The two references were chosen to give the locations different personalities, but both are
compartments of one vehicle. These elements bridge them:

| Element | Specification |
|---|---|
| Base structural material | Pale composite panel, satin finish, in the `#768484` – `#92a4a7` band. Reads warm-neutral in the cockpit and cool in the passenger room because of the different lighting, while remaining the same physical material. |
| Panel module | A single repeating rectangular panel unit with chamfered edges and a visible seam gap, used at different scales in both rooms. |
| Fastener language | Recessed hex fasteners at panel corners, unpainted, consistent throughout the ship. |
| Door construction | Same frame section in both rooms: a deep rectangular reveal with a high slot window and exterior-mounted hardware. Civilian doors are finished and glossy; crew doors expose their mechanism. |
| Window material | Identical multi-layer glazing with a visible edge seal and a thin retaining frame — the passenger room has one enormous panel of it, the cockpit has several small ones. |
| Emergency lighting | Burnt orange `#814525` — derived from the cockpit accent, never a saturated red. Present in both rooms as inert hardware in the normal state, energized in the emergency state. |
| Iconography | An original glyph set for Burn Window ship systems: thruster, pressure, restraint, manual override, hatch. Drawn with the restraint of both references — minimal, unstyled, functional. |
| Typography | One condensed grotesque, used at small size only, in a single weight. Labels, never signage. |

The transition rule: moving from the passenger room to the cockpit should feel like moving from
the *finished* side of the ship to the *unfinished* side. Same panels, same fasteners, same
glazing — but the cockpit exposes the mechanism the passenger room conceals.

---

## PART 4 — STORY-STATE VISUAL VARIANTS

### Cockpit

**Normal / pre-incident.** Flat institutional fluorescent grid, everything energized and calm,
burnt-orange accents present but inert. Reads as a working, maintained flight deck.

**Emergency / Burn Window state.** Derived from the same palette rather than replaced by generic
red sci-fi lighting:

- A portion of the overhead fluorescent grid is dark, creating uneven pools where the reference
  had uniform fill. The lighting *pattern* breaks; the lighting *color* does not.
- The burnt-orange accent hardware energizes — hazard striping and manual-override controls
  become emissive at low intensity.
- The cool cyan bias deepens as fewer warm-neutral surfaces are lit.
- Blacks fall from the reference's L30 p1 toward true black in the unlit bays. **The cockpit is
  the room where darkness arrives.**
- Crew bodies float in deterministic, controlled animation. They are lit by the same flat
  remaining fluorescents — no dramatic horror key light. The flatness is the horror.
- Fine particulate drifts in the unlit volumes; no heavy smoke.

### Passenger viewing room

**Normal / pre-incident (lobby state).** Exactly the reference condition: cold window light,
three warm pendants, mirror floor, lifted blacks, immaculate. This is where players gather,
practice movement and see each other before the incident.

**Emergency / Burn Window state.**

- Window light shifts as the ship's attitude changes — the cold key swings across the room and
  Earth leaves the frame. The room's own lighting barely changes; the *sun* moves. This is the
  most efficient way to communicate that the ship is drifting.
- The three warm pendants gutter and drop to emergency power, becoming the room's dominant
  source as the window light swings away.
- Lifted blacks fall only partially — this room never becomes as dark as the cockpit, which
  preserves its character and keeps the two locations distinct under pressure.
- The glossy floor holds its reflection throughout and now reflects moving light, making the
  drift legible from any position in the room.
- Loose civilian objects lift off surfaces and drift, establishing microgravity while players
  themselves remain floor-attached by emergency magnetic footwear.

---

## PART 5 — REUSABLE PROMPT BLOCKS

Constructed in the required order: location/function → architecture → palette → lighting →
materials → camera → focal length → depth of field → atmosphere → quality target → negatives.

### COCKPIT VISUAL DNA

> Original spacecraft flight deck of a civilian passenger orbital vehicle, designed as a
> repeating modular panel system rather than a bespoke sculpted set. Rectilinear chamfered
> architecture; coffered ceiling of recessed rectangular bays on a regular grid; panelized
> walls with visible seams and recessed hex fasteners; exposed suspension rods and cable runs;
> plentiful physical hand controls and deliberately few glowing displays; high ceiling and deep
> recession so the machinery dwarfs the crew.
> Palette: desaturated cyan-grey field — base metal `#768484` and `#738588`, lit panel faces
> `#92a4a7` and `#9faead`, bright architecture `#b5c4c6` and `#c2ced0`, brightest diffuse
> `#cad4d4` with no true white anywhere; cool structural shadow `#59696c`; deep shadow
> `#252b2a` and `#263033`, green-cyan biased, never neutral black; warm darks `#3e3028` and
> `#745b4d` on grip and contact surfaces; warm neutral `#979088` for skin separation; single
> chromatic accent burnt desaturated orange `#814525` restricted to hazard striping, restraint
> hardware and manual-override controls.
> Lighting: overhead linear fluorescent fixtures in a regular grid plus large luminous ceiling
> panels; top-down from many broad soft sources at once; near-shadowless fill; key-to-fill
> approaching 1.5:1; practical fixtures only marginally brighter than the surfaces they light;
> weak diffuse contact shadows; no rim light, subjects separated by value and warmth; no haze,
> no god rays; rich-but-detailed blacks and early gentle highlight rolloff with nothing
> clipping to white; high-key, low-contrast, compressed at both ends.
> Materials: pale composite panel, brushed and painted metal, dark rubber-polymer, glass —
> three families only; satin surfaces throughout at roughness 0.35–0.55; semi-gloss floor at
> 0.2–0.3 returning soft wide low-contrast reflections; clean and maintained with functional
> wear only at contact points.
> Camera: wide, slightly below standing eye level, shallow low angle with the full ceiling
> visible and a low horizon; centered on the room's axis; rigorously symmetrical and balanced;
> three-plane depth layering with foreground figures at the frame edges; substantial empty
> negative space across the upper third.
> Focal length: full-frame equivalent 21–28 mm, large-format character, mild edge stretch at
> the extremes.
> Depth of field: deep focus, foreground and far background both resolved.
> Atmosphere: clean air, no volumetrics, minimal to no bloom, filmic tonemap with a slightly
> lifted black point and a lowered white point, subtle cyan bias in both shadows and highlights,
> global desaturation.
> Quality: photorealistic feature-film production design, 2.39:1, physically based materials,
> baked global illumination.
> Negative: no saturated primary colors, no neon, no holograms, no wall-to-wall display screens,
> no dramatic key light, no hard shadows, no lens flares, no god rays, no smoke or heavy
> atmosphere, no grime or rust, no true black, no blown white, no warm overall grade, no
> decorative signage or ornamental typography, no curved organic sci-fi shapes.

### PASSENGER VIEWING ROOM VISUAL DNA

> Original civilian passenger viewing lounge aboard an orbital tourism spacecraft, composed as
> a long rigorously symmetrical hall with repeating bays of viewing alcoves and seating along a
> central axis, terminating in an enormous Earth-facing window at the vanishing point;
> orthogonal architecture, tall rectangular bays repeating at a fixed rhythm, coffered ceiling,
> small square tile grid on floor and walls, understated exposed hardware, near-empty and
> immaculate.
> Palette: cool blue-grey field — dominant base `#768a9a`, secondary `#7a93a7`, lit planes
> `#8395a8` and `#849cb3`, bright cool planes `#87a3bb` and `#89aac6`, brightest window light
> `#95bad7`; shadowed tile `#657a89` and `#6b8496`; deepest tones `#5b7487` and `#556a79` which
> remain clearly mid-tone rather than dark; the only warmth in the room is a soft desaturated
> amber-peach `#e6946d` from three pendant lamps on the center axis.
> Lighting: large glazed panels along both side walls admitting cold daylight, plus exactly
> three warm low-intensity pendant lamps in a line; bilateral lateral key with near 1:1
> key-to-fill; extremely soft near-shadowless wraparound illumination; only faint contact
> shadows; practicals warmer than the room but barely brighter, present for color contrast
> rather than illumination; subject separated by silhouette against a bright far window; blacks
> radically lifted so that nothing in the frame is dark; extremely low overall contrast; mild
> halation around the lamps and window edges; slight atmospheric contrast loss at the far end
> of the hall.
> Materials: glossy ceramic tile, painted panel, glass, pale metal hardware; floor roughness
> 0.1–0.2 and highly reflective, returning a full soft mirror of the room and doubling its
> apparent depth; clinical, immaculate, unworn.
> Camera: wide, standing eye level, perfectly horizontal and dead-on, centered on the hall's
> axis; near-perfect bilateral symmetry; deep sequential layering of repeating bays creating
> frames within frames; substantial empty foreground floor; a lone small human isolated in a
> large calm volume.
> Focal length: full-frame equivalent 28–35 mm, minimal edge distortion.
> Depth of field: deep focus throughout.
> Atmosphere: subtle depth haze at distance only, restrained bloom confined to the practicals
> and window edges, filmic tonemap with a substantially raised black point, blue lift through
> shadows and midtones with the warm practicals protected from the cast.
> Quality: photorealistic feature-film production design, 2.39:1, physically based materials,
> baked global illumination, hero-quality floor reflection.
> Negative: no dark shadows, no crushed blacks, no high contrast, no dramatic or directional
> key light, no warm overall grade, no clutter or set dressing, no visible technology or
> screens, no signage, no grime or wear, no saturated color, no neon, no volumetric god rays,
> no curved organic sci-fi shapes, no asymmetry.

---

## PART 6 — VISUAL DEVELOPMENT GATE

This document satisfies the gate defined in the master brief §10. Bulk concept-image prompting
and final environment art for the cockpit and passenger viewing room may proceed, using the
Part 5 blocks as the prompt source.

Two standing constraints on all downstream work:

1. **Never reduce a prompt to a reference title.** The whole purpose of this analysis was to
   convert the supplied images into independent, descriptive, technically actionable attributes.
   Prompts cite palette values, lighting behavior and lens characteristics — never a franchise
   name.
2. **If `moonknight-colorpalette` is supplied later,** re-sample it and reconcile Part 2A
   against it. The current passenger-room palette is derived from the still alone.
