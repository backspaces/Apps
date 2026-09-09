# Elevation

A 3D **terrain map** of the Sangre de Cristo mountains above Santa Fe, NM,
built with [MapLibre GL JS](https://maplibre.org/). It reads real elevation
data, drapes the map over it, and shades the slopes.

Open `index.html` in a browser. No build step, no API key.

- **Drag** to pan, **scroll / pinch** to zoom
- **Right-drag** (or **Ctrl-drag**) to tilt and rotate
- The top-right buttons do the same, plus a **3D-terrain toggle** (the
  mountain icon) that flattens or re-inflates the terrain
- **Move the mouse** anywhere to read the ground elevation there (the
  bottom-right box)
- A fixed grid of blue **droplets** sits on the terrain. Press **Start** and
  each walks downhill; their paths trace the drainage network, and droplets
  darken where water pools. The **Motion** selector switches between *8
  neighbors* (blocky, faithful to the model) and *downhill vector* (smooth
  curved streams); the sliders set droplet **spacing** and **run length**.
  **Reset** puts them back.
- **Shift-drag** a rectangle to move the whole droplet grid to a new patch
  of terrain (the dashed blue box shows where it is). There is no `maxBounds`
  any more — pan and zoom anywhere first, then draw a box over a watershed in
  another state. The elevation for the new box is downloaded on release, at a
  tile zoom picked to keep the download bounded whatever size you draw.
- **Click the top-left panel** to collapse it to its title (click again to
  reopen)

Live: https://agentscript.acequia.io/agentscript/apps/Elevation/

## Where this is going

We have an AgentScript model where water **droplets** are placed on a
landscape and repeatedly step to their lowest neighbor until they sit in a
spot with no lower neighbor (a pit or the edge). This app does the same
thing directly on a real map: a terrain map, a world-locked grid of droplets
that each know their ground elevation (from
[`elevation.js`](#a-standalone-elevation-library-elevationjs)), and two
downhill rules to run — the faithful 8-neighbor one and a continuous
downhill-vector one.

Still to come: a speed control (steps are on a fixed 160 ms timer for now).

The model region started as a hard-coded box; **shift-drag** now re-draws it
anywhere on Earth (`regionselect.js`, shared with the `Fire` app), so the
same droplet model runs on any terrain you can pan to.

## What the code does

`index.html` is the page shell (a `#map` div, a caption box, an elevation
readout box, and `<script type="module" src="map.js">`). The map code is in
**`map.js`**; a separate **`elevation.js`** holds a standalone DEM-to-grid
helper (its own section below). Reading `map.js` top to bottom:

1. **Load MapLibre** — one CSS file and one ES-module `import`, both from a
   CDN (`unpkg`). That's the whole dependency. (We import from `unpkg`, not
   a re-bundler like `esm.sh`, because MapLibre also loads a Web Worker file
   that has to sit next to its main script — `esm.sh`'s repackaging breaks
   that. This bit us in the `SantaFe` app.)

2. **Create the map** (`new maplibregl.Map({...})`):
   - `style` — OpenFreeMap's free **"positron"** style (clean and light), a
     URL to a *style JSON* describing the base map's whole look. No API key.
   - `center` — `[longitude, latitude]`.
     ⚠️ MapLibre uses `[lng, lat]`; Leaflet (our `NYC` app) uses `[lat, lng]`.
   - `zoom`, `pitch` (camera tilt), `bearing` (rotation), and `maxBounds` —
     a box the map can't pan outside of, so the demo stays on the range.

3. **Add the elevation data** (`map.on('load', …)`):
   - `map.addSource('terrain-dem', { type: 'raster-dem', … })` registers a
     **DEM** — a Digital Elevation Model. It looks like a set of PNG tiles,
     but each pixel's *color* encodes a height in meters, not a picture (see
     "terrarium encoding" below).
   - `map.setTerrain({ source, exaggeration })` tells MapLibre to lift its
     whole surface into real 3D using that DEM. `exaggeration: 1.4` stretches
     the vertical scale a bit so this fairly gentle range reads as mountains.
     It scales every height equally, so it never changes which way is
     downhill — but we divide it back out before showing a real elevation.
   - We add a **`hillshade`** layer (also fed by the DEM) that shades slopes
     by the angle they face, inserted just under the first label layer so
     town names stay on top.
   - `map.setSky({...})` paints a sky/haze so the tilted horizon isn't a
     grey void.

4. **Add controls** — zoom/compass/tilt buttons, a distance scale, and a
   dedicated `TerrainControl` (the 3D toggle).

5. **Read the elevation** — on `mousemove` we call
   `map.queryTerrainElevation(e.lngLat)`, divide out the exaggeration, and
   show meters + feet in the bottom-right box.

6. **The droplets** — a **world-locked** grid over a fixed patch of terrain,
   `MODEL_BOUNDS`. On load we download the elevation for that whole box
   **once** (`fetchElevation`,
   [`elevation.js`](#a-standalone-elevation-library-elevationjs), at
   `DEM_ZOOM` ≈ 15 m samples) and keep the grid as `demGrid`.
   - `buildDroplets()` walks a lattice at `spacingMetres`, anchored to a
     fixed origin so a given node is always the same droplet. Each droplet is
     a plain object — `{ lng, lat, elev, trail, done, … }` — not a GeoJSON
     feature; `render()` projects the array into two sources each step.
   - `step()` moves every un-settled droplet once, by one of **two rules**
     (the Motion selector):
     - **`neighbors`** (the AgentScript rule, "D8" in hydrology) — move to
       the lowest of the 8 lattice neighbors if it's below you, else settle.
       Steps are one grid cell long and snap to 8 compass directions, so the
       paths come out as straight octilinear staircases.
     - **`vector`** — sample the DEM around the droplet to get the local
       downhill *direction*, blend it with the droplet's current heading
       (`MOMENTUM`, so it coasts over small bumps instead of stopping at
       each), and step `VECTOR_STEP_M` that way. Paths curve along the true
       fall line into a smooth dendritic network. A droplet settles only
       when it goes `STUCK_STEPS` without reaching a new low (circling a real
       pit), leaves the box, or the run's step budget runs out.
   - A run stops when nothing moved, or after `runSteps` steps (the slider).
     Vector-mode water otherwise keeps flowing toward the model edge, so the
     budget matters; droplets still moving when it hits stay **bright** (not
     `done`) — a longer run carries them further.
   - Drawn as a `line` layer (`trails`) under a `circle` layer (`droplets`),
     both as an overlay on the 3D terrain (they follow the surface, are never
     hidden behind a ridge, and need no altitude offset — circle layers
     ignore a z coordinate anyway). Moving droplets are light blue; settled
     ones darken to "pooled water".
   - Panning/zooming does **not** change the droplets: they belong to the
     model region, not the view.

7. **Controls** (in the panel):
   - **Motion** selector → `neighbors` / `vector`; switching rebuilds.
   - **Spacing slider** → `spacingMetres`; label updates live on `input`,
     grid rebuilds on `change` (release) since the fine end is thousands of
     droplets. Rebuilding = `reset()`.
   - **Run length slider** → `runSteps` (live). Raise it mid-run to let the
     water keep going; after a run has stopped, raise it and press Start to
     continue from where it left off.
   - **Start / Pause** toggles a `setInterval(step, STEP_MS)` (160 ms).
   - **Reset** stops and rebuilds the grid.
   - A click handler on `#panel` collapses it to its title; clicks on the
     README link or anywhere in `#controls` are ignored.
   - **Shift-drag** on the map (`regionselect.js`) calls `loadRegion()` with
     the box you drew: it stops the sim, re-points `MODEL_BOUNDS` /
     `WEST…NORTH`, moves the dashed outline, downloads the elevation for the
     new box (`pickDemZoom()` chooses the tile zoom), and rebuilds the grid.

8. **Console hooks** — `window.map` (poke the map: `map.getPitch()`, …),
   `window.sim` (`sim.step()`, `sim.droplets()`, `sim.reset()`,
   `sim.region([[w,s],[e,n]])` to move the model region), and
   `grabElevation()` which downloads a [grid](#a-standalone-elevation-library-elevationjs)
   for the *current view*. Plus a `moveend` logger that prints `center /
   zoom / pitch / bearing` — pan to a view you like and copy the numbers
   back into step 2.

That's it — a couple hundred lines of real code in `map.js`, plus the
standalone `elevation.js`; a lot of the file is comments.

## A standalone elevation library (`elevation.js`)

[`elevation.js`](elevation.js) is a small, **dependency-free** ES module
(no MapLibre, no build step) that turns DEM tiles into a lng/lat-addressable
elevation grid. The droplet grid is built on it, and it's meant to be reused
in other contexts too.

```js
import { fetchElevation } from './elevation.js';

const grid = await fetchElevation({
  bounds: [[-105.90, 35.72], [-105.70, 35.86]],  // [[W,S],[E,N]] lng/lat
  zoom: 14,                                       // slippy-map tile zoom
});

grid.elevation(-105.80, 35.80);   // → metres, bilinear-interpolated (or null if outside)
grid.width * grid.height;         // → sample count (whole tiles, ~1–2M)
grid.bounds;                      // → { west, south, east, north } — the *actual* extent
grid.range();                     // → { min, max } metres
[...grid.sources];                // → ['ned13/...'] the real data set behind these tiles
grid.lngLatAt(col, row);          // → [lng, lat] of any sample
grid.forEach((lng, lat, m) => …); // → every sample
grid.toGeoJSON({ step: 8 });      // → FeatureCollection of Points (decimate with step!)
```

How it works:

1. **Which tiles?** Convert the lng/lat box to Web Mercator, multiply by
   2<sup>zoom</sup>, floor — that's the block of `{z}/{x}/{y}` tiles covering
   the box. The mosaic of whole tiles is a bit **bigger** than the box; that's
   fine, `grid.bounds` reports its true extent.
2. **Fetch + decode.** Download the tile PNGs (8 at a time), draw each to an
   `OffscreenCanvas`, `getImageData`, and run the terrarium formula on every
   pixel into one `Float32Array`. `createImageBitmap` is called with
   `colorSpaceConversion: 'none'` so a colour-managed decode can't corrupt
   the packed heights.
3. **Address it.** Longitude is linear across the mosaic, but latitude is
   **not** (Mercator) — so `lngLatAt()` inverse-projects each row rather than
   lerping the north/south bounds, and `elevation()` does the same in reverse
   before a bilinear sample. Naively interpolating latitude between the image
   bounds would be off by tens of metres mid-tile.

Works in any browser. In Deno it needs the `--unstable` canvas API (or swap
`fetchTile` for a PNG decoder). Other encodings: pass
`encoding: 'terrain-rgb'` for Mapbox/MapTiler tiles.

## Design notes: the droplet model

### World-locked lattice, spacing in metres

The droplets live on a fixed lattice in *ground* coordinates over
`MODEL_BOUNDS`, not tied to the viewport — pan or zoom and they stay put.
Each is a persistent object with a home node, a real lng/lat, a real
elevation, a trail, and a `done` flag. Spacing is in **metres** (the unit
the physics wants), and the lattice is anchored to a fixed origin so a node
is the same droplet across slider changes.

An earlier version placed droplets on a *screen-pixel* lattice rebuilt every
frame — fine for browsing, but every droplet was a throwaway, so there was
nothing to simulate.

### Two downhill rules

**`neighbors`** — the AgentScript rule, "D8" in hydrology. Each step, compare
the 8 lattice neighbors and move to the lowest one **strictly below** you;
if none is lower, settle. No distance weighting. Height strictly decreases
so it always terminates. Cheap and faithful, but every step snaps to one of
8 compass directions and is one grid cell long, so on a planar hillside
*every* droplet takes the same diagonal step and you get fields of parallel
45° lines — the classic D8 artifact.

**`vector`** — read the local downhill *direction* off the DEM (sample
elevation `GRAD_PROBE_M` around the droplet, wider than a step so it's a
regional slope not DEM noise), blend it with the droplet's current heading
(`MOMENTUM`, so it coasts over small bumps rather than stopping in every
dimple), and step `VECTOR_STEP_M` that way. The paths curve along the true
fall line and merge into a smooth dendritic drainage network.

Momentum means elevation isn't strictly decreasing (a droplet can be carried
over a small lip), so a droplet settles only when it has gone `STUCK_STEPS`
without reaching a new low that's a real bit (>0.2 m) below its record —
i.e. it's circling a genuine pit, not just easing down a gentle valley
floor. Otherwise it stops at the model edge, or when the run's `runSteps`
budget is spent. An early version used a much tighter "6 non-descending
steps" rule and stranded droplets all over the open hillsides — the loose
"no new low in a long stretch" test keeps them flowing to the channels.

Denser elevation data (`DEM_ZOOM`) barely changes the `neighbors` look — the
8-direction quantization is the cause, not resolution — but it does sharpen
the `vector` streamlines.

### Still open

- **Speed control.** Steps run on a fixed `STEP_MS` (160 ms) timer; `vector`
  mode would benefit most from being able to speed it up. (There's a *run
  length* slider but not yet a *rate* slider.)
- **Pit filling.** `vector` droplets that end in a genuine closed basin just
  stop there; a real flow model would fill the pit and route the overflow
  onward.
- **A fixed domain vs. following the view.** The model region is one box,
  its elevation downloaded once — now movable by **shift-drag**, but still a
  single box. A bigger model would stream tiles as you pan, or decouple a
  dense **simulation lattice** from a decimated **draw set** for the view.
- **Display sensibility.** At 150 m spacing the whole box is ~13 k droplets;
  zoomed out they merge into a smear. Could hide/coarsen the layer once
  on-screen spacing drops below ~a dozen pixels. `circle-radius` already
  eases with zoom.
- **True 3D beads.** Circles are flat decals that always draw on top. Beads
  that stand above the surface and *can* hide behind a ridge would need a
  `fill-extrusion` or model layer — `fill-extrusion` fought us when floated
  above terrain in testing.
- **Tilt** needs no special handling for a world-locked grid — perspective
  just makes far rows read denser, which is honest.

## Where the data comes from

Nothing in this folder is a data file. Everything streams in as you pan and
zoom.

### The base map: OpenFreeMap → OpenMapTiles → OpenStreetMap

[**OpenFreeMap**](https://openfreemap.org/) hosts vector map tiles for the
whole planet, free, no key. We point MapLibre at
`https://tiles.openfreemap.org/styles/positron` for the roads, water, and
labels. Same setup as the `SantaFe` app — see that README for more on vector
tiles.

### The elevation: AWS "Terrain Tiles" (terrarium encoding)

The 3D comes from the [**Terrain Tiles**](https://registry.opendata.aws/terrain-tiles/)
open dataset that Amazon hosts for free (no key, no limits):

```
https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png
```

Each tile is a normal PNG, but it's a *height field*, not imagery. The
**"terrarium"** encoding packs the elevation of each point into the red,
green, and blue channels:

```
height_in_meters = (red * 256) + green + (blue / 256) - 32768
```

MapLibre knows this formula — we just pass `encoding: 'terrarium'` and it
decodes every pixel.

**What one "elevation sample" is.** Every tile is 256×256 pixels and each
pixel is one height sample, laid out on the Web Mercator grid. So the
distance between samples depends only on the tile zoom (and latitude):

| tile zoom | sample spacing near Santa Fe |
|---|---|
| 11 | ~62 m |
| 12 | ~31 m |
| 13 | ~15 m |
| 14 | ~8 m |
| **15** | **~4 m** — the finest the tiles go (`maxzoom: 15`) |
| 16+ | still ~4 m (z15 tiles stretched, no new detail) |

**It changes with zoom.** MapLibre fetches DEM tiles at whatever zoom matches
the map, so zoomed out each sample is an average over a bigger patch of
ground and ridgelines get smoothed. Reading the elevation of one fixed point
at different map zooms shows the drift:

```
map zoom 10 → 3281 m      map zoom 13 → 3218 m
map zoom 11 → 3249 m      map zoom 14 → 3214 m
map zoom 12 → 3223 m      map zoom 15 → 3212 m   (zoom 16+ : frozen at 3211 m)
```

The bottom-right readout reflects this — it interpolates from whatever tiles
are loaded right now.

**The underlying data.** AWS blends several public sources (SRTM, USGS 3DEP,
ETOPO1, …); each tile carries an `x-amz-meta-x-imagery-sources` header saying
which. Around Santa Fe it's `ned13` — USGS's 1/3-arc-second (~10 m) national
elevation model — so even the ~4 m z15 grid is resampled from ~10 m data,
and the honest horizontal resolution is **~10–30 m**. Plenty for terrain
shape; it will smooth over small gullies once droplets are walking it.

The droplet grid does exactly this — it samples elevation from a
[`elevation.js`](#a-standalone-elevation-library-elevationjs) grid fetched
once at a fixed `DEM_ZOOM`, not from `queryTerrainElevation`, so a droplet's
downhill decisions won't change when you zoom the map.

### Coordinates

`center: [-105.80, 35.80]` looks northeast into the range. Santa Fe Baldy
(~3870 m / 12,700 ft) is the high point; the Rio Grande valley to the west
is around 1700 m / 5600 ft.

## Attribution

MapLibre shows it bottom-right: **"MapLibre | Terrain Tiles (AWS Open Data)
| OpenFreeMap © OpenMapTiles — Data from OpenStreetMap."** OpenStreetMap
data is [ODbL](https://www.openstreetmap.org/copyright); the terrain tiles
are public-domain / open sources; MapLibre and OpenFreeMap are MIT/BSD.

## Tweaking ideas

- Change `style` to `.../styles/bright`, `.../styles/liberty`, or
  `.../styles/dark`.
- Raise or lower `EXAGGERATION` (top of `map.js`) — try `1.0` for true
  scale or `2.5` for drama.
- Tint by height: add a `raster` or `background` layer, or color the
  hillshade differently.
- Move `MODEL_BOUNDS` / change `DEM_ZOOM` for a different model region or a
  finer elevation grid; change `STEP_MS`, `VECTOR_STEP_M`, `MOMENTUM`,
  `STUCK_STEPS`; restyle via `circle-color` / the `trails` `line-*` paint.
- Widen the slider range in `index.html` (`min` / `max` on `#spacing`).
- **Add a speed control** — a second slider bound to `STEP_MS`; on change,
  if `timer` is running, `clearInterval` and `setInterval` again.
- **Only run droplets you click** — instead of the whole grid, start a
  droplet at the clicked lng/lat and animate just that one's descent.
- **Colour the trails by how many droplets share them** (accumulation) to
  bring out the main channels.
