# How this app was built (with Claude Code)

A narrative record of the build, in the same spirit as the other apps here —
so the team can see what iterative development with Claude Code actually
looks like.

## The ask

> "Let's build a new app that uses MapLibre. The goal is to import elevation
> data and eventually use it to show droplets placed on the map that go
> downhill until there are no neighbors below the current droplet. We have an
> AgentScript model for this, but for now I want to do it all as a map app.
> Keep it as simple as possible. Start by just having a terrain map that
> we'll later add droplets to. Call the model Elevation."

## Decisions made up front

- **New folder `Elevation/`**, one self-contained `index.html` + `map.js` +
  `README.md`, matching `SantaFe` and the other apps. No build step.
- **Reuse what the `SantaFe` app already worked out:** import MapLibre v6
  from `unpkg` (not `esm.sh` — that broke MapLibre's Web Worker there),
  `import * as maplibregl` (v6 has no default export), base map from
  OpenFreeMap's key-free "positron" style, and keep a `moveend` camera
  logger for tuning the view.
- **Location: the Sangre de Cristo range above Santa Fe.** The whole point
  is water running downhill, so we want real relief and obvious drainages.
  Santa Fe Baldy (~3870 m) down to the Rio Grande valley (~1700 m) is local,
  familiar, and dramatic. `maxBounds` boxes the demo to the range.
- **Elevation source: the AWS "Terrain Tiles" open dataset**
  (`elevation-tiles-prod` S3 bucket, "terrarium" PNG encoding). Checked with
  `curl` before writing any code — z10 and z12 tiles both return 200. No API
  key, no signup, same spirit as OpenFreeMap. MapLibre decodes terrarium
  natively (`encoding: 'terrarium'`).
- **Wire up `queryTerrainElevation` now, even though there are no droplets
  yet.** It's the one primitive the droplet model needs ("how high is the
  ground here?"), so the app reads and displays the elevation under the
  mouse / last click from day one. That turns "does the terrain data
  actually work" into something you can see, and de-risks the next step.

## What the terrain setup looks like

Three calls inside `map.on('load', …)`:

1. `map.addSource('terrain-dem', { type: 'raster-dem', tiles: [...],
   encoding: 'terrarium', maxzoom: 15 })` — register the DEM.
2. `map.setTerrain({ source: 'terrain-dem', exaggeration: 1.4 })` — lift the
   map surface into 3D.
3. add a `hillshade` layer (same source) for slope shading, inserted just
   under the first label layer so town names stay readable.

Plus `map.setSky(...)` so the tilted horizon isn't grey void, and a
`TerrainControl` button to toggle 3D on/off.

## What broke, and the fix

**First screenshot came back flat** — a plain top-down street map, no
relief. The code looked right and there were no console errors. The cause
turned out to be the test, not the app: the headless-Chrome screenshot was
taken before the DEM tiles finished downloading, so MapLibre had nothing to
raise the surface with yet.

Rebuilt the check as a small **Chrome DevTools Protocol** script that
attaches over `--remote-debugging-port`, collects console + exceptions,
waits ~9 s for tiles, then evaluates expressions in the page and screenshots.
(One gotcha: current Chrome wants a **PUT**, not GET, on
`/json/new?<url>`.) With the wait in place: the Sangre de Cristos in tilted
3D with hillshading, and

```
map.queryTerrainElevation({lng:-105.7566, lat:35.8331})  // near Santa Fe Baldy
→ 5247   // meters
```

**5247 m is wrong** — Santa Fe Baldy is ~3870 m. The number came back with
the `exaggeration: 1.4` baked in (5247 / 1.4 ≈ 3748 m, right ballpark for a
point just off the true summit at ~10–30 m DEM resolution). So the display
would have lied by 40%.

**Fix:** pulled the exaggeration into a single `EXAGGERATION` constant at the
top of `map.js`, used it for both `setTerrain` and the `TerrainControl`, and
divide it back out in a `groundElevation()` helper before showing meters /
feet to the user. The exaggeration is uniform, so it never affects *which
way is downhill* — it only matters for a human-readable elevation, and now
that one place is corrected.

The only remaining console noise is a 404 for `/favicon.ico`, which every
app here has and nobody cares about.

## Verifying

Served the folder with `python3 -m http.server` and drove it in headless
Chrome (`--enable-unsafe-swiftshader`, since a headless browser has no GPU)
via the CDP probe script above — confirmed: terrain renders in 3D,
`hillshade` layer present, `pitch` applied, and `queryTerrainElevation`
returns sane real-world heights after dividing out the exaggeration
(~3748 m near Baldy, ~3282 m at the view center).

Publish is unchanged: `deno -A uploadApps.js Elevation` walks the new folder.

## Adding the droplets (still stationary)

> "Let's add the droplets to the map now. Their separation should be
> visually the same at any zoom. We won't start them moving yet. They
> should change on any view change."

The "same visual separation at any zoom" line settled the design: **don't**
use a lng/lat grid (that gets denser as you zoom out), use a **screen-pixel
grid**. `dropletFeatures()` walks a fixed 46 px lattice across the viewport
and `map.unproject()`s each cell to a lng/lat; a `geojson` source +
`circle` layer draws them. Since the grid is pinned to the screen,
`updateDroplets()` is wired to `map.on('move')` (fires every frame during
any pan/zoom/rotate/tilt) and `map.on('resize')` — so "change on any view
change" is automatic.

**What needed iterating:**

- **The horizon.** A tilted camera shows sky across the top; `unproject`
  there returns garbage far-field points. Added a round-trip check — keep a
  cell only if `project(unproject(p))` lands back within a couple of pixels
  of `p`. First tried a tight 0.5 px tolerance, but with terrain on, the
  legit `unproject`/`project` round-trip error already exceeds that and it
  started dropping good droplets on zoom-in (393 → 180). Settled on 2 px.
- **Reading the state in the test.** `map.getSource('droplets')._data`
  isn't populated the way you'd expect from the console;
  `map.queryRenderedFeatures({ layers: ['droplets'] })` is the reliable way
  to count/inspect what's actually on screen.
- **Bunching near the horizon.** Nearest-neighbour screen distance drops
  below 46 px where steep terrain faces the camera. Decided this is
  *correct* — the droplets sit on the terrain surface, so perspective
  foreshortening is expected; noted it in the README rather than "fixing" it.

**Verified** via the CDP probe: droplets render (~440 at the default view),
their coordinates change on pan, zoom-out, and rotate, and the grid stays
~46 px-spaced at other zooms. Screenshotted at two views — clean lattice
draped over the hillshaded terrain.

## Trim: drop the click popup, make the panel collapsible

> "Remove the click showing a lat/lng elevation — the bottom-right printout
> is enough. And clicking the top-left Elevation panel should
> minimize/maximize it."

Deleted the whole `map.on('click', …)` handler (elevation now comes only
from the `mousemove` readout). Added a click handler on `#panel` that
toggles a `.collapsed` class — CSS hides everything but the `<h1>` — with a
`–` / `+` glyph in the title and a guard so clicking the README link still
navigates.

Also folded `showElevation()` back into the `mousemove` callback since it
had only one caller now, and reworded the panel copy (it no longer says
"click anywhere").

## Design thinking: grid spacing, zoom, and tilt (not built)

Captured as a "Design notes" section in the README. The short version:

- **How to specify spacing:** a slider/number in the panel, but expressed in
  **meters on the ground**, not screen pixels — that's the unit the downhill
  model actually cares about, and it makes "what happens on zoom/tilt"
  well-defined.
- **Should it change with zoom?** The *world* grid shouldn't; only its
  screen projection does. Today's grid is screen-locked (constant px), which
  is nice for browsing but gives droplets no stable identity. For the
  simulation we want a **world-locked** grid anchored to fixed coordinates.
- **Tilt:** a world-locked grid needs no special handling — it just shows
  natural perspective (denser toward the horizon). Cull off-screen /
  beyond-horizon / too-far droplets and cap the count; optionally shrink or
  fade distant ones (`circle-pitch-scale`).
- Likely end state: a fixed simulation lattice (the real state) decoupled
  from a decimated draw set (what you see).

## Documenting the elevation data, and a standalone `elevation.js`

> "This is great for docs. […] Let's say we capture all the elevation tiles
> at our current zoom and convert them into a data set where each point has
> an elevation and a known lon/lat, via interpolation of the GIS bounds.
> AgentScript has something like that but I want it outside the AS code — a
> general elevation library. Tiles being broader than the image is fine."

First checked the actual data by probe (jump to a fixed point at each zoom,
read `queryTerrainElevation`, watch which `terrarium/{z}/…` tiles get
fetched): MapLibre pulls DEM tiles at the map's own zoom, capped at our
`maxzoom: 15`, so the same point reads ~3281 m at zoom 10 and ~3212 m at
zoom 15 then freezes. Sample spacing is just the Mercator pixel size:
~62 m at z11 down to ~4 m at z15. Folded a condensed version into the
README's terrarium section, including the per-zoom drift table.

**CORS gotcha:** `curl -I` (HEAD) on the AWS tiles shows no
`Access-Control-Allow-Origin`. A real GET with an `Origin` header does
return `ACAO: *` (it's `Vary: Origin`) — so browser `fetch` + canvas
`getImageData` works. The tiles also expose an
`x-amz-meta-x-imagery-sources` header naming the real DEM behind each tile
(around Santa Fe: `ned13`, USGS 1/3-arc-second).

**`elevation.js`** — dependency-free ES module, no MapLibre:

- `fetchElevation({ bounds, zoom })` → works out the covering `{z}/{x}/{y}`
  tile block, downloads the PNGs (8 at a time), decodes terrarium heights
  into one `Float32Array`, returns an `ElevationGrid`.
- The grid is the whole tile mosaic (broader than the requested box, as the
  user said is fine); `.bounds` reports the true extent.
- `.elevation(lng, lat)` bilinear-interpolates; `.lngLatAt(col, row)`,
  `.forEach`, `.range()`, `.toGeoJSON({ step })`, `.sources`.
- **Latitude is inverse-projected per row**, not lerped between the mosaic's
  north/south bounds — naive bounds interpolation is off by tens of metres
  mid-tile because Mercator y isn't linear in latitude.
- `createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha:
  'none' })` so a colour-managed decode can't corrupt the packed RGB heights.

`map.js` imports it and exposes `grabElevation()` (grid for the current
view) on the console, alongside `window.map`.

**What broke:** first version's `.elevation()` clamped to the nearest edge
sample when the bilinear stencil fell off-grid — which also meant a point
*well* outside the mosaic silently returned an edge value (the Santa Fe
Plaza, south of the box, came back as 2297 m). Added a `.contains()` check:
truly-outside → `null`, only clamp within the last half-pixel.

**Verified** by importing the module into the running app page over CDP:
1280×1280 grid from a 5×5 tile block at z13, `.bounds` correctly wider than
the request, row spacing 15.5 m (matches z13), `.elevation()` near Santa Fe
Baldy = 3742 m vs the map's own sampler 3748 m at the same point, `.sources`
= `['ned13/imgn36w106_13.tif']`, out-of-box point → `null`.

## Droplets, step 1: the world-locked grid

> "Now let's implement droplets. First step: use our library to create the
> desired grid at an altitude that lets them be seen in the 3D view. You
> mentioned a slider."

**The "altitude" question, resolved by probing.** Tested in headless Chrome
whether a MapLibre `circle` layer honours a Z on its Point geometry: put
several dots at one lng/lat with different Z — only one drew (the last in
paint order), and `map.project()` ignores altitude. So **circle layers
ignore Z**. Also tried `fill-extrusion` boxes floated to `base = ground +
150 m` — they didn't render above the terrain at all.

But it turned out not to matter: MapLibre draws `circle` layers as an
**overlay on the 3D terrain** — they follow the surface and are never hidden
behind a ridge at any tilt. So the droplets are already reliably visible in
the 3D view with no z-offset needed. Noted this in the code and README; a
true floating-bead look would need a model layer, a separate project.

**What got built:**

- Switched the droplet grid from the old screen-pixel lattice to a
  **world-locked** one over a fixed `MODEL_BOUNDS` box.
- On load, one `fetchElevation({ bounds: MODEL_BOUNDS, zoom: DEM_ZOOM })`
  (DEM_ZOOM 12, ~30 m samples) — the `elevation.js` grid is cached in
  `demGrid`.
- `dropletFeatures()` walks a lattice at `spacingMetres`, anchored to a
  fixed origin (so a node is always the same droplet), and tags every point
  with `demGrid.elevation(lng, lat)`.
- **Spacing slider** in the panel (150–1500 m). Its handler just re-walks
  the cached grid — no refetch — so it runs live on `input`. The
  panel-collapse click handler now also ignores `#controls` so dragging the
  slider doesn't fold the panel.
- Nudged the default camera (center, zoom 10.9, pitch 60) to frame the model
  region, and eased `circle-radius` with zoom.

**Verified** in headless Chrome: grid renders as a fixed patch draped on the
terrain (screenshot), ~1890 droplets visible at 400 m / ~13 400 at 150 m /
~210 at 1200 m, each feature carries a real `elevation` (sampled range
2086–3819 m over the visible area), slider label updates, slider clicks
don't collapse the panel, panel-body clicks do, no console errors.

## Droplets, step 2: motion + Start / Reset

> "Have the droplets move down to the smallest elevation of the 8 neighbors;
> if none are smaller, don't move. We need start/stop/speed/reset controls."
> … "we may skip speed control for now?"

Skipped speed for now (fixed `STEP_MS = 200`).

- Droplets are now **plain objects** (`{ lng, lat, elev, trail, done }`) in a
  module array, not GeoJSON features. `render()` projects the array into two
  GeoJSON sources — `droplets` (circles) and `trails` (one LineString each) —
  after every step.
- `step()`: for each un-settled droplet, scan the 8 lattice neighbors, move
  to the lowest that's strictly below, else set `done`. When a whole pass
  moves nobody, it calls `stop()` itself.
- `buildDroplets()` / `step()` / `start()` / `stop()` / `reset()`, wired to a
  **Start ⇄ Pause** button and a **Reset** button. The spacing slider now
  rebuilds on `change` (release), not `input` — at 150 m that's ~13 k
  droplets and rebuilding every `input` tick was going to be janky. `input`
  just updates the label.
- Colours: moving droplets light blue `#5aa4ff`, settled ones dark `#0a3f7d`
  ("pooled water"); trails a translucent blue `line` layer under the dots.
- `window.sim = { start, stop, reset, step, droplets, grid }` for the
  console, matching `window.map`.

**A false start in testing:** the first probe read `droplets` / `timer`
directly in `Runtime.evaluate` and got `ReferenceError` — they're
module-scoped, invisible to the page's global scope (unlike `window.map`).
Added the `window.sim` hook and the probe worked.

**Verified** in headless Chrome at 400 m spacing: 1890 droplets, run
converges in ~20 steps, all reach `done`; **0 settled-correctness
violations** (spot-checked every `done` droplet against `demGrid` — none has
a strictly-lower neighbor); Pause freezes the `done` count; Reset restores
the full grid; the trails trace a clean dendritic drainage network into the
valleys (screenshot). No console errors.

## Droplets, step 3: the straight-line paths, and a directional option

> "The paths look like straight lines. Is that the elevation-data density?
> Would denser data help?" … "Could it be an option? … now I recall we did a
> vector-based option, moving in the alt/az direction. For now, let's try the
> directional approach."

Explained first: the straight octilinear look is the **movement rule**, not
the DEM. The droplet hops lattice node → node, so every segment is one grid
cell long and snaps to 8 compass directions — the classic **D8 artifact**
(parallel 45° lines on any planar slope). Denser elevation data barely
touches it.

Built it as a switchable **Motion** selector, keeping both rules:

- `neighbors` — the original D8 walk, unchanged.
- `vector` — sample the DEM around the droplet (`GRAD_PROBE_M`, deliberately
  wider than a step) for the local downhill direction, blend with the
  droplet's heading (`MOMENTUM = 0.7`), step `VECTOR_STEP_M` along it.
- Droplet objects gained `vx, vy, stuck`; `DEM_ZOOM` bumped 12 → 13 (~15 m)
  so the finer steps have finer terrain.

**Tuning, by screenshot + a "snap-to-45°" metric** (fraction of trail
segments within 4° of a 45° multiple):

- First pass, no momentum: `diagSnapPct` dropped to ~17 % (vs 100 % for
  `neighbors` — so the curves are real), but droplets stopped all over the
  hillslopes at every little interpolated dimple — `avgTrail` only ~10.
- Added momentum → droplets flow properly down to the valleys and edges,
  `avgTrail` ~85 and *climbing* — vector-mode water never really "settles",
  it just keeps running to the model edge. First tried "stop when few are
  moving"; that never triggered (hundreds always in flight).
- Settled on a hard `RUN_STEPS = 60` budget (~10 s at 160 ms). By then the
  full drainage network is drawn; stragglers freeze. `STEP_MS` 200 → 160 and
  `VECTOR_STEP_M` 120 to keep it watchable.

**Verified** in headless Chrome: `vector` `diagSnapPct` 16–18 % vs
`neighbors` 100 %; both modes reach all-`done`; switching the selector clears
trails and rebuilds; no console errors. The `vector` screenshot is a proper
dendritic river network curving along the valleys — the D8 one is the
familiar hatched staircase.

## Droplets, step 4: run-length slider + fixing the "halting" problem

> "The RUN_STEPS idea is good — without it there's constant motion. Maybe a
> slider for it? And in the screenshot lots of droplets could clearly move
> further — the halting problem is definitely there."

Two things were making droplets stop short:

1. **`RUN_STEPS` marked every still-moving droplet `done`** when the budget
   hit — so hundreds of mid-flight droplets went dark, reading as "settled"
   on open hillsides. Fix: budget-stopped droplets are left un-`done` (stay
   bright); only droplets that genuinely reached a pit/edge darken.
2. **The pit test was way too tight.** It settled a droplet after just 6
   consecutive non-descending steps — with momentum carrying droplets
   briefly across-slope, that fired all over the hillsides. Replaced with:
   track the droplet's record low, settle only after `STUCK_STEPS` (25)
   steps — ~3 km — without beating it by >0.2 m. That's "circling a real
   closed basin," not "easing down a gentle valley." Also dropped `MOMENTUM`
   0.7 → 0.6 and the flat-grade threshold 3e-3 → 1e-3.

Added the **Run length slider** (`runSteps`, 20–400, live on `input`).
Raising it mid-run lets water keep flowing; after a run stops you can raise
it and hit Start to continue (stepCount isn't reset, so it just runs to the
new budget).

**Verified** in headless Chrome: with the loose pit test, `vector` droplets
flow into the channels and to the box edges instead of stranding on slopes
(before/after screenshots); avg trail ~54 steps; raising the slider to 300
and continuing settles the last ~120 stragglers; `neighbors` mode unchanged
(~4 s); no console errors.

## Next step (not built yet)

Speed control — a *rate* slider bound to `STEP_MS` that re-arms the interval
while running. Maybe: click-to-drop a single droplet; trail-accumulation
colouring for the main channels; pit-filling so basin droplets overflow.
