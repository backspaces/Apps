# Fire

A made-up **wildfire progression** spreading over real 3D terrain — the
Sangre de Cristo range above Santa Fe, NM — built with
[MapLibre GL JS](https://maplibre.org/).

Open `index.html` in a browser. No build step, no API key.

- **Drag** to pan, **scroll / pinch** to zoom
- **Right-drag** (or **Ctrl-drag**) to tilt and rotate; the top-right
  buttons do the same, plus a **3D-terrain toggle** (the mountain icon)
- Press **Start**. A fire lit in the middle of the model region spreads
  cell-to-cell — **faster uphill and downwind** — and every cell is shaded
  by **how long ago it burned**, so the growing burn scar reads as a
  **progression map**: bright active front, then a warm-to-dark ramp back
  toward the ignition point. The thin bright line is the current
  **perimeter**.
- **Click the map** to move the ignition point and restart there
- **Shift-drag** a rectangle to move the whole model region (the dashed
  orange box). No `maxBounds` — pan and zoom anywhere first, then burn a
  ridge in another state. The elevation for the new box downloads on
  release.
- Controls: **cell size** (grid resolution, like the Elevation app's droplet
  spacing), **wind direction** and **strength**, **spread rate**, and
  **run length** (the step budget). **Reset** relights from scratch.
- The bottom-right box shows elapsed time and area burned; the bottom-left
  box is the colour key.

There is **no data file** in this folder. The base map and elevation stream
in as you pan; the fire is generated in the browser.

## The idea

A real fire *progression* is nothing fancy: a time-ordered stack of
perimeter polygons — the fire's edge as of T1, T2, T3, … — either animated
or drawn all at once, colour-coded by time. Official ones (NIFC's WFIGS,
formerly GeoMAC) come from infrared flights, ~once or twice a day, as
time-stamped GeoJSON/shapefile. Simulation output (FARSITE/FlamMap, or an
agent-based model) is the same shape but indexed by *elapsed time / tick*
rather than a calendar date.

This app makes up that second kind. It's a sibling to the **Elevation** app
next door: same terrain setup, same world-locked model region, same
`elevation.js` DEM helper, same `regionselect.js` shift-drag. Where
Elevation walks water **downhill**, this walks fire **uphill and downwind**.

## The spread model (`fire.js`, section 4)

A square grid of cells over the `MODEL_BOUNDS` box, at `cellSizeM` (160 m by
default, 80–400 m from the **cell size** slider). Each cell is `UNBURNED`,
`BURNING`, or `BURNED`, and remembers the tick it caught (`litAt`). One
ignition cell starts `BURNING` at tick 0. Changing the cell size calls
`resize()` (recomputes the lattice) and relights; a **shift-drag** calls
`setRegion()` + `loadRegion()` (re-points the box, re-downloads the
elevation, relights). The ignition point is stored in lng/lat, so it stays
put across a resize (and is dropped if a new region doesn't contain it).

Each tick, every `BURNING` cell rolls a die against each of its 8
`UNBURNED` neighbours. The ignition probability is

```
p = RATE  ×  slopeFactor  ×  windFactor  /  distance
```

| term | value | effect |
|---|---|---|
| `RATE` | the *spread-rate* slider | base rate per neighbour per tick |
| `slopeFactor` | `exp(SLOPE_COEF × grade)` | `grade` = rise/run to the neighbour; **uphill speeds spread up, downhill slows it** — the dominant control on a real fire's shape |
| `windFactor` | `exp(WIND_COEF × strength × alignment)` | `alignment` ∈ [−1, 1] is how well the step direction lines up with the wind; **downwind faster, upwind slower** |
| `distance` | 1 or √2 | diagonal neighbours are farther, so less likely |

`grade` comes from the same `elevation.js` grid the Elevation app uses,
sampled **once** for the whole box on load — so a cell's uphill/downhill
decision never shifts when you zoom the map.

A `BURNING` cell burns out to `BURNED` after `RESIDENCE` (4) ticks and stops
spreading — that's what keeps the fire an expanding *ring* of activity with
a cooling interior, rather than a solid disc that lights everything at once.
A run ends when nothing is burning or the `maxTicks` budget is spent.

It's a toy — no fuel model, no moisture, no spotting, not Rothermel — but
the two knobs that actually shape a fire's footprint (slope and wind) are
in, so the scar comes out as a wind-and-terrain-driven **ellipse**, not a
circle. Turn the wind to **calm** and light it on a slope to see terrain
alone; crank the wind to see it stretch downwind.

## Drawing it as GeoJSON (`fire.js`, section 5)

Two MapLibre `geojson` sources, refed every tick:

- **`burn`** — the burned/burning cells. Each cell falls into one of **6 age
  bands** by `tick − litAt`, and each band is drawn as **one `MultiPolygon`
  feature** with a "cooling embers" colour (`#ffd24a` bright front →
  `#2b1410` char). Cells in a row are merged into runs first — thousands of
  unit squares re-tessellated on 3D terrain every tick is the slow path;
  a few hundred row-rectangles look identical at this scale. As the bands
  grow outward they *are* the progression map.
- **`perimeter`** — every cell face between a burnt cell and a non-burnt
  one, as a single `MultiLineString`. No polygon library needed, and it's
  exactly the fire's current perimeter.

Both are drawn as flat overlays on the terrain (a `fill` and a `line`
layer) — they drape over the 3D surface and are never hidden behind a
ridge.

## The progression it produces

Every tick, `fire.js` pushes one perimeter snapshot — a GeoJSON `Feature`
with `{ tick, minutes, acres }` and a `MultiLineString` geometry — onto an
array. That array **is a fire progression** in the usual sense: a
time-ordered stack of perimeters, keyed by tick instead of an ISO date.

From the browser console:

```js
fire.progression()          // → FeatureCollection of the per-tick perimeters
fire.save()                 // downloads it as fire-progression-tick<N>.geojson
fire.save('my-run.geojson') // ...or pick the filename
fire.state()                // → { tick, burning, burnt }
fire.step()  fire.reset()   // drive it by hand
map.getPitch()              // the map is on window.map too
```

To turn the perimeters into filled progression **polygons** (the WFIGS
shape), run each snapshot's segments through
[`turf.polygonize`](https://turf.js.org/docs/api/polygonize) — load Turf
from a CDN, no build step. Left as an exercise; the `MultiLineString`
perimeter is enough to draw and to animate.

## Where the data comes from

Same sources as the **Elevation** app — see its README for the details:

- **Base map** — [OpenFreeMap](https://openfreemap.org/) "positron" vector
  tiles (→ OpenMapTiles → OpenStreetMap), free, no key.
- **Elevation** — AWS [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)
  in "terrarium" encoding (height packed into RGB), free, no key. Around
  Santa Fe the underlying data is USGS `ned13` (~10 m), resampled — plenty
  for the terrain shape driving fire spread. The tiles are global, so
  shift-drag works anywhere; `pickDemZoom()` in `regionselect.js` chooses
  the tile zoom so the download stays bounded however large a box you draw.

MapLibre shows attribution bottom-right.

## Tweaking ideas

- **Wind that turns** — animate `windVec` over the run instead of taking it
  from a fixed selector.
- **Non-uniform fuel** — multiply `RATE` per cell by a fuel raster (or a
  land-cover tile), so the fire slows in rock and races through grass.
- **Spotting** — with a small probability, ignite a cell several rows
  downwind of the front.
- **Filled progression polygons** — `turf.polygonize` per snapshot, stored
  as `Polygon` features with `{ tick }`, drawn with a time filter
  (`['<=', ['get', 'tick'], playhead]`) and a playhead slider — the exact
  Leaflet.TimeDimension / WFIGS animation pattern.
- **Real perimeters** — swap the made-up fire for WFIGS GeoJSON: point a
  source at an incident's Esri feature service and step the `poly_DateCurrent`
  field.
- Change the starting `MODEL_BOUNDS` / widen the **cell size** slider range
  (`#cell` in `index.html`) / change `RESIDENCE`, `SLOPE_COEF`, `WIND_COEF`,
  `STEP_MS`; restyle via `BAND_COLOR` and the `perimeter` `line-*` paint.
