# THE LONG SILENCE

A procedural space-exploration game that runs in a browser tab. WebGL2, no
assets — every star, world, ring system, nebula and derelict is generated from
a seed and shaded by hand-written GLSL.

```
npm install
npm run dev        # http://localhost:5173
npm run build      # static bundle in dist/
```

---

## The game

Forty thousand years ago nine hundred inhabited worlds inside an eighty
light-year volume fell silent in four days. No debris, no radiation signature,
no sign of violence. The Choir left their cities lit, their orbits tidy, their
archives open — and seven instruments standing in seven systems.

You fly the survey vessel *Pale Seeker*. Chart systems, scan what you find,
and attune to the Resonators; each one yields a Canto and pushes the drive a
little further. All seven opens the Aperture.

### Controls

| | Desktop | Touch |
|---|---|---|
| Steer | mouse (click to capture) or arrow keys | left stick |
| Roll | `Q` / `E` | right stick, horizontal |
| Throttle | `W` / `S`, or scroll | throttle rail, or right stick vertical |
| Look around | hold RMB / `Alt` | `LOOK`, then right stick |
| Boost | `Shift` | `BOOST` |
| Scan | hold `F` | hold `SCAN` |
| Land / lift off | `L` | `LAND` / `LIFT OFF` |
| Fold drive | `J` | `FOLD` |
| Star map | `M` | `MAP`, then `◀ SYS` / `SYS ▶` and `FOLD TO` |
| Archive | `Tab` | `ARC` |
| Autopilot | `G` | `AUTO` |
| Cycle target | `T` | `TGT` |
| Full stop | `X` | `STOP` |
| Stand / sit | `E` | `STAND` / `USE` |
| Camera | `V` | `VIEW` |
| Frame stats | `P` | — |

Fold speed scales with distance from the nearest mass, so an approach
decelerates itself and drops you out just clear of the surface. Interstellar
transit is initiated from the star map and costs drive charge by distance.

---

## How it renders

**Scale and precision.** One world unit is one kilometre. Systems span millions
of units while the ship is 0.1 units long, so the world uses a *floating
origin* — the ship sits at (0,0,0) and everything else is positioned relative
to it each frame — plus a logarithmic depth buffer. Custom `ShaderMaterial`s
opt into log depth by hand (`LOGD_*` chunks in `src/gfx/glsl/noise.js`); miss
that and two concentric spheres z-fight into triangular confetti.

**Planets are baked, not evaluated.** Twenty-odd octaves of simplex per pixel
per frame is not survivable on a phone, so each solid world is rendered once
into a cubemap holding linear albedo in RGB and terrain height in A. The
runtime shader is three texture taps for normals plus lighting. Cubemaps rather
than equirectangular maps: no pole pinch, no seam. The nearest world gets
re-baked at 1024²/face; everything else sits at 256².

**Atmospheres are single-scattering raymarches** through a spherical shell in
planet-radius object space, with Rayleigh coefficients set from real optical
depths (~0.05/0.10/0.23 at zenith) and a soft planetary penumbra on the light
ray so twilight fades instead of ending at a line.

**Auto exposure** runs entirely on the GPU: a 64² luminance reduction to 8² to
1², then a ping-pong adaptation target. The metric is a *sqrt* mean — a log
mean is the textbook choice but space frames are 90% black sky and the log of
near-zero drags the average to nothing, blowing out every shot.

**Post** is hand-rolled: bright prefilter → six-level dual-filter bloom with
attenuated wide mips → anamorphic streak → god rays and lens ghosts → composite
(radial blur, chromatic aberration inside the sampler, AgX tonemap, grain,
dither) → FXAA.

**Performance** holds the frame by trading resolution, never features: the
engine watches frame time and moves the render scale between 0.62× and 2×. A
handheld gets its own band — a floor of 0.45 and a target of 44–58fps rather
than 60, because a 120Hz phone panel quantises the achievable rates to 120, 60,
40, 30, and a controller chasing 60 on a scene that can hold 48 ratchets to the
floor, sits there smeared, and still does not get 60.

---

## Layout

```
src/
  core/       Engine (renderer, quality tiers, frame loop), Input,
              device (handheld/fold/posture detection, preferences),
              TouchControls (the on-screen control layer)
  sw.js       service worker; emitted to /sw.js, stamped by vite.config.js
  gfx/        PostFX, Sky (nebula cubemap + HDR star field), cube baking,
              greeble (the shared construction + surfacing kit), GLSL
  world/      generate (seeded universe), Planet, Star, Surface (the ground),
              Fleet (traffic), Station, Structures, Asteroids, Dust, shaders
  ship/       Ship — procedural hull with injected panel-line PBR, flight model
  game/       Game (world state, scanning, fold, floating origin), Director
              (cutscenes), encounters, lore
  ui/         HUD, Codex, StarMap, stylesheet
  audio/      procedural WebAudio drone and engine
tools/        browser verification: survey.mjs, play.mjs, probe.mjs,
              sheet.mjs, mobile.mjs
```

**One kit builds everything.** `gfx/greeble.js` owns the plate-seam law, the
weathering, the sun-bleaching, the grazing rim term and the five base materials,
and the player's hull, every freighter, every station and every derelict are
surfaced by it. Parts bake their transforms into their geometry and are welded
per material, so panel lines run continuously across part boundaries and a
hundred pieces cost six draws.

**Traffic is on a schedule, not a simulation.** Craft follow analytic paths
keyed to the clock, so they are exactly where they belong after a fold jump or a
two-minute pause. Each carries a *beacon* — a quad sized from view depth to hold
a constant few pixels — because sixty metres of hull four million kilometres
away is far below one, and a moving spark is what makes a system read as busy.

**The ground is a separate scene.** Orbit needs a whole planet with no visible
geometry; standing on one needs ten kilometres of terrain with no visible
sphere. `world/Surface.js` is a radial grid whose rings grow exponentially,
displaced by the same terrain law the orbital bake uses, bent down by the
planet's real radius, and hazed by the same scattering coefficients as the
atmosphere shell above it.

## On a phone

It used to refuse to run on one. The argument was that a handset cannot afford
the raymarched atmospheres, the volumetric decks or the twenty-pass post chain,
and that a reduced build would misrepresent the game — but the thing the dynamic
resolution controller has always traded is *pixels*, and a Tensor G4 has more
fill rate than the laptops this was prototyped on. A handheld now starts at the
low tier at 0.85 device pixels with ambient occlusion and the cabin's shadow map
off, and climbs from there. Every feature survives.

What was genuinely wrong was the controls, so those were rebuilt for a
touchscreen rather than adapted from a mouse — `src/core/TouchControls.js`.

**The sticks float.** A fixed ring makes you look down to find it; a floating
one puts its origin wherever your thumb lands inside a generous zone, so your
eyes stay on the canopy. Past full deflection the origin follows the thumb
instead of clamping, because a thumb pivots at the knuckle and arcs — clamping
means the ship stays pinned at full pitch while your thumb is visibly moving.

**The throttle is a lever, not two buttons.** `+`/`−` is a rate control
pretending to be a setting: you cannot ask it for 40%, only hold until it looks
about right, while watching a 9px number. The rail is absolute, with magnetic
detents at the quarters.

**The button set comes from the game's mode.** Flying, walking, landed, standing
on a planet and reading the chart each get their own, and each button declares
the action it fires. The previous version relabelled five fixed buttons and then
remapped their meanings in two other files, which is how `SCAN` came to open the
star map while you were standing up.

Everything else: pointer events throughout, so the Fold's S Pen works and a
thumb that slides off `SCAN` keeps holding it; haptics; a settings panel for
size, opacity, sensitivity, left-handed layout and tilt-to-steer; and safe-area
and hinge insets so nothing sits under a cutout, a gesture bar or a fold.

Three layout classes, named for how much room a thumb has rather than for any
device, and recomputed on every geometry change rather than latched at boot:

| | | |
|---|---|---|
| `compact` | 923×411, 882×344 | Pixel 9a sideways, Z Fold 4 cover panel |
| `roomy` | 1104×884 | Z Fold 4 unfolded — near square, bigger controls, pushed further out |
| `portrait` | | playable, and nudges you to turn sideways |

The Fold is the one that shapes the code. It swaps between two physically
different screens *while the page is running*, and `innerWidth`/`innerHeight`
during that swap are a blend of the old panel and the new one — measured
884×1104 arriving as 884×344 for two frames, which is a different layout class
entirely. So every geometry signal is debounced and re-measured across two
animation frames before anything acts on it, the renderer holds its resize until
the size stops moving, and anything mid-drag is dropped rather than left
measuring against an origin that no longer exists.

Install it and it runs without browser chrome, from cache — see
[`docs/HOSTING.md`](docs/HOSTING.md), which also compares the deployment
options and has the numbers behind them.

## Verification

```
node tools/play.mjs        # 17 interaction assertions (flight, scan, fold, jump)
node tools/survey.mjs      # screenshots every set-piece, reports fps/draws
node tools/probe.mjs "<js>" --shot out.png     # one expression, one frame
node tools/sheet.mjs a.png b.png --out s.png   # contact sheet — judge a set at once
node tools/levels.mjs shots/*.png              # tone statistics per frame
node tools/judgeset.mjs                        # rebuild the review set in shots/judge/
node tools/mobile.mjs                          # the four handset geometries, with touch
node tools/desktop.mjs                         # the pointer path, after the touch one
```

`levels.mjs` is the one that stops arguments. "It looks flat" is not
actionable; "0.00% of pixels clip and the 99th percentile is 165" is, and that
is exactly what the game measured before the highlight range was fixed.

Every tool boots through `tools/boot.mjs`, which exists because the dev server
hot-reloads on any source edit: a capture that started before the reload
finishes happily and screenshots the title card, with a plausible frame rate
printed next to it. It verifies the overlay is actually gone and starts over if
it is not, and the multi-shot tools re-check between shots.

Both drive a real headed Chromium with GPU rasterisation against `npm run dev`.

`mobile.mjs` is the exception and runs against the *built* bundle by default
reasoning, because every mobile bug in this layer has been a geometry bug — a
button under the gesture bar, an aux column sitting on top of a stick's zone, a
layout class latched during an unfold — and none of them are visible at
1280×720 with a mouse. It emulates the two panels of a Fold 4 and both
orientations of a Pixel 9a, drives the sticks and the rail with real pointer
events, and asserts the ship responds; it also checks that no two controls
overlap, that nothing is off screen, and that no touch target is under 40px.
The frame rates it prints are software rasterisation and mean nothing about a
handset.

`desktop.mjs` is its opposite number and exists because making this run on a
phone meant branching the engine's constructor and the input loop on "is this a
handheld", and every one of those branches *takes something away* — the
supersampling headroom, the cabin's shadow map, the ambient-occlusion chain. A
phone is the one machine that will never notice a branch taken on the wrong
hardware, so something has to check that a pointer device still gets all of it.
