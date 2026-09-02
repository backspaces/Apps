# How this app was built (with Claude Code)

A narrative record of the build, in the same spirit as the other apps here —
so the team can see what iterative development with Claude Code actually
looks like.

## The ask

> "Add a MapLibre GIS map to our Apps. I have a similar one elsewhere but I
> want one here so we can tweak it differently. Center it on Santa Fe, NM,
> width & height covering downtown. Start it showing the buildings, in 3D if
> that's easy, but simple enough to teach the rest of the team — ease of
> understanding is quite important. Want a README explaining what we're doing
> and how we got our data."

## Decisions made up front

- **New folder `SantaFe/`**, one self-contained `index.html`, matching every
  other app here (`NYC`, `Voronoi`, …). No build step.
- **Base map: OpenFreeMap.** The big question with any web map is "where do
  the tiles come from," and the usual answers (Mapbox, MapTiler) need an API
  key and a signup. OpenFreeMap needs neither — best possible fit for "easy
  to teach" and for a demo that shouldn't rot when a key expires.
- **3D buildings the simple way.** OpenFreeMap's "liberty" style already
  ships a 3D-buildings layer, but using it would hide the mechanism. Instead
  we start from the plain "positron" style and add *one* `fill-extrusion`
  layer ourselves — ~10 lines, and now the team can see exactly how 2D
  footprints become 3D boxes.
- **`maxBounds` instead of just a center.** The ask said "width & height
  covering downtown," so the map is boxed to a downtown rectangle rather
  than free to wander the globe.
- Keep a `moveend` console logger in the file so tuning the view is
  copy-paste, not guesswork.

## What broke, and the fix

**First attempt imported MapLibre from `esm.sh`** (the CDN the other apps
use for Leaflet/d3):

```js
import * as maplibregl from 'https://esm.sh/maplibre-gl@6.6.0';
```

The map frame, controls, scale bar, and attribution all appeared — but the
map itself stayed blank grey. A headless-Chrome screenshot plus the network
log showed the real error:

```
REQFAIL https://esm.sh/maplibre-gl@6.6.0/es2022/maplibre-gl-worker.mjs
        net::ERR_ABORTED
```

MapLibre does its tile parsing in a **Web Worker** loaded from a file sitting
next to the main script. `esm.sh` re-bundles packages and splits them into
its own file layout, and MapLibre's `new URL('./maplibre-gl-worker.mjs',
import.meta.url)` couldn't find the worker in that layout — so tiles were
fetched but never decoded, hence the grey void.

**Fix:** import MapLibre's own untouched bundle straight from `unpkg`:

```js
import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.mjs';
```

`unpkg` serves the package exactly as published, so `maplibre-gl.mjs`,
`maplibre-gl-shared.mjs`, and `maplibre-gl-worker.mjs` all sit together and
resolve. Re-screenshotted: downtown Santa Fe with 3D buildings, the Plaza,
Paseo de Peralta, Canyon Road all where they should be.

**Also worth knowing:** MapLibre v6 dropped its `default` export — it's
named exports only now — so the import is `import * as maplibregl`, not
`import maplibregl`.

## A note that went into the README

Almost every downtown building renders at the same low height. Partly that's
real (Santa Fe's height limit), but mostly it's because few Santa Fe
buildings carry a `height` / `building:levels` tag in OpenStreetMap yet, so
`render_height` falls back to a default. Called out in the README so nobody
thinks the 3D layer is broken.

## Follow-up: split the code out

Second pass moved all the map code from an inline `<script>` into its own
**`map.js`**, loaded with `<script type="module" src="map.js">`. `index.html`
is now just the page shell. The uploader walks the folder recursively, so the
extra file publishes with no changes.

## Follow-up: click a building for its address

> "How would we add clicking on buildings to get the building's data —
> street address and any simple metadata? Do it as simply as possible."

First thing checked: what's actually *in* the tiles. The OpenMapTiles
`building` layer turned out to carry only `render_height`,
`render_min_height`, `colour`, `hide_3d` — no name, no address. So "as
simply as possible" still needs two sources:

- **height** → read straight off the clicked feature MapLibre hands to the
  `map.on('click', 'buildings-3d', …)` handler. Free, instant.
- **address** → one `fetch` to **Nominatim** (`/reverse?lat=&lon=`),
  OpenStreetMap's reverse geocoder. Returns `house_number`, `road`, `city`,
  `postcode`, `display_name`.

The popup opens immediately with "Looking up address…" and is rewritten
when the fetch resolves, so it never feels frozen. Added a
`mouseenter`/`mouseleave` cursor swap so buildings read as clickable.
Deliberately **not** on hover — Nominatim's usage policy is ~1 req/sec.

Tested by firing a click through MapLibre's API at a known building in
headless Chromium: popup came back *"201 West Marcy Street, Santa Fe 87501,
TOURISM Santa Fe, height ≈ 5 m"* — which is the actual visitor center.

## Follow-up: a list of every building + its data

> "How could I get a list of all the buildings and their data?"

Key realization for the team: there are **three tiers** of building data
here, increasingly rich and increasingly work to get.

1. **Vector tiles** (what `map.js` uses) — height only, no names/addresses.
2. **Nominatim** (the click handler) — address for *one* point at a time.
3. **Overpass API** — the whole set. You send it a query, it returns every
   matching OSM element with *every* tag.

Added [`fetch-buildings.js`](fetch-buildings.js), a Deno script that runs one
Overpass query for the downtown box (same bbox as the map) and writes
`buildings.geojson` (full tags + polygons) and `buildings.csv` (common
columns). README also shows the point-and-click route via overpass-turbo.eu.

**Gotcha:** Deno's `fetch` to Overpass returned **406 Not Acceptable** until
an explicit `Content-Type: application/x-www-form-urlencoded` header was
added to the POST. With that it returns ~5,000 downtown buildings.

Result confirms why the 3D map looks flat: of ~5,000 buildings only ~13 have
an explicit `height` tag and ~300 a floor count. The landmark buildings are
well tagged though — Loretto Chapel comes back with height, `start_date`
1878, opening hours, and a Wikipedia link.

## Verifying

Checked by serving the folder and screenshotting it in headless Chromium
with software WebGL (`--enable-unsafe-swiftshader`), since a plain headless
browser has no GPU. The `deno -A uploadApps.js SantaFe` publish step is
unchanged — the uploader just walks the new folder.
