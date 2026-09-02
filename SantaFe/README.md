# SantaFe

A tilted, 3D map of **downtown Santa Fe, NM** built with
[MapLibre GL JS](https://maplibre.org/) — an open-source library that renders
vector map tiles on the GPU, so you can pan, zoom, rotate, and tilt smoothly.

Open `index.html` in a browser. No build step, no API key.

- **Drag** to pan
- **Scroll / pinch** to zoom
- **Right-drag** (or **Ctrl-drag**) to rotate and tilt
- The top-right buttons do the same, plus a "reset north / flatten" button
- **Click a building** for a popup with its street address and height

Live: https://agentscript.acequia.io/agentscript/apps/SantaFe/

We already have a similar map elsewhere; this copy exists so we can tweak it
on its own without disturbing that one.

## What the code does

`index.html` is just the page shell (a `#map` div, a caption box, and a
`<script type="module" src="map.js">`). All the map code is in **`map.js`**.
Reading it top to bottom:

1. **Load MapLibre** — one CSS file and one ES-module `import`, both from a
   CDN (`unpkg`). That's the entire dependency.

2. **Create the map** (`new maplibregl.Map({...})`):
   - `style` — a URL to a *style JSON*, which describes the entire look of the
     base map (colors, fonts, which roads appear at which zoom). We use
     OpenFreeMap's free **"positron"** style (clean and light).
   - `center` — `[longitude, latitude]` of the Santa Fe Plaza.
     ⚠️ MapLibre uses `[lng, lat]`; Leaflet (in our `NYC` app) uses `[lat, lng]`.
   - `zoom`, `pitch` (camera tilt), `bearing` (camera rotation).
   - `maxBounds` — a rectangle the map can't pan outside of. Ours is a loose
     box around downtown (Railyard up to Marcy St, Guadalupe St across to
     Paseo de Peralta), so the demo stays pointed at the neighborhood.

3. **Add controls** — the zoom/compass/tilt buttons and a distance scale.

4. **Add the 3D buildings** — after the base style loads (`map.on('load', …)`):
   - The positron style draws flat grey building shapes in a layer literally
     named `"building"`. A style is just an ordered list of layers, so we
     `removeLayer('building')` and add our own.
   - Our layer is `type: 'fill-extrusion'` — that takes each building's
     footprint polygon and pushes it up into a 3D box.
   - `fill-extrusion-height: ['get', 'render_height']` sets each box's height
     in **meters** from a data field called `render_height` (see below).

5. **Click a building for info** (`map.on('click', 'buildings-3d', …)`):
   - MapLibre hands us the clicked feature, so its **height** is available
     instantly from the tile data.
   - The tiles carry *no* street address, so for that we make one call to
     [**Nominatim**](https://nominatim.org/), OpenStreetMap's free reverse
     geocoder — "what's at this lat/lng?" — and show `house_number + road`,
     town/postcode, and any place name it knows.
   - A `maplibregl.Popup` opens immediately with "Looking up address…" and
     is filled in when the geocoder responds.
   - `mouseenter`/`mouseleave` on the layer switch the cursor to a pointer
     so buildings look clickable.

6. **A `moveend` logger** — prints the current `center / zoom / pitch / bearing`
   to the browser console whenever you stop moving the map. Handy while
   tuning: pan/tilt to a view you like, copy the numbers back into step 2.

That's it. ~60 lines of real code, the rest is comments.

### About the click data

The building's own record in the vector tiles is tiny — `render_height`,
`render_min_height`, `colour`, `hide_3d`, and nothing else. No name, no
address. That's why the address comes from a separate Nominatim lookup
keyed on the click location rather than from the building feature itself.
Nominatim asks callers to keep it to roughly **one request per second** and
not to hammer it in bulk — clicking is well within that, but it's why this
isn't wired to run on hover.

## Where the data comes from

There is **no data file in this folder.** Everything is fetched live as you
pan and zoom.

### The base map and the buildings: OpenFreeMap → OpenMapTiles → OpenStreetMap

- [**OpenFreeMap**](https://openfreemap.org/) hosts **vector tiles** for the
  whole planet, for free — no registration, no API key, no usage limits. We
  point MapLibre at `https://tiles.openfreemap.org/styles/positron` and it
  pulls in map tiles as needed.
- A *vector tile* isn't a picture — it's a small packet of **geometry**:
  road lines, water polygons, building footprints, place labels, each with
  attributes. MapLibre draws them in the browser, which is why we can
  restyle buildings on the fly.
- OpenFreeMap's tiles use the [**OpenMapTiles**](https://openmaptiles.org/)
  schema. In that schema every building footprint lives in a layer called
  `building`, and the tile-builder pre-computes two fields we use:
  - `render_height` — the building's height in meters. It comes from the
    OpenStreetMap `height` tag if present; otherwise it's estimated from
    `building:levels` (≈3 m per floor); otherwise it falls back to a small
    default.
  - `render_min_height` — how far off the ground the building starts
    (nonzero only for things like raised walkways). Almost always 0 here.
- The footprints and tags ultimately come from
  [**OpenStreetMap**](https://www.openstreetmap.org/), the crowd-sourced map
  of the world.

### Why most downtown buildings look the same low height

Santa Fe has a strict building-height limit and most of downtown really is
one or two stories — but also, **relatively few Santa Fe buildings have a
`height` or `building:levels` tag in OpenStreetMap yet.** Those fall back to
the default height. If we wanted taller, more accurate buildings we'd either
wait for OSM to improve, or bring in another dataset (e.g. a county
assessor's building layer, or Overture Maps building heights) and join it in.

### The click-a-building address: Nominatim

[**Nominatim**](https://nominatim.org/) is the search/geocoding service that
also powers the search box on openstreetmap.org. Its `/reverse` endpoint
takes a lat/lng and returns the nearest address, broken into parts
(`house_number`, `road`, `city`, `postcode`, …) plus a one-line
`display_name`. Same underlying OpenStreetMap data as the map itself, just
queried by location instead of drawn as tiles. Free, no key; the public
server just asks that you keep the volume low (see note above).

### Coordinates of the Plaza

`center: [-105.9377, 35.6870]` — the Santa Fe Plaza. Read off
OpenStreetMap / Google Maps by dropping a pin; precise to a few meters,
which is plenty for a starting view.

## Getting the full list of buildings

The map itself only ever sees the few fields baked into the vector tiles.
To pull **every building downtown with all its OpenStreetMap tags** — names,
addresses, floor counts, build dates, websites, Wikidata links — you query
OpenStreetMap directly through the [**Overpass API**](https://overpass-api.de/).
You send it a small query; it returns the matching OSM elements.

**The interactive way:** open <https://overpass-turbo.eu>, paste this, hit Run:

```overpassql
[out:json][timeout:180];
nwr["building"]({{bbox}});
out geom;
```

Pan/zoom the mini-map to downtown Santa Fe first (`{{bbox}}` means "current
view"). You get a table you can browse and an "Export" button (GeoJSON, CSV,
GPX…).

**The scripted way:** [`fetch-buildings.js`](fetch-buildings.js) runs the same
query for our fixed downtown box and saves the results:

```sh
deno -A fetch-buildings.js
```

It writes two files (regenerate any time; they're not hand-edited):

| File | What's in it |
|---|---|
| `buildings.geojson` | ~5,000 building polygons, every tag kept — load straight into MapLibre, QGIS, geojson.io |
| `buildings.csv` | one row per building, just the common columns (name, address, levels, height, amenity, historic, start_date, wikidata) |

Coverage is uneven because it's crowd-sourced: of ~5,000 downtown buildings,
roughly 400 have a street address, 300 a floor count, only ~13 an explicit
`height`, and ~230 a name. The famous ones are richly tagged (Loretto
Chapel: height, build date 1878, opening hours, Wikipedia link).

To draw this file on the map instead of the tile buildings, add it as a
GeoJSON source and point a `fill-extrusion` layer at it (see Tweaking ideas).

## Attribution

MapLibre shows it automatically in the bottom-right:
**"OpenFreeMap © OpenMapTiles — Data from OpenStreetMap."** OpenStreetMap
data is [ODbL](https://www.openstreetmap.org/copyright); MapLibre and
OpenFreeMap are MIT/BSD. The click-to-lookup addresses also come from
OpenStreetMap, via Nominatim, under the same ODbL terms.

## Tweaking ideas

- Change `style` to `.../styles/bright`, `.../styles/liberty`, or
  `.../styles/dark` for a different base look.
- Color buildings by height: replace the flat `fill-extrusion-color` with an
  `['interpolate', ['linear'], ['get', 'render_height'], 0, '#ddd', 30, '#c33']`
  expression.
- Add `map.setLight({ anchor: 'viewport', position: [1.5, 90, 45] })` to
  change the sun angle / shadows on the buildings.
- Drop a marker on a specific address with `new maplibregl.Marker()`.
- Draw the real buildings from `buildings.geojson` (see "Getting the full
  list of buildings"):
  ```js
  map.addSource('osm-buildings', { type: 'geojson', data: 'buildings.geojson' });
  map.addLayer({
    id: 'osm-buildings-3d', type: 'fill-extrusion', source: 'osm-buildings',
    paint: {
      'fill-extrusion-color': '#d9cbb3',
      // levels -> meters (~3 m each) when there's no explicit height
      'fill-extrusion-height': ['*', 3, ['to-number', ['coalesce', ['get', 'building:levels'], 1]]],
    },
  });
  ```
