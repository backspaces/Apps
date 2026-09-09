// Import MapLibre as an ES module from a CDN — same "no build step" idea as
// the other apps in this repo. We load MapLibre's own bundle straight from
// unpkg (not a re-bundler like esm.sh) because MapLibre also fetches a Web
// Worker file that has to sit next to this one, and unpkg serves it unchanged.
//
// MapLibre v6 has only named exports, so we pull them all in under one name
// and use maplibregl.Map, maplibregl.NavigationControl, ...
import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.mjs';

// Our own tiny, dependency-free helper for pulling the DEM tiles down and
// decoding them into a lng/lat-addressable elevation grid. Not used by the
// map yet — it's here for the droplet model, and to poke at from the console.
import { fetchElevation } from './elevation.js';

// Shift-drag a rectangle to move the droplet model region somewhere else
// (replaces MapLibre's native shift-drag box-zoom). See regionselect.js.
import { onRegionSelect, pickDemZoom, boundsRing } from './regionselect.js';

// MapLibre's controls and popups need its stylesheet. We add it here so
// everything MapLibre needs is declared in one file. Same pinned version.
document.head.insertAdjacentHTML(
  'beforeend',
  '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.css">'
);

// --- 1. The map itself -------------------------------------------------

// Looking at the Sangre de Cristo range from the southwest: Santa Fe Baldy
// (~3870 m / 12,700 ft) and the upper Santa Fe river watershed dropping
// toward the city (~2130 m / 7000 ft). Lots of relief = good for watching
// water run downhill later. MapLibre uses [lng, lat] order.
const CENTER = [-105.80, 35.80];

const map = new maplibregl.Map({
  container: 'map',

  // The "style" is the whole look of the base map. "positron" is a clean,
  // light style hosted for free by OpenFreeMap — no API key, no signup.
  // We'll drape hillshading over it below.
  style: 'https://tiles.openfreemap.org/styles/positron',

  center: CENTER,
  zoom: 10.9,
  pitch: 60,        // tilt the camera so the terrain reads as 3D
  bearing: -18,
  // No maxBounds — pan anywhere and shift-drag a new model region (a
  // watershed in another state, say). minZoom stays low enough to travel.
  minZoom: 3,
  maxZoom: 16,
  maxPitch: 80,
});

// Zoom / compass / tilt buttons, and a distance scale.
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

// --- 2. The elevation data ("DEM") -----------------------------------

// A DEM — Digital Elevation Model — is a raster where each pixel's *color*
// encodes a height, not a picture. These "terrarium" tiles pack the height
// into the R/G/B channels: height = R*256 + G + B/256 - 32768 (meters).
// They cover the whole planet, free, no key — AWS hosts them as open data.
const DEM_SOURCE = 'terrain-dem';

// Vertical stretch applied to the 3D view so this fairly gentle range reads
// as mountains. It's a display choice only — it scales every height equally,
// so "which way is downhill" is unaffected. We divide it back out when we
// report a real-world elevation to the user.
const EXAGGERATION = 1.4;

map.on('load', () => {
  map.addSource(DEM_SOURCE, {
    type: 'raster-dem',
    tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 15,
    attribution:
      '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles (AWS Open Data)</a>',
  });

  // 2a. Push the map's surface up into real 3D using that DEM. Exaggeration
  //     stretches the vertical scale so modest hills read clearly.
  map.setTerrain({ source: DEM_SOURCE, exaggeration: EXAGGERATION });

  // 2b. Shade the slopes (light from the northwest, the cartographic norm).
  //     Inserting it just under the first text layer keeps place labels on top.
  const firstLabel = map.getStyle().layers.find(
    (l) => l.type === 'symbol' && l.layout && l.layout['text-field']
  );
  map.addLayer({
    id: 'hillshade',
    type: 'hillshade',
    source: DEM_SOURCE,
    paint: {
      'hillshade-exaggeration': 0.6,
      'hillshade-shadow-color': '#5a4a3a',
      'hillshade-highlight-color': '#ffffff',
    },
  }, firstLabel && firstLabel.id);

  // 2c. A sky so the tilted horizon isn't just grey void.
  map.setSky({
    'sky-color': '#8fb8de',
    'horizon-color': '#e6eef5',
    'fog-color': '#e6eef5',
    'sky-horizon-blend': 0.5,
    'horizon-fog-blend': 0.5,
  });
});

// The dedicated 3D-terrain toggle button (top-right, under the compass).
map.addControl(
  new maplibregl.TerrainControl({ source: DEM_SOURCE, exaggeration: EXAGGERATION }),
  'top-right'
);

// --- 3. Read the ground elevation ------------------------------------

// map.queryTerrainElevation(lngLat) returns the height of the terrain
// surface at a point, sampled from the same DEM the 3D view uses — and with
// the same EXAGGERATION baked in, so we divide that back out for a true
// height. This is exactly the primitive the droplet model will need: "how
// high is the ground here, and at each of my neighbors?"
const elevBox = document.getElementById('elev');

function groundElevation(lngLat) {
  const raw = map.queryTerrainElevation(lngLat);
  return raw == null ? null : raw / EXAGGERATION;
}

map.on('mousemove', (e) => {
  const m = groundElevation(e.lngLat);
  if (m == null) { elevBox.textContent = 'elevation: (loading tiles…)'; return; }
  elevBox.textContent =
    `${e.lngLat.lng.toFixed(4)}, ${e.lngLat.lat.toFixed(4)}  →  ` +
    `${m.toFixed(0)} m / ${(m * 3.28084).toFixed(0)} ft`;
});

// --- 4. The droplets -----------------------------------------------

// A world-locked grid of water droplets over a fixed patch of terrain (the
// "model region"). Each droplet has a real lng/lat and a real ground
// elevation, sampled from an elevation.js grid we download once. Every step
// each un-settled droplet moves a bit downhill; when it can't go lower it
// settles. Elevation decreases every step, so every droplet terminates
// (in a pit, a flat spot, or at the model edge).
//
// Two motion rules, switchable in the panel:
//   'neighbors' — move to the lowest of the 8 lattice neighbours (the
//                 AgentScript rule; "D8" in hydrology). Steps are one grid
//                 cell long and snap to 8 compass directions, so paths come
//                 out as straight octilinear staircases.
//   'vector'    — read the local downhill *direction* off the DEM and step a
//                 short fixed distance that way. Paths curve along the true
//                 fall line.
//
// Droplets are a `circle` layer, their paths a `line` layer. MapLibre draws
// both as an overlay on the 3D terrain — they follow the surface and are
// never hidden behind a ridge, whatever the tilt.

let MODEL_BOUNDS = [[-105.90, 35.73], [-105.70, 35.88]];  // [[W,S],[E,N]] lng/lat
let [[WEST, SOUTH], [EAST, NORTH]] = MODEL_BOUNDS;
const DEM_ZOOM = 13;             // initial tile zoom for the elevation grid (~15 m);
                                 // re-picked per region on a shift-drag

// Point the droplet model region at a new [[W,S],[E,N]] box.
function setRegion(bounds) {
  MODEL_BOUNDS = bounds;
  [[WEST, SOUTH], [EAST, NORTH]] = bounds;
}
const STEP_MS = 160;             // wall-clock time between steps (until there's a speed control)

const VECTOR_STEP_M = 120;       // 'vector' mode: distance moved per step
const GRAD_PROBE_M = 90;         // 'vector' mode: half-offset for sampling the slope
                                 // (wider than the step, so the direction is a
                                 // regional downhill, not local DEM noise)
const MOMENTUM = 0.6;            // 'vector' mode: how much of the previous heading
                                 // carries over — lets a droplet coast across
                                 // small bumps instead of stopping at every one
const STUCK_STEPS = 25;          // 'vector' mode: give up after this many steps
                                 // without finding a new low (i.e. circling a pit)

let spacingMetres = 400;         // gap between droplets — the slider drives this
let motion = 'vector';           // 'vector' | 'neighbors' — the mode selector drives this
let runSteps = 90;               // steps before a run stops itself — the slider drives this.
                                 // 'neighbors' settles well before this; 'vector' water
                                 // keeps flowing to the model edge, so the budget matters.
let demGrid = null;              // ElevationGrid for MODEL_BOUNDS, fetched once on load
let droplets = [];               // { lng, lat, elev, trail: [[lng,lat], …], done, … }
let timer = null;                // setInterval handle while the sim is running
let stepCount = 0;               // steps taken in the current run

const EMPTY = { type: 'FeatureCollection', features: [] };

// metres per degree of lng / lat at a given latitude
function metresPerDegree(lat) {
  return { lat: 111320, lng: 111320 * Math.cos(lat * Math.PI / 180) };
}

// lattice step in degrees for the current spacing
function latticeStep() {
  const m = metresPerDegree((SOUTH + NORTH) / 2);
  return { dLat: spacingMetres / m.lat, dLng: spacingMetres / m.lng };
}

// (Re)create the droplet set: one per lattice node, anchored to a fixed
// origin so a given node is always the same droplet, elevations from demGrid.
function buildDroplets() {
  droplets = [];
  stepCount = 0;
  if (demGrid) {
    const { dLat, dLng } = latticeStep();
    for (let lat = Math.ceil(SOUTH / dLat) * dLat; lat <= NORTH; lat += dLat) {
      for (let lng = Math.ceil(WEST / dLng) * dLng; lng <= EAST; lng += dLng) {
        const elev = demGrid.elevation(lng, lat);
        if (elev != null) {
          droplets.push({
            lng, lat, elev, trail: [[lng, lat]], done: false,
            vx: 0, vy: 0, lowElev: elev, sinceLow: 0,   // 'vector' mode bookkeeping
          });
        }
      }
    }
  }
  render();
}

const inBounds = (lng, lat) => lng >= WEST && lng <= EAST && lat >= SOUTH && lat <= NORTH;

// 'neighbors' rule: the lowest of the 8 lattice neighbours, if it's below us.
function stepNeighbors(d) {
  const { dLat, dLng } = latticeStep();
  let bestElev = d.elev;
  let best = null;
  for (let iy = -1; iy <= 1; iy++) {
    for (let ix = -1; ix <= 1; ix++) {
      if (ix === 0 && iy === 0) continue;
      const lng = d.lng + ix * dLng;
      const lat = d.lat + iy * dLat;
      if (!inBounds(lng, lat)) continue;
      const e = demGrid.elevation(lng, lat);
      if (e != null && e < bestElev) { bestElev = e; best = [lng, lat, e]; }
    }
  }
  return best;
}

// 'vector' rule: read the downhill direction off the DEM, blend it with the
// droplet's current heading (momentum), and step VECTOR_STEP_M that way.
function stepVector(d) {
  const m = metresPerDegree(d.lat);
  const eLng = GRAD_PROBE_M / m.lng;
  const eLat = GRAD_PROBE_M / m.lat;

  const zE = demGrid.elevation(d.lng + eLng, d.lat);
  const zW = demGrid.elevation(d.lng - eLng, d.lat);
  const zN = demGrid.elevation(d.lng, d.lat + eLat);
  const zS = demGrid.elevation(d.lng, d.lat - eLat);
  if (zE == null || zW == null || zN == null || zS == null) return null;   // at the edge

  // downhill pull as a unit vector (east, north), and the grade
  let px = zW - zE;
  let py = zS - zN;
  const grade = Math.hypot(zE - zW, zN - zS) / (2 * GRAD_PROBE_M);
  const pmag = Math.hypot(px, py) || 1;
  px /= pmag;
  py /= pmag;

  // blend with the previous heading so the droplet coasts over small bumps
  d.vx = MOMENTUM * d.vx + (1 - MOMENTUM) * px;
  d.vy = MOMENTUM * d.vy + (1 - MOMENTUM) * py;
  const vmag = Math.hypot(d.vx, d.vy);
  if (grade < 1e-3 && vmag < 0.05) return null;   // genuinely flat — settled

  const lng = d.lng + (d.vx / vmag) * VECTOR_STEP_M / m.lng;
  const lat = d.lat + (d.vy / vmag) * VECTOR_STEP_M / m.lat;
  if (!inBounds(lng, lat)) return null;

  const elev = demGrid.elevation(lng, lat);
  if (elev == null) return null;

  // Settle only when we've gone a long stretch without reaching a new low —
  // i.e. we're circling a real pit, not just crossing one small rise or
  // easing down a gentle valley floor.
  if (elev < d.lowElev - 0.2) { d.lowElev = elev; d.sinceLow = 0; }
  else if (++d.sinceLow > STUCK_STEPS) return null;

  return [lng, lat, elev];
}

// One downhill step for every un-settled droplet.
function step() {
  const advance = motion === 'vector' ? stepVector : stepNeighbors;
  let moved = 0;

  for (const d of droplets) {
    if (d.done) continue;
    const next = advance(d);
    if (next) {
      d.lng = next[0];
      d.lat = next[1];
      d.elev = next[2];
      d.trail.push([d.lng, d.lat]);
      moved++;
    } else {
      d.done = true;
    }
  }

  stepCount++;
  // Stop when the whole field has settled (nothing moved), or when the run
  // hits its step budget. Budget-stopped droplets are left un-`done` — they
  // stay bright, so it's clear they were still flowing and a longer run (the
  // slider) would carry them further.
  if (moved === 0 || stepCount >= runSteps) stop();
  render();
}

// Push current droplet positions and trails to the two GeoJSON sources.
function render() {
  map.getSource('droplets')?.setData({
    type: 'FeatureCollection',
    features: droplets.map((d) => ({
      type: 'Feature',
      properties: { done: d.done },
      geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
    })),
  });
  map.getSource('trails')?.setData({
    type: 'FeatureCollection',
    features: droplets
      .filter((d) => d.trail.length > 1)
      .map((d) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: d.trail } })),
  });
}

// --- start / stop / reset -----------------------------------------

function start() {
  if (timer || droplets.length === 0) return;
  timer = setInterval(step, STEP_MS);
  playButton.textContent = 'Pause';
}

function stop() {
  clearInterval(timer);
  timer = null;
  playButton.textContent = 'Start';
}

function reset() {
  stop();
  buildDroplets();
}

// Download the elevation for a [[W,S],[E,N]] box and rebuild the droplet
// grid on it. Called once on load with the Santa Fe box, and again each
// time you shift-drag a new region.
async function loadRegion(bounds, zoom = pickDemZoom(bounds)) {
  stop();
  setRegion(bounds);
  map.getSource('region')?.setData(boundsRing(bounds));
  elevBox.textContent = 'elevation: (loading tiles…)';
  try {
    demGrid = await fetchElevation({ bounds, zoom });
    buildDroplets();
  } catch (err) {
    console.error('elevation grid failed to load:', err);
  }
}

map.on('load', async () => {
  map.addSource('trails', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'trails',
    type: 'line',
    source: 'trails',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#1667c8', 'line-width': 1.4, 'line-opacity': 0.55 },
  });

  map.addSource('droplets', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'droplets',
    type: 'circle',
    source: 'droplets',
    paint: {
      // grow the dots a little as you zoom in, so they stay proportionate
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2, 13, 4.5, 16, 8],
      // still-moving droplets are light blue; settled ones darken to
      // "pooled water" so you can see where the water ends up
      'circle-color': ['case', ['boolean', ['get', 'done'], false], '#0a3f7d', '#5aa4ff'],
      'circle-opacity': 0.9,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#ffffff',
    },
  });

  // The model-region outline — a dashed rectangle so you can still see the
  // droplet domain after panning away, and where a shift-drag put it.
  map.addSource('region', { type: 'geojson', data: boundsRing(MODEL_BOUNDS) });
  map.addLayer({
    id: 'region',
    type: 'line',
    source: 'region',
    paint: { 'line-color': '#1667c8', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.9 },
  });

  // One elevation download for the model region, then place the grid.
  loadRegion(MODEL_BOUNDS, DEM_ZOOM);

  // Shift-drag a new box -> new model region.
  onRegionSelect(map, (bounds) => loadRegion(bounds), { color: '#1667c8' });
});

// --- 5. Panel: collapse toggle, spacing slider, run controls -----

// Click the panel to fold it down to just its title (and click again to
// re-open). Clicks on the README link or the controls row don't count.
const panel = document.getElementById('panel');
panel.addEventListener('click', (e) => {
  if (e.target.closest('a, #controls')) return;
  const collapsed = panel.classList.toggle('collapsed');
  document.getElementById('panel-toggle').textContent = collapsed ? '+' : '–';
});

// Spacing slider: live label on `input`, rebuild the grid on `change` (mouse
// release) since at the fine end that's thousands of droplets.
const spacingInput = document.getElementById('spacing');
const spacingLabel = document.getElementById('spacing-val');
spacingInput.value = spacingMetres;
spacingLabel.textContent = `${spacingMetres} m`;
spacingInput.addEventListener('input', () => {
  spacingLabel.textContent = `${spacingInput.value} m`;
});
spacingInput.addEventListener('change', () => {
  spacingMetres = +spacingInput.value;
  reset();
});

// Motion-rule selector: switching it restarts from a fresh grid.
const modeSelect = document.getElementById('mode');
modeSelect.value = motion;
modeSelect.addEventListener('change', () => {
  motion = modeSelect.value;
  reset();
});

// Run-length slider: how many steps a run takes before it stops itself.
// Applies live — raise it mid-run to let the water keep going, or press
// Start again after a run has stopped to continue from where it left off.
const stepsInput = document.getElementById('steps');
const stepsLabel = document.getElementById('steps-val');
stepsInput.value = runSteps;
stepsLabel.textContent = runSteps;
stepsInput.addEventListener('input', () => {
  runSteps = +stepsInput.value;
  stepsLabel.textContent = runSteps;
});

// Start / Pause toggle, and Reset.
const playButton = document.getElementById('play');
const resetButton = document.getElementById('reset');
playButton.addEventListener('click', () => (timer ? stop() : start()));
resetButton.addEventListener('click', reset);

// Poke the sim from the console: sim.step(), sim.droplets(), ...
// sim.region([[w,s],[e,n]]) moves the model region (same as a shift-drag).
window.sim = {
  start, stop, reset, step,
  droplets: () => droplets,
  grid: () => demGrid,
  region: (bounds) => loadRegion(bounds),
};

// --- 6. Grab the current view as an elevation grid ----------------

// `grabElevation()` from the console downloads the DEM tiles covering what's
// on screen (at the current zoom) and returns an ElevationGrid you can query:
//   const g = await grabElevation();
//   g.elevation(-105.80, 35.80);   // metres at a lng/lat
//   g.width * g.height, g.bounds, g.range(), [...g.sources]
window.grabElevation = (zoom = Math.round(map.getZoom())) => {
  const b = map.getBounds();
  return fetchElevation({
    bounds: [[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]],
    zoom,
  });
};

// Expose the map on the console for poking at it live: `map.getPitch()`,
// `map.queryTerrainElevation(map.getCenter())`, etc.
window.map = map;

// Handy while tweaking: log the camera position when you stop moving, so
// you can copy good values back into center/zoom/pitch/bearing above.
map.on('moveend', () => {
  const c = map.getCenter();
  console.log(
    `center: [${c.lng.toFixed(4)}, ${c.lat.toFixed(4)}]  ` +
    `zoom: ${map.getZoom().toFixed(2)}  ` +
    `pitch: ${map.getPitch().toFixed(1)}  ` +
    `bearing: ${map.getBearing().toFixed(1)}`
  );
});
