# Apps

A collection of small, self-contained HTML/JS apps. Each subfolder is one app —
just open its `index.html` directly in a browser, no build step required
(the one exception is [Progression](Progression/), which `fetch()`es data
files and so needs a local static server — see its README).

## Apps

- [NYC](NYC/) — pannable/zoomable map of New York City using Leaflet + OpenStreetMap. Also live on Deno Deploy: [nyc.backspaces.deno.net](https://nyc.backspaces.deno.net).
- [SantaFe](SantaFe/) — tilted 3D map of downtown Santa Fe using MapLibre GL JS + OpenFreeMap vector tiles (no API key); buildings extruded to their OpenStreetMap heights. See its README for how the data works.
- [Elevation](Elevation/) — 3D terrain map of the Sangre de Cristo mountains above Santa Fe using MapLibre GL JS, draped over AWS "terrain tiles" elevation data (no API key). Press Start and a grid of water droplets walks downhill, tracing the drainage network — switchable between an 8-neighbor rule and a smooth downhill-vector rule. Shift-drag a box to move the droplet grid to any terrain on Earth. Includes `elevation.js` (standalone DEM-tiles-to-lng/lat-grid library) and `regionselect.js` (the shift-drag region picker, shared with Fire). See its README.
- [Fire](Fire/) — a made-up wildfire **progression** spreading over the same 3D terrain as Elevation. Fire steps cell-to-cell, faster uphill and downwind (cell-size/wind/spread-rate sliders), and each cell is shaded by how long ago it burned so the burn scar reads as a progression map; `fire.save()` in the console downloads the per-tick perimeters as a `.geojson` file. Shift-drag a box to burn a ridge in another state. Reuses `elevation.js` and `regionselect.js`. See its README.
- [Progression](Progression/) — scrub a slider through a fire progression: a time-ordered stack of perimeter snapshots, from either a saved Fire run or a real incident's published mapping. Ships with six sample datasets — a Fire run plus five real fires, from NIFC's historic GeoMAC archive, CAL FIRE, and a SimTable time-of-arrival raster (converted from pixels-packing-seconds-since-ignition down to the same dated-polygon shape). Datasets live in [data/](data/), fetched via `data/fetch-progression.js`. See its README for the dataset format and where each one came from.
- [Voronoi](Voronoi/) — click to add/remove points and watch the Voronoi diagram update live. Also live on Deno Deploy: [voronoi.backspaces.deno.net](https://voronoi.backspaces.deno.net).
- [Slideshow](Slideshow/) — hub app with multiple slide decks (HTML-authored and markdown-authored) sharing one nav engine, arrow keys/click/swipe to navigate.
- [ServiceWorkerDemo](ServiceWorkerDemo/) — hands-on look at a service worker's cache-first fetch interception and update lifecycle.
- [CacheDemo](CacheDemo/) — a TTL/dedup/stale-while-revalidate cache built on pluggable backends (in-memory `Map` vs the native CacheStorage/Cache API used directly, no service worker).
- [Blog](Blog/) — built from [Blog-src](Blog-src/) with 11ty; see that folder's README for building/deploying.
- [Schelling](Schelling/) — AgentScript's Schelling segregation model with interactive sliders/plot; hosted as a Deno Deploy Playground, not published via WebDAV like the others (see [DenoDeploy](DenoDeploy/)). Live: [schelling.backspaces.deno.net](https://schelling.backspaces.deno.net).
- [SchellingLive](SchellingLive/) — the same model, but one shared server-side simulation everyone watches and can click on together. Live: [schellinglive.backspaces.deno.net](https://schellinglive.backspaces.deno.net). Also demoable via Deno Deploy's Tunnel feature straight from your laptop: `deno run --tunnel -A server.ts`.

## Shared data

[data/](data/) holds downloadable data files shared across apps, rather than
duplicated per-app — currently the datasets [Progression](Progression/)
scrubs through.

## Publishing

Most apps are published to `https://agentscript.acequia.io/agentscript/apps/`
by a small Deno + WebDAV script that walks each app folder recursively (so any
JS, CSS, images, or data an app adds go up alongside its `index.html`). That
script and its server credentials are kept local, not in this repo.

A few apps are instead hosted as Deno Deploy Playgrounds — noted per app above.
