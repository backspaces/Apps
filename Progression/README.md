# Progression

A **fire progression scrubber**: drag a slider (or press Play) to step
through a time-ordered stack of perimeter snapshots on real 3D terrain,
built with [MapLibre GL JS](https://maplibre.org/).

Open `index.html` in a browser via a local static server (see "Running
locally" below) — no build step, no API key.

- Pick a **dataset** from the dropdown.
- Drag the **frame** slider, or press **Play** (speed adjustable).
- The bright outline is the current perimeter; the faint trail behind it
  is where the fire has already been.
- **Drop a `.geojson` progression file onto the map** to add and scrub it
  on the spot — see "Loading your own file" below.

## The datasets

Six are wired up out of the box, all loaded from `../data/` (a folder
shared with any other app in this repo that wants a downloadable data
file, so it isn't duplicated per-app):

| dataset | source | shape |
|---|---|---|
| `data/fire-santafe-sample.geojson` | a saved run of the sibling [Fire](../Fire/) app's made-up cellular spread model — `fire.save()` in its console | 120 `MultiLineString` perimeters, keyed by `tick` |
| `data/palisades-2025-progression.geojson` | CAL FIRE's official progression mapping for the January 2025 Palisades Fire (LA), pulled from their public ArcGIS feature service | 11 `MultiPolygon` snapshots, keyed by `PROG_DATETIME`, 770 → 23,717 acres over 5 days |
| `data/camp-fire-2018-progression.geojson` | NIFC's historic GeoMAC archive, the November 2018 Camp Fire (CA) | 28 `MultiPolygon` snapshots, keyed by `perimeterdatetime`, 54,586 → 153,336 acres |
| `data/las-conchas-2011-progression.geojson` | NIFC's historic GeoMAC archive, the June–July 2011 Las Conchas Fire (Jemez Mountains, NM) | 29 `MultiPolygon` snapshots, keyed by `perimeterdatetime`, 43,641 → 156,656 acres |
| `data/dog-head-2016-progression.geojson` | NIFC's historic GeoMAC archive, the June 2016 Dog Head Fire (NM) | 18 `MultiPolygon` snapshots, keyed by `perimeterdatetime`, 682 → 17,911 acres |
| `data/powder-fox-tartar-2026-progression.geojson` | SimTable's time-of-arrival raster for the Jul–Aug 2026 Powder/Fox/Tartar Fire Complex (OR), converted to polygons | 58 `MultiPolygon` frames, keyed by `utcMs`, one per real report time |

All six are just "one GeoJSON feature per moment in time" — a real fire
progression is nothing more than that, whether the moment is a simulation
tick or a calendar date. `progression.js`'s `DATASETS` registry describes,
per dataset, how to sort its features and how to read a caption/acreage out
of each one's properties — that's the only per-dataset code. Add another
dataset by adding one entry there (and dropping its `.geojson` file in
`../data/`).

### Getting a Fire sample of your own

From the [Fire](../Fire/) app's console, after a run:

```js
fire.save('my-run.geojson')
```

then move the download into `Apps/data/` and add an entry to `DATASETS` in
`progression.js`.

### Loading your own file

Editing `DATASETS` isn't the only way in — **drop any progression
`.geojson` file directly onto the map** and it loads immediately, no code
change needed. This is for trying out something you (or a friend at
SimTable, say) found without it becoming a permanent registry entry first.

There's a real limitation this way: a dropped file has no hand-written
`sortKey`/`caption`/`acres` to go by, so `progression.js` guesses instead —
the first property whose *name* contains "date", "time", or "tick" (and
whose value actually parses as one) becomes the sort/caption key; the first
property containing "acre" becomes the displayed acreage. Tested against
all five bundled datasets and it picks the right sort field every time,
though for a file with several acreage-like columns (Palisades has three:
daily/total/GIS acres) it just takes the first match, which won't always
be the one you'd have picked by hand. No date-like field at all, and it
falls back to plain feature order with a bare "frame N" caption — still
scrubbable, just less labeled. Good enough for a quick look; promote it to
a real `DATASETS` entry (with `../data/fetch-progression.js` if it came
from an ArcGIS FeatureServer) once you know it's a keeper.

It's all native `DragEvent`/`File` browser APIs — no library, so this adds
about 60 lines to `progression.js` and nothing else.

### Where the real data came from

Actually pulling and cleaning up a dataset is `../data/fetch-progression.js`'s
job (see [data/README.md](../data/README.md)) — what follows is where to
*find* one.

WFIGS/NIFC's "current" and "year-to-date" perimeter services only keep the
*latest* known perimeter per incident — confirmed by querying them
directly, not just reading their description. Three other kinds of source
actually carry multiple dated snapshots per fire, in order of how likely
they are to have what you're after:

1. **NIFC's historic GeoMAC archive, 2000–2019** — one FeatureServer per
   fire-year, each a flat table of every dated perimeter reported that year
   for every incident. The best general-purpose source *for that window*:
   any fire from 2000–2019 is one `where=incidentname='...'` query away.
   Camp Fire, Las Conchas, and Dog Head all came from here:
   ```
   https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Historic_Geomac_Perimeters_<year>/FeatureServer/0/query
     ?where=incidentname='<NAME>'
     &outFields=incidentname,perimeterdatetime,gisacres,state
     &orderByFields=perimeterdatetime ASC
     &outSR=4326
     &maxAllowableOffset=0.0001
     &f=geojson
   ```
   (`maxAllowableOffset` asks the server to generalize the geometry — these
   old perimeters are full-precision infrared-flight boundaries; 0.0001°
   cut Camp Fire from 24.6 MB to 1.5 MB with no visible loss at map scale.
   Acreage properties are untouched by it, only the geometry.) Note: 2019's
   service is spelled `Historic_GeoMAC_Perimeters_2019` (capital MAC),
   every other year is `Historic_Geomac_Perimeters_<year>`.

   Two ways to find the right incident name: browse
   [data-nifc.opendata.arcgis.com's `fire_progression_opendata` tag search](https://data-nifc.opendata.arcgis.com/search?tags=fire_progression_opendata%2CCategory)
   (it also turns up a handful of one-off *single-snapshot* items from
   specific 2016 NM fires — e.g. "Dog Head Fire Progress 17th Brief" is one
   dated perimeter, not a progression; the same fire's real multi-snapshot
   progression is sitting in the 2016 year-archive instead, found the
   normal way), or query a year's distinct `incidentname` values directly.

2. **One-off agency feature services**, published during/after a specific
   large fire *outside* the GeoMAC archive's 2000–2019 window (or never fed
   into it) — the only option for anything recent. Palisades is one of
   these — CAL FIRE's own service, found via ArcGIS Online search:
   ```
   https://services.arcgis.com/xsiPoFK0f7RrxF0D/arcgis/rest/services/Palisades_Fire_Progression/FeatureServer/0/query
     ?where=1=1
     &outFields=PROG_DATETIME,PROG_DATE,PROG_TIME,PROG_DAILY_ACRES,PROG_TOTAL_ACRES,PROG_GIS_ACRES
     &orderByFields=PROG_DATETIME ASC
     &outSR=4326
     &f=geojson
   ```
   These have to be found per-incident (ArcGIS Online search for
   `"<name> Fire Progression"` / `"... Time Enabled"` / `"... Daily
   Perimeters"`) and aren't guaranteed to exist for any given fire — there's
   no index of them the way GeoMAC indexes 2000–2019. Checked directly for
   the August 2026 Frijoles Fire (Santa Fe NF, NM) and found nothing yet;
   NM State Forestry has published a couple of these after-the-fact before
   (Hermits Peak/Calf Canyon, Cerro Pelado — both months after containment),
   so it may still show up in `gis.emnrd.nm.gov`'s `SFDView` folder later.
   Failing that, a Type 1 incident's GISS unit usually has daily perimeter
   shapefiles even when nothing's public — worth asking about directly.

3. **A modeling group's own output**, if you know someone running
   simulations — ask directly, the way you'd ask a Type 1 incident's GISS
   unit. SimTable (who this app is themed around — they're Santa Fe
   locals) shared a real one this way: not dated perimeter vectors at all,
   but a single **time-of-arrival raster** — a PNG where every pixel's
   color packs a seconds-since-ignition value, plus a JSON sidecar with the
   georeferencing and the incident's real report times/acreage to check it
   against. `fetch-progression.js`'s `kind: "toa-raster"` handles this shape
   (decode, downsample, threshold at each real report time) — see its
   `SOURCES` entry and [data/README.md](../data/README.md) for how. Worth
   asking for specifically if a contact has simulation output: a raster
   like this is denser and more precise than any dated-perimeter vector
   source above, and converts down to the same shape this app already
   expects.

If none of that turns anything up, satellite active-fire detections (NASA
FIRMS, free, global, always current) are a fallback of last resort: not
clean perimeters, but daily hotspot points you could cluster into an
approximate growth footprint for literally any fire, anywhere, with no
agency having to have published anything.

## Running locally

The app `fetch()`es its datasets from `../data/`, which — unlike the
same-origin tile/DEM requests Fire and Elevation make — doesn't work over
`file://` in most browsers (no origin to satisfy CORS against; confirmed by
just double-clicking `index.html`). Serve the repo root instead — either
works, both are on `localhost` so nothing else needed:

- **VSCode's "Go Live"** (port 5501) — Owen's usual local server; right-click
  `Progression/index.html` → Go Live, or click "Go Live" in the status bar
  from anywhere in the repo.
- **`python3 -m http.server`** — no editor needed:
  ```sh
  cd Apps            # the repo root, one level up from Progression/
  python3 -m http.server 8000
  ```
  then visit `http://localhost:8000/Progression/`.

The published copy (see the top-level README's "Publishing" section) is
served over real HTTP, so this is only a local-testing wrinkle.

## How a frame is drawn (`progression.js`)

Every dataset entry normalizes its GeoJSON into a `frames` array — one
`{ feature, caption, acres }` per moment, sorted by that dataset's
`sortKey`. The frame slider just indexes into it:

- **`current-line`** — the active frame's outline (a MapLibre `line` layer
  draws a Polygon/MultiPolygon's boundary just as readily as a
  MultiLineString, so this works for either dataset shape unchanged).
- **`current-fill`** — a translucent fill, only populated when the frame's
  geometry is a Polygon/MultiPolygon (Fire's own `MultiLineString`
  perimeters have no interior to fill).
- **`trail-line`** — every earlier frame's outline, redrawn each step with
  an `age` property so `line-opacity` can fade it out via an
  `interpolate` expression — the "where it's already been" ghost trail.

On load (and on switching datasets), the map bounding-box-fits to the
union of all of that dataset's coordinates, walked recursively so it
doesn't care about geometry type — that's how the same app can open on the
Sangre de Cristo range for the Fire sample and fly to Los Angeles for
Palisades.

## Tweaking ideas

- **Run Fire live, then scrub it** — the obvious next step: embed Fire's
  own spread model directly in this app (it's just `fire.js`'s section 4)
  so you can press Start, let it run, and then immediately drag the frame
  slider over the run you just made, no save/reload round-trip.
- **A calendar-aware timeline** instead of a plain frame index, for
  datasets keyed by a real date — tick marks at day boundaries, say.
- **More real incidents** — `../data/fetch-progression.js` (see its
  README) pulls and cleans up any historic-GeoMAC or agency-published
  incident the same way: `maxAllowableOffset` for oversized geometry,
  `dissolveByDate` for incidents that report several disjoint polygons per
  date instead of one. Tried it against Hermits Peak/Calf Canyon (2022's NM
  megafire in this same mountain range, ~500 pieces across 37 days) and the
  mechanics check out (down to 37 frames / 3.3 MB), but its acreage
  attribute doesn't hold up against the fire's real recorded size — see the
  script's `SOURCES` comment before trusting that one.
