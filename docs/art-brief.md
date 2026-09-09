# Late Edition — Art Brief & Sprite Specification

The complete asset spec for the pixel-art newsroom: every sprite, every frame, what
each frame does, plus backgrounds and foregrounds per room. Written so an artist can
pick it up cold and an engineer can wire it without guessing.

- **Live motion reference:** `docs/prototype/newsroom-screen-test.html` (open in a
  browser). It's a simplified single-desk bust drawn procedurally — use it for *timing
  and feel*, not final proportions. This document is the source of truth for scope.
- **Style target:** late-80s/90s LucasArts point-and-click (the *feel* of Thimbleweed
  Park / Full Throttle) — original art only, no copied characters, rooms, logos or fonts.
- **Vibe:** 1930s–40s noir newsroom. Amber lamplight, deep blue-black shadow, one hot
  red accent reserved for **STOP THE PRESS**.

---

## 1. Technical foundation

| Spec | Value |
|---|---|
| Room base resolution | **640 × 360** (16:9), integer-scaled to the window |
| Scaling | Nearest-neighbour only. **No anti-aliasing, no smoothing.** |
| Character cell | **64 × 64 px** (holds a 48–56 px figure + headroom for hat/emotes) |
| Seated "bust" cell | **64 × 64 px**, cropped by the desk line (see §4) |
| Prop cells | Sized per prop, power-of-two-friendly, listed in §7 |
| Colour depth | Indexed, **32-colour master palette** (§2). Dither for gradients. |
| Animation frame rate | Authored at **10 fps default** (100 ms/frame); per-anim overrides in §5–§6 |
| Sub-pixel motion | None. All motion snaps to whole pixels. |
| Transparency | Palette index 0 = transparent (author on a checker/alpha layer) |

### Pivots / anchors (critical — engine aligns to these)
- **Standing figures:** pivot = **bottom-centre** of the 64×64 cell (x=32, y=63), on the
  character's feet contact point.
- **Seated bust:** pivot = **desk line**, defined at **y = 52** within the 64×64 cell
  (the figure sits behind a desk whose top edge is drawn at this line). Everything below
  y=52 is occluded by desk furniture and need not be finished.
- **Props:** pivot = bottom-centre unless noted.
- Author every animation of a given rig on the **same pivot** so frames don't jitter.

### Facing & mirroring
- Author **one direction**; the engine mirrors horizontally for the opposite.
- **Author LEFT-facing** for walk/run. 3/4-front for desk/idle. Optional back (up) walk
  for the Street only.
- Because faces are asymmetric (cigarette side, hair part), keep the design **mirror-safe**
  (no text, no single-side insignia that must stay put) OR flag any sprite that must not be
  mirrored (a `noflip` tag).

---

## 2. Master palette (32 colours)

Two groups: **world colours** (shared, never swapped) and **swap-ramp slots** (re-tinted
per staffer — this is what makes a new hire cheap: same sheet, new 11-colour map).

### World colours (21) — fixed
| # | Name | Hex | Used for |
|--|--|--|--|
| 00 | transparent | — | alpha |
| 01 | INK | `#0d0b0a` | deepest shadow, outlines |
| 02 | NIGHT | `#141d29` | upper wall / night |
| 03 | WALL | `#182231` | back walls |
| 04 | WALL-SH | `#0f1620` | wall shadow, window frame |
| 05 | WOOD-DK | `#2c2013` | desk front, dark timber |
| 06 | WOOD | `#3b2a1a` | desk top, floorboard |
| 07 | WOOD-LT | `#5a4028` | timber highlight |
| 08 | METAL-DK | `#22262b` | typewriter/phone shadow |
| 09 | METAL | `#3d4247` | machined metal |
| 10 | METAL-LT | `#6b7076` | metal highlight |
| 11 | BONE | `#e8e2d0` | paper, shirt-white, print |
| 12 | BONE-SH | `#bdb79f` | paper shadow |
| 13 | BONE-DK | `#a49c86` | dim paper / dust |
| 14 | AMBER | `#e8b04b` | lamplight, warm accent, UI highlight |
| 15 | AMBER-DK | `#a97b2f` | amber shadow / glow edge |
| 16 | EMBER | `#ff7a2a` | cigarette ember, ding spark |
| 17 | RED | `#c2412d` | **STOP THE PRESS only** — the one hot accent |
| 18 | RED-DK | `#7a1a10` | red shadow, banner |
| 19 | GREEN-SHADE | `#2f6a4a` | banker's-lamp shade |
| 20 | SMOKE | `#9aa3a8` | cigarette smoke |
| 21 | STEAM | `#cdd6da` | coffee steam |

### Swap-ramp slots (11) — re-tinted per character
Authored once with the *default (Sam Vance)* values below; each staffer supplies an
override map. Keep these on a **contiguous palette block** so a remap is a single operation.

| Slot | Name | Default hex | Notes |
|--|--|--|--|
| S0 | SKIN-LT | `#eec79a` | forehead / nose highlight |
| S1 | SKIN | `#d3a06f` | face, hands |
| S2 | SKIN-SH | `#a97b4e` | jaw / cheek shadow |
| S3 | HAIR | `#241812` | hair, brows |
| S4 | HAIR-SH | `#160f0a` | hair shadow |
| S5 | HAT | `#4a3826` | fedora / cap body |
| S6 | HAT-BAND | `#2a1f14` | hatband / brim underside |
| S7 | SUIT | `#3d4954` | jacket main |
| S8 | SUIT-DK | `#2b333c` | jacket shadow, lapels, sleeves |
| S9 | SHIRT | `#dcd6c6` | shirt / blouse |
| S10 | ACCENT | `#7a2d1d` | tie / scarf / trim (a character's signature colour) |

> **Engine note:** ship the base sheet once; pre-bake each staffer's sheet at build time by
> remapping S0–S10, **or** tint at runtime with a palette-swap shader. Either way the artist
> only draws the base once plus supplies palettes.

---

## 3. The staff of six (palette maps + prop kit)

Six shippable characters. Each = a palette override + a hat type + a "signature prop" +
which animation sets they need. Names are defaults; the app lets the user rename any of
them (nameplate + byline update live). Original characters — avoid resembling real people.

| ID | Name (default) | Role / desk | Hat | Signature prop | Palette accent (S10) | Animation sets |
|--|--|--|--|--|--|--|
| `sam` | Sam Vance | Hardboiled reporter — The Wire / Codebase | fedora | cigarette | `#7a2d1d` rust tie | Desk + Standing + Walk |
| `dot` | Dot Kowalski | Managing editor — the Call | none (pinned hair) | coffee + red pencil | `#c9a24b` gold | Desk + Standing + Walk + Pencil |
| `gus` | Gus Moreno | Copy boy — runs the wire | newsboy cap | rolled newspaper | `#8a6a2a` ochre | Desk + Standing + Walk + **Run-with-paper** |
| `vi`  | Vivian Cross | Competition beat | small tilt hat | notepad | `#3f6f6a` teal | Desk + Standing + Walk |
| `mac` | "Mac" McHale | Copy desk — fact-check | eyeshade visor | red pencil + loupe | `#5a6b7a` slate | Desk + Pencil |
| `rus` | Russ Deakin | Pressman — the Press Room | flat cap + apron | ink rag | `#6b4a2a` brown | Standing + Walk + Press-operate |

Suggested palette overrides (S1 SKIN / S3 HAIR / S5 HAT / S7 SUIT / S9 SHIRT):

- **sam** — skin `#d3a06f`, hair `#241812`, hat `#4a3826`, suit `#3d4954`, shirt `#dcd6c6`
- **dot** — skin `#e0b184`, hair `#3a1d12`, hat `#6a2740`(pin), suit `#5a2338`, shirt `#e6dccb`
- **gus** — skin `#c88a56`, hair `#1c130c`, cap `#3a5060`, suit `#495a3a`, shirt `#d8cbb0`
- **vi**  — skin `#c98a63`, hair `#5a3a1a`, hat `#39424f`, suit `#40353f`, shirt `#e2d8c4`
- **mac** — skin `#d8ab7a`, hair `#8a8a80`(grey), visor `#2f6a4a`, suit `#4a4f56`, shirt `#e2dcca`
- **rus** — skin `#b97e4e`, hair `#241812`, cap `#33413a`, apron `#5a4a38`, shirt `#c9bfa6`

Provide each as a `.gpl` palette in `assets/palettes/<id>.gpl`.

---

## 4. Character rig — layer decomposition

Draw each character as **stacked layers** (Aseprite layers), not a flat sprite. This keeps
palette-swap clean, lets hats/props vary, and lets the mouth flap composite over any pose.

Layer order (back → front):
1. `swap:hair-back` — hair behind head
2. `body` — torso/suit (uses S7/S8) + neck
3. `arms` — animated per pose (S7/S8 sleeves, S1 hands)
4. `head` — face base (S0/S1/S2)
5. `face` — eyes + brow + nose + **mouth** (mouth on its own sub-layer for the talk cycle)
6. `swap:hair-front` — fringe / hairline
7. `hat` — fedora/cap/visor/pinned (S5/S6)
8. `prop` — cigarette / coffee / pencil / receiver (front-most)

### Proportions — chunky & iconic (art direction, locked)
Deliberately **stocky, not lanky**. Big head, wide torso, short stubby limbs — closer to a
1.7-head-tall silhouette than realistic. Less pixel density reads better here: keep limbs
simple (2–4 px thick blocks), avoid long thin arms/legs. The character should read at a
glance as a shape, not a stick figure. (See the revised prototype for the target feel.)

### Canonical measurements (within the 64×64 cell)
- **Standing:** total height ≈ **40–46 px** (chunky). **Head ≈ 14 px** (≈⅓ of the body —
  intentionally large), torso wide (~20 px), legs short (~12 px). Pivot at bottom-centre.
- **Seated bust:** big head + wide chunky torso above the desk line (**y=52**); lower body
  hidden. Shoulders ~24 px wide.
- **Seated arms are STUBS, not limbs.** At this chunky scale, draw a small 3–4 px sleeve
  block with a 3 px hand poking out near the desk — do **not** draw a full shoulder→hand
  arm (it reads gangly). Desk props are centred in front of the sitter so the hands land on
  them with almost no reach. Standing arms are likewise short blocks at the sides.
- **Side-profile walk** is a distinct pose (not the front sprite slid sideways): narrower
  side torso, a nose nub + eye on the facing side, one visible swinging arm, a stride step.

---

## 5. Animation catalogue — DESK (seated bust)

All seated anims share the bust rig, 64×64, desk-line pivot. "Loop" = ping-pong or
forward-loop as noted. Frame descriptions are per-frame; **F1 is the rest pose**.

### 5.1 `idle_breathe` — 4 frames · 6 fps · loop
The resting state. Subtle life only.
- **F1** rest. **F2** torso + shoulders up **1 px** (inhale). **F3** rest. **F4** down 1 px
  (exhale). Head follows torso by 1px on F2/F4.
- Never move more than 1 px — noir stillness.

### 5.2 `blink` — 2 frames · overlay · random every 3–6 s
Head-overlay on the `face` layer. **F1** eyes open (2 dark px). **F2** eyes closed (1 px
skin-shadow line). Fire randomly on top of any idle/talk pose.

### 5.3 `smoke` — cigarette + smoke (see §8 particles)
Not a full-body anim; two pieces:
- **cig accessory** (prop layer): cigarette 6×1 px in mouth corner, **ember** 1 px in EMBER
  with a 2-frame flicker (EMBER / AMBER-DK), 4 fps.
- **smoke**: engine particle system (spec in §8). If you prefer **baked** smoke, deliver a
  `fx_smoke_curl` loop: 6 frames, 8 fps, a single wisp rising 12 px and fading — but
  particles are preferred for variety.

### 5.4 `talk` — mouth flap · 3 frames · 8 fps · loop while a speech bubble is up
Mouth-only overlay (composites over any idle pose): **F1** closed, **F2** open (2×2),
**F3** mid (2×1). Engine runs it only while banter is displayed.

### 5.5 `type` — 6 frames · 10 fps · loop
The typewriter hammer. Arms + hands + a hint of carriage motion.
- **F1** both hands up. **F2** LEFT hand strikes down 1px; carriage at rest.
- **F3** hands up; **ding spark** (1 px EMBER) at the strike point; paper nudges up 1px.
- **F4** RIGHT hand strikes down 1px. **F5** hands up; carriage shifted **left 2px**.
- **F6** carriage snaps back to rest (return); paper settles.
- Shoulders bob 1px with the rhythm. Cigarette keeps smoking throughout.

### 5.6 `coffee_sip` — 10 frames · 8 fps · play-once → return to idle
Reach, lift, sip, lower. Mug travels with the hand (draw the mug on the `prop` layer here,
not the static desk mug).
- **F1–2** hand reaches right-to-mug (mug on desk). **F3–4** lift mug up ~24px toward face.
- **F5–7** hold at lips (sip); **steam** intensifies (particles). Eyes half-close on F6.
- **F8–9** lower mug back to desk. **F10** hand returns, settle. Steam eases off.

### 5.7 `phone` — reaction (loop) then answer (once)
Two tags:
- `phone_react` — 3 frames · 6 fps · loop while ringing. Head turns toward phone, a small
  brow raise. Phone shakes separately (§7). Ring arcs are an FX (§8).
- `phone_answer` — 6 frames · 8 fps · once. **F1–2** hand reaches cradle. **F3** lifts
  receiver. **F4** receiver rises to ear. **F5–6** receiver at ear, settle → then `talk`
  can overlay for conversation.

### 5.8 `thinking` — 4 frames · 6 fps · loop
Editor/reporter weighing it. **F1** hand rises toward chin. **F2** hand at chin.
**F3** a "?" (BONE) pops 4px above the hat, bobbing. **F4** "?" settles / small head tilt.

### 5.9 `write_pencil` — 4 frames · 8 fps · loop  (editor + copy desk)
Red-pencil edits. **F1–4** hand scrubs a short left-right stroke over a sheet; a RED tick
mark appears on F3. Little shoulder lean-in.

### 5.10 `react_shock` — 3 frames · 10 fps · once  (drives Stop the Press cut-in)
**F1** bolt upright (whole bust +2px, hat lifts 1px). **F2** wide eyes (whites = BONE, 2px),
mouth open. **F3** hold. Cigarette may drop an ash (1 EMBER px falls).

### 5.11 `filed` / `hand_off` — 3 frames · 8 fps · once (optional)
Slides a finished sheet forward onto the desk (used when a reporter files copy). **F1** paper
in hand, **F2** push forward, **F3** release, hand back.

**Desk-anim frame budget per character:** breathe 4 · blink 2 · talk 3 · type 6 ·
coffee 10 · phone_react 3 · phone_answer 6 · thinking 4 · pencil 4 · shock 3 · filed 3 ≈
**48 frames** (not every character needs every set — see §3).

---

## 6. Animation catalogue — STANDING / STREET (full body)

Full-body, 64×64, feet pivot. Author **LEFT-facing**; mirror for right.

### 6.1 `stand_idle` — 4 frames · 6 fps · loop
Weight shift + breathe. **F1** rest. **F2** up 1px. **F3** rest. **F4** slight weight to
back foot. Coat/hem sways 1px.

### 6.2 `walk` — 8 frames · 10 fps · loop  (LEFT; mirror for right)
Classic 8-frame cycle: contact, down, pass, up × 2 legs. Arms counter-swing. Coat hem
trails 1px on the up-frames. Keep the **head level** (no vertical bounce > 2px).
- Optional `walk_up` / `walk_down` (6 frames each) for the Street only, if you want
  reporters to leave "into" the scene.

### 6.3 `run_with_paper` — 6 frames · 12 fps · loop  (Gus the copy boy)
Faster, leaning forward, a newspaper clutched in one hand (prop layer). Bigger stride,
coat flapping, one "speed line" FX px trailing (§8).

### 6.4 `enter` / `exit` — reuse `walk` + a door (room FG). No separate frames needed.

### 6.5 `tip_hat` — 4 frames · 8 fps · once  (optional flavour / greeting)
Hand to brim, lift 2px, replace. Skips for hatless characters.

### 6.6 `sit_down` / `stand_up` — 5 frames each · 8 fps · once (optional)
Transition between standing plane and the desk bust. If omitted, the engine hard-cuts
(acceptable for v1).

**Standing frame budget per character:** stand 4 · walk 8 (+ up/down 12 opt) · run 6 ·
tip_hat 4 ≈ **22–34 frames**.

---

## 7. Props & set-dressing sprites

Each prop is its own sheet. "frames" lists animation states.

| Sprite | Cell (px) | Frames | What each frame does |
|--|--|--|--|
| `prop_typewriter` | 44 × 24 | 1 base + 2 typebar-strike + 3 paper-Y | base; typebar down L/R; paper at rest/+1/+2 (composited during `type`) |
| `prop_mug` | 12 × 10 | 1 | coffee mug (steam is FX). Held version lives in `coffee_sip` |
| `prop_phone` | 16 × 22 | 1 base + 2 shake + 1 off-hook | candlestick phone; shake left/right (ring); cradle empty when receiver lifted |
| `prop_receiver` | 6 × 14 | 1 | ear-piece + cord, drawn during `phone_answer` |
| `prop_cigarette` | 8 × 3 | 2 | ember flicker (EMBER / AMBER-DK) |
| `prop_papers_stack` | 24 × 8 | 3 | uneven stack; 3 subtle height states |
| `prop_newspaper` | 16 × 12 | rolled 1 + open 1 | rolled (run) + open (reading). Front page blank — engine overlays rendered text |
| `prop_lever` | 8 × 18 | 3 | STOP lever: up / mid / slammed-down (RED) |
| `prop_lamp_banker` | 24 × 18 | 1 | green shade + stem; amber glow is FX/shader |
| `prop_clock` | 20 × 20 | face 1 | hands drawn by engine rotation (don't hand-draw 12) |
| `prop_ticker` | 64 × 8 tile | 1 tileable | wire ticker strip; text scrolls via bitmap font |
| `prop_nameplate` | 64 × 10 | 1 | engraved plate; byline text via bitmap font |
| `prop_door_plain` | 22 × 42 | closed 1 (+2 open opt) | actors walk through to leave/return (fade at the threshold) |
| `prop_door_office` | 22 × 44 | frame 1 | the Chief's door (plain, "CHIEF" plate). Reporters walk through it to see the boss |
| `prop_office_window` | ~46 × 38 | silhouette loop | **an interior window in the wall next to the Chief's door**: backlit amber frosted glass with **two black silhouettes facing off** — arms waving, a jabbing finger, tempers rising (~6–8-frame loop). Ambient; the boss is always chewing someone out. NOT full-colour characters, NOT a close-up cutaway |
| `prop_cabinet` | 40 × 56 | closed 1 + open 2 | filing cabinet (Morgue); drawer sliding out |
| `prop_coatrack` | 20 × 60 | 1 | flavour |
| `prop_tube_capsule` | 8 × 12 | 2 | pneumatic-tube capsule zip (flavour) |
| `prop_press` | 200 × 90 | run 4 + stop 1 + eject 4 | rollers spin (loop); freeze on stop; paper ejects/stacks |
| `prop_desklamp_glow` | — | — | prefer engine radial gradient (see §8), not a sprite |
| `prop_window_blinds` | 60 × 60 | 1 (+2 opt sway) | venetian slats; amber light between (part of room BG) |

---

## 8. Effects & particles

Prefer **engine particles/overlays** over baked frames where noted (cheaper, livelier).

| FX | Type | Spec |
|--|--|--|
| Cigarette smoke | particle | spawn at ember; 2×2 → 1×1 SMOKE puff; rise ~14px, drift ±0.4px sin, fade over ~2s |
| Coffee steam | particle | as smoke but STEAM colour, shorter life, spawn at mug rim |
| Ring arcs | 2-frame FX sprite | `)))` in AMBER either side of the phone; blink on ~0.8s while ringing |
| Ding spark | 1 px flash | EMBER px at typebar strike, 1 frame |
| Speed lines | particle | 1–2 px BONE-DK trail behind `run_with_paper` |
| Dust motes | particle | slow BONE-DK motes drifting in the window light shaft |
| Light shaft | overlay | soft AMBER gradient from the window across the desk (multiply blend) |
| Lamp glow | overlay | radial AMBER pool under each desk lamp (multiply/additive) |
| Rain | particle | Street only: diagonal 1px BONE-DK streaks |
| Press impact | full-screen flash | 1-frame RED @ 30% on lever slam |
| Stop-press vignette | overlay | RED-DK radial vignette while paused |

Deliver any **baked** FX (if you choose baked over particle) as `fx_<name>` sheets with the
frame count and fps you author them at, tagged in Aseprite.

---

## 9. Rooms — backgrounds (BG) & foregrounds (FG)

Each room is **640 × 360**, delivered as **separate layers** so actors sit *between* BG and
FG (walk behind a desk edge, in front of the back wall). Standard layer stack:

- **BG-far** — wall, window, sky (parallax 0; static)
- **BG-near** — wall fixtures: clock, shelves, pipes, back desks
- **actor plane** — where characters render (not a drawing; the engine layer)
- **FG** — objects the actor passes *behind*: desk fronts, foreground furniture, door frame,
  hanging bulb cords
- **LIGHT** — overlay layer: lamp pools, window shaft, vignette (blend modes in §8)

Provide each layer as its own PNG at 640×360 (transparent where empty), plus an Aseprite
source with the layers named exactly as above. Mark **walk-behind** edges with a 1-px magenta
guide on a throwaway `guides` layer (engine reads a depth mask, or we hand-place).

### 9.1 The Newsroom *(priority 1)*
The main hub. Six desks (one per staffer); empty chair = "out on a story".
- **BG-far:** blue-black wall; tall window (upper-left) with venetian **blinds** + amber
  night leak; a big **wall clock** (engine hands) showing time-to-next-edition.
- **BG-near:** back row of desks (smaller, static), filing cabinets, a coat rack, framed
  front pages on the wall, ceiling **pneumatic tubes**.
- **FG:** the front **desk fronts** (actors sit behind), a hanging bulb + cord centre,
  a **wire ticker** strip along the very bottom (scrolls incoming signals).
- **LIGHT:** amber pool per lit desk lamp; cool window shaft with dust motes.
- **Hotspots:** each desk (click → that reporter's filed reports / talk), the clock, the
  ticker, the door (to the Street), a door/arrow to Editor's Office & Press Room.

### 9.2 The Editor's Office *(priority 1)*
Where the user proofs the paper. Intimate, warmer.
- **BG-far:** panelled wall, a smaller window, a shelf of bound back-issues (ties to Morgue).
- **BG-near:** framed "masthead", a hat stand, a globe/ashtray flavour.
- **FG:** a **big desk** with the **paper laid out** (the rendered edition sits here), a
  green banker's lamp, an ashtray, an inbox/outbox tray, a **red pencil** resting.
- **LIGHT:** strong warm pool on the desk; rest of room dim.
- **Hotspots / red-pencil verbs** (need 16×16 icons, §10): **Spike**, **Move up**,
  **Move down**, **Dig deeper**, **Add note**, **Approve**.

### 9.3 The Press Room *(priority 1)*
Plays when an edition prints; where **Stop the Press** happens.
- **BG-far:** brick/industrial wall, gauges, a high dirty window.
- **BG-near:** the **printing press** (`prop_press`, animated), belts, paper reels.
- **FG:** the **big red lever** (`prop_lever`) front-and-centre, a stack of fresh papers
  building, ink drums, `rus` the pressman's plane.
- **LIGHT:** cold overhead + sparks; on stop → RED flash + vignette (§8).
- **States:** press-running loop; **press-stopped** (frozen + lever down + RED);
  distribution status board (engine text).

### 9.4 The Street *(priority 2 — cosmetic)*
Exterior; reporters visibly leave and return. Use your reference mood (Echo Cafe, lampposts,
period cars, wet cobbles).
- **BG-far:** building façades, neon-ish signage (original names), moon/fog.
- **BG-near:** shopfronts, a lamppost pool, a parked period car (static or 2-frame).
- **FG:** a foreground lamppost / railing the actors pass behind, puddle reflections.
- **LIGHT:** lamppost pools, rain (§8), window glows.
- **Hotspots:** the newsroom door (return), ambient only otherwise.

### 9.5 The Morgue *(priority 2)*
The archive. Rows of filing cabinets; search past editions.
- **BG-far:** deep shelving vanishing into dark.
- **BG-near:** `prop_cabinet` rows (some open), a card-catalogue, a single hanging bulb.
- **FG:** a front cabinet/counter, a desk lamp, a magnifier.
- **LIGHT:** one tight bulb pool; heavy vignette.
- **Hotspots:** cabinets (→ search results), the counter.

---

## 10. UI / HUD pixel assets

The **game frame** is pixel; the **paper's body text** is a real serif at normal resolution
(people have to read it) — so this section is only the game-chrome pixels.

| Asset | Cell | Frames / states | Notes |
|--|--|--|--|
| Speech bubble | 9-slice | 1 | 4×4 corners + tileable edges; **tail** 3 px; BONE fill, INK outline |
| Thought bubble | 9-slice | 1 | rounded + bubble-trail tail (for `thinking`) |
| Interrupt card | 9-slice | 1 | the **Stop the Press** card frame (RED border), holds 3 buttons |
| Button | 48 × 16 | 3 | idle / hover / pressed (AMBER on press) |
| Verb icons | 16 × 16 | 6 | Spike (spindle), Move-up (▲), Move-down (▼), Dig (magnifier+shovel), Note (pencil), Approve (stamp) |
| Cursor | 16 × 16 | 2 | pointer + hover (hand). Optional "wait" spinner 4 frames |
| Ticker glyphs | — | — | reuse bitmap UI font |
| Scrollbar | 8 wide | 3 | track + thumb + arrows (Morgue/reports) |
| Clock hands | drawn | — | engine-rotated; no sprite |
| Masthead ornaments | vary | 1 | rules / fleurons for the paper header (optional) |

### Fonts (two)
- **UI pixel font:** a 5×7 (cap-height 7) bitmap font for labels, ticker, nameplates,
  bubbles. Deliver as an Aseprite sheet + a glyph-map, or specify an open pixel font you
  want us to license (must be redistributable / OFL). Cover A–Z a–z 0–9 and
  `. , ! ? ' " : ; - — & $ % ( ) / …`.
- **Paper serif:** NOT pixel — the rendered edition uses a real serif via CSS (already in
  the HTML renderer). No asset needed; just don't pixelate the paper.

---

## 11. Delivery format & pipeline

**Tooling:** Aseprite (source of truth). Export sprite sheets + JSON atlases the engine
(PixiJS) reads directly.

### File / directory layout (in the repo)
```
assets/
  aseprite/                 # editable sources (committed)
    char_base.aseprite      # the shared rig, all desk + standing anims, layered per §4
    prop_<name>.aseprite
    room_<name>.aseprite     # layered BG-far/BG-near/FG/LIGHT per §9
    ui.aseprite
    font_ui.aseprite
  palettes/
    <id>.gpl                 # one per staffer (§3)
    master.gpl               # the 32-colour master (§2)
  sheets/                    # exported (can be regenerated)
    char_<id>.png + .json    # per-character baked sheet (post palette-swap)
    prop_<name>.png + .json
    room_<name>_<layer>.png
    ui.png + .json
```

### Aseprite conventions
- **Layers** named exactly as §4 (`swap:hair-back`, `body`, `arms`, `head`, `face`, `hat`,
  `prop`) and §9 (`BG-far`, `BG-near`, `FG`, `LIGHT`, `guides`).
- **Animation tags** = the anim names in §5/§6 (`idle_breathe`, `type`, `coffee_sip`,
  `phone_answer`, `walk`, `run_with_paper`, …). Set correct **per-tag ms** so timing travels
  with the art.
- **Swap slots** on a contiguous palette block (S0–S10) so a remap is one step.
- Mark any non-mirrorable sprite with a `noflip` user-data tag.
- Export command (per source):
  `aseprite -b char_base.aseprite --sheet sheets/char_base.png --data sheets/char_base.json --format json-hash --list-tags --list-layers --inner-padding 1`

### Engine hand-off (what code expects)
- One packed PNG + JSON-hash atlas per sheet; frame tags become animation names; ms/frame
  drives playback. Pivots per §1 (we'll read a pivot from frame `slice` data if you add a
  `pivot` slice, else we use the conventions in §1).
- Rooms: 4 PNG layers per room at 640×360; the engine stacks BG → actors → FG → LIGHT.

---

## 12. Build order (matches Milestone 3)

Draw in this order so the app lights up room by room; **placeholders exist in code already**,
so nothing blocks on art.

1. **Palette + `char_base` rig** with `sam` + desk anims: `idle_breathe`, `blink`, `talk`,
   `type`, `smoke` (cig + particles). → proves the desk loop.
2. **Newsroom room** (4 layers) + `prop_typewriter`, `prop_mug`, `prop_phone`,
   `prop_nameplate`, `prop_ticker`, `prop_clock`.
3. Remaining desk anims (`coffee_sip`, `phone_*`, `thinking`, `write_pencil`, `react_shock`)
   + the other five palettes.
4. **Editor's Office** + verb icons + `prop_lamp_banker`, red pencil.
5. **Press Room** + `prop_press` + `prop_lever` + Stop-the-Press FX. → M4 lands visually.
6. **Standing + walk** cycles → then **Street** and **Morgue** (priority 2).
7. UI polish: bubbles, buttons, cursor, interrupt card.

### Total frame estimate (order-of-magnitude)
- Base rig desk anims: ~48 frames × (1 base draw) + 5 palette remaps ≈ **48 authored**.
- Standing/walk/run: ~24 authored.
- Props: ~40 frames across all props.
- Rooms: 5 rooms × 4 layers = **20 layer paintings**.
- UI: ~30 small sprites + a font.

So roughly **~140 authored animation frames + 20 room layers + a UI set + a bitmap font** for
the full v1 — most of which is one character rig you draw once and re-tint five times.

---

*Questions or trade-offs (e.g. baked vs particle FX, whether to author back-facing walks)
are cheap to change — flag them and we'll adjust the engine side to match how you'd rather
work.*
