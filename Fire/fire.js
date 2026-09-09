// Fire — a made-up wildfire progression on real 3D terrain.
//
// The terrain half of this file is lifted straight from the sibling
// `Elevation` app (same MapLibre setup, same DEM, same hillshade/sky). The
// new part is section 4: a small cellular fire-spread model that grows a
// burn scar over the landscape, faster uphill and downwind, and feeds it to
// the map as GeoJSON — the same "stack of time-stamped perimeters" shape a
// real fire progression uses, only tick-indexed instead of calendar-dated.

import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.mjs';

// Our own tiny, dependency-free helper for pulling DEM tiles down and
// decoding them into a lng/lat-addressable elevation grid. The fire model
// samples it once for the whole model region, then never touches the map's
// own terrain — so a cell's uphill/downhill decision never shifts when you
// zoom.
import { fetchElevation } from './elevation.js';

// Shift-drag a rectangle to move the model region somewhere else (replaces
// MapLibre's native shift-drag box-zoom). See regionselect.js.
import { onRegionSelect, pickDemZoom, boundsRing } from './regionselect.js';

document.head.insertAdjacentHTML(
  'beforeend',
  '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.css">'
);

// --- 1. The map itself -------------------------------------------------

// Looking into the Sangre de Cristo range from the southwest. Santa Fe Baldy
// (~3870 m) sits to the northeast of the model box, so a fire lit in the
// middle of the box has real hill to climb.
const CENTER = [-105.80, 35.805];

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/positron',
  center: CENTER,
  zoom: 11.2,
  pitch: 62,         // tilt the camera so the terrain reads as 3D
  bearing: -20,
  // No maxBounds — pan anywhere and shift-drag a new model region (a ridge
  // in another state, say). minZoom stays low enough to cross the country.
  minZoom: 3,
  maxZoom: 16,
  maxPitch: 80,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

// --- 2. The elevation data ("DEM") -----------------------------------

// "Terrarium" tiles: each pixel's colour encodes a height in metres,
// height = R*256 + G + B/256 - 32768. Free, no key, hosted by AWS.
const DEM_SOURCE = 'terrain-dem';

// Vertical stretch for the 3D view only — scales every height equally, so it
// never changes which way is uphill.
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

  map.setTerrain({ source: DEM_SOURCE, exaggeration: EXAGGERATION });

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

  map.setSky({
    'sky-color': '#8fb8de',
    'horizon-color': '#e6eef5',
    'fog-color': '#e6eef5',
    'sky-horizon-blend': 0.5,
    'horizon-fog-blend': 0.5,
  });
});

map.addControl(
  new maplibregl.TerrainControl({ source: DEM_SOURCE, exaggeration: EXAGGERATION }),
  'top-right'
);

// --- 3. The model region --------------------------------------------

// The patch of ground the fire lives on — world-locked, like the droplet
// grid in the Elevation app: pan or zoom and the fire stays put. It starts
// on the Sangre de Cristo range above Santa Fe; shift-drag re-draws it
// anywhere (see setRegion / loadRegion below).
let MODEL_BOUNDS = [[-105.90, 35.73], [-105.70, 35.88]];  // [[W,S],[E,N]]
let [[WEST, SOUTH], [EAST, NORTH]] = MODEL_BOUNDS;
const DEM_ZOOM = 13;          // initial grid sample spacing (~15 m); re-picked per region

// metres per degree of lng / lat at a given latitude
function metresPerDegree(lat) {
  return { lat: 111320, lng: 111320 * Math.cos(lat * Math.PI / 180) };
}
let MPD = metresPerDegree((SOUTH + NORTH) / 2);

// Point the model region at a new [[W,S],[E,N]] box and recompute the grid.
function setRegion(bounds) {
  MODEL_BOUNDS = bounds;
  [[WEST, SOUTH], [EAST, NORTH]] = bounds;
  MPD = metresPerDegree((SOUTH + NORTH) / 2);
  resize();
}

// --- 4. The fire-spread model --------------------------------------
//
// A square grid of cells over MODEL_BOUNDS. Each cell is UNBURNED, BURNING,
// or BURNED, plus the tick it caught fire (`litAt`) and how many ticks it
// has been alight (`age`). One ignition cell starts BURNING at tick 0.
//
// Each tick, every BURNING cell rolls a die against each UNBURNED neighbour
// (of 8). The ignition probability is
//
//     p = RATE  x  slopeFactor  x  windFactor  /  distance
//
//   slopeFactor = exp(SLOPE_COEF * grade)   grade = rise/run to the neighbour
//                                           (+uphill speeds it up, this is the
//                                           dominant term in real fire spread)
//   windFactor  = exp(WIND_COEF * strength * alignment)
//                                           alignment = how well the step
//                                           direction lines up with the wind
//   distance    = 1 for orthogonal, sqrt(2) for diagonal neighbours
//
// A BURNING cell burns out (-> BURNED) after RESIDENCE ticks and stops
// spreading. The run stops when nothing is burning or the step budget runs
// out.
//
// This is a toy — not Rothermel, no fuel model, no spotting — but the two
// knobs that shape a real fire's footprint (slope and wind) are here, so the
// scar comes out as a wind-and-terrain-driven ellipse rather than a circle.

const UNBURNED = 0, BURNING = 1, BURNED = 2;

const RESIDENCE = 4;          // ticks a cell stays BURNING (and spreading)
const SLOPE_COEF = 3.5;       // how hard slope bends the spread (exp argument)
const WIND_COEF = 0.9;        // how hard wind bends the spread (exp argument)
const STEP_MS = 170;          // wall-clock time between ticks
const MINUTES_PER_TICK = 15;  // label only — turns ticks into an "elapsed time"

// Cell size on the ground, and the grid it implies. `cellSizeM` is driven by
// the resolution slider; `resize()` recomputes the lattice step (in degrees)
// and the column/row counts whenever it changes.
let cellSizeM = 160;
let dLng, dLat, NCOLS, NROWS;
function resize() {
  dLng = cellSizeM / MPD.lng;
  dLat = cellSizeM / MPD.lat;
  NCOLS = Math.floor((EAST - WEST) / dLng);
  NROWS = Math.floor((NORTH - SOUTH) / dLat);
}
resize();
const idx = (c, r) => r * NCOLS + c;
const inGrid = (c, r) => c >= 0 && r >= 0 && c < NCOLS && r < NROWS;

// Cell (col, row): col 0 at WEST, row 0 at NORTH (matches the elevation grid,
// whose first row is the north edge).
function cellCenter(c, r) {
  return [WEST + (c + 0.5) * dLng, NORTH - (r + 0.5) * dLat];
}
function cellRing(c, r) {
  const w = WEST + c * dLng, e = w + dLng;
  const n = NORTH - r * dLat, s = n - dLat;
  return [[w, n], [e, n], [e, s], [w, s], [w, n]];
}

let demGrid = null;           // ElevationGrid for MODEL_BOUNDS, fetched once
let cellElev = null;          // Float32Array, one elevation per cell
let state = null;             // Uint8Array of UNBURNED / BURNING / BURNED
let litAt = null;             // Int16Array, tick each cell caught (-1 = never)
let age = null;               // Uint8Array, ticks a cell has been BURNING
let ignition = null;          // [lng, lat] of the ignition point (grid-independent)
let windVec = [0, 0];         // unit vector the wind pushes *toward*, grid coords
let progression = [];         // one perimeter snapshot per tick (see snapshotFeature())

let rate = 0.18;              // RATE above — the spread-rate slider
let windStrength = 1.5;       // the wind-strength slider
let maxTicks = 120;           // step budget — the run-length slider
let tick = 0;                 // ticks taken in the current run
let timer = null;             // setInterval handle while running

const EMPTY = { type: 'FeatureCollection', features: [] };

// "Wind from X" -> the unit vector the fire is pushed along, in grid coords
// (col+ is east, row+ is south). Wind FROM the north blows toward the south.
const WIND_FROM = {
  calm: [0, 0],
  N: [0, 1],  S: [0, -1],  E: [-1, 0],  W: [1, 0],
  NE: [-1, 1], NW: [1, 1], SE: [-1, -1], SW: [1, -1],
};
function setWind(dirName) {
  const [x, y] = WIND_FROM[dirName] || [0, 0];
  const m = Math.hypot(x, y) || 1;
  windVec = [x / m, y / m];
}

// Build (or rebuild) the grid: elevations from demGrid, everything UNBURNED,
// then light the ignition cell.
function buildGrid() {
  tick = 0;
  progression = [];
  const n = NCOLS * NROWS;
  cellElev = new Float32Array(n);
  state = new Uint8Array(n);
  litAt = new Int16Array(n).fill(-1);
  age = new Uint8Array(n);

  if (demGrid) {
    for (let r = 0; r < NROWS; r++) {
      for (let c = 0; c < NCOLS; c++) {
        const [lng, lat] = cellCenter(c, r);
        cellElev[idx(c, r)] = demGrid.elevation(lng, lat) ?? NaN;
      }
    }
  }
  // The ignition point is stored in lng/lat so it stays put when the cell
  // size changes; here we snap it to whatever cell now covers it.
  if (!ignition) ignition = [(WEST + EAST) / 2, (SOUTH + NORTH) / 2];
  const ic = Math.min(NCOLS - 1, Math.max(0, Math.floor((ignition[0] - WEST) / dLng)));
  const ir = Math.min(NROWS - 1, Math.max(0, Math.floor((NORTH - ignition[1]) / dLat)));
  state[idx(ic, ir)] = BURNING;
  litAt[idx(ic, ir)] = 0;

  draw(perimeterSegments());
  updateStat();
}

// Probability that BURNING cell (c,r) lights UNBURNED neighbour (nc,nr).
function igniteProb(c, r, nc, nr) {
  const dc = nc - c, dr = nr - r;
  const dist = Math.hypot(dc, dr);              // 1 or sqrt(2)

  const eFrom = cellElev[idx(c, r)];
  const eTo = cellElev[idx(nc, nr)];
  const grade = (eTo - eFrom) / (dist * cellSizeM);   // + = uphill
  const slopeFactor = Math.exp(SLOPE_COEF * grade);

  const align = (dc / dist) * windVec[0] + (dr / dist) * windVec[1];   // -1..1
  const windFactor = Math.exp(WIND_COEF * windStrength * align);

  return Math.min(0.98, (rate * slopeFactor * windFactor) / dist);
}

// One tick: spread from every BURNING cell, then age the fire.
function step() {
  // 4a. gather this tick's ignitions (all rolled against the *current* state)
  const lit = [];
  for (let r = 0; r < NROWS; r++) {
    for (let c = 0; c < NCOLS; c++) {
      if (state[idx(c, r)] !== BURNING) continue;
      for (let jr = -1; jr <= 1; jr++) {
        for (let jc = -1; jc <= 1; jc++) {
          if (jc === 0 && jr === 0) continue;
          const nc = c + jc, nr = r + jr;
          if (!inGrid(nc, nr)) continue;
          const ni = idx(nc, nr);
          if (state[ni] !== UNBURNED || Number.isNaN(cellElev[ni])) continue;
          if (Math.random() < igniteProb(c, r, nc, nr)) lit.push(ni);
        }
      }
    }
  }

  tick++;

  // 4b. age the cells that were already burning; burn the spent ones out
  for (let i = 0; i < state.length; i++) {
    if (state[i] === BURNING && litAt[i] < tick) {
      if (++age[i] >= RESIDENCE) state[i] = BURNED;
    }
  }

  // 4c. apply this tick's ignitions
  let anyLit = false;
  for (const ni of lit) {
    if (state[ni] === UNBURNED) {
      state[ni] = BURNING;
      litAt[ni] = tick;
      anyLit = true;
    }
  }

  const segs = perimeterSegments();
  draw(segs);
  progression.push(snapshotFeature(segs));
  updateStat();

  // stop when the fire is out (nothing burning, nothing newly lit) or the
  // step budget is spent
  if ((tally().burning === 0 && !anyLit) || tick >= maxTicks) stop();
}

// burning / total-burnt cell counts in one pass
function tally() {
  let burning = 0, burnt = 0;
  for (let i = 0; i < state.length; i++) {
    if (state[i] === BURNING) burning++;
    if (state[i] !== UNBURNED) burnt++;
  }
  return { burning, burnt };
}
const acresBurnt = () => tally().burnt * cellSizeM * cellSizeM / 4046.86;

// --- 5. Draw the fire as GeoJSON ---------------------------------
//
// Two layers, both fed fresh every tick:
//
//   burn       burned/burning cells, bucketed by "how long ago they burned"
//              into 6 age bands. Each band is ONE MultiPolygon feature (6
//              features total, not one per cell — thousands of Polygon
//              features would choke setData every tick), drawn with a
//              "cooling embers" ramp. Growing outward, the bands read as a
//              progression map.
//   perimeter  the active fire edge — every cell face that borders an
//              unburned cell — as one MultiLineString. This is the "current
//              perimeter" a real progression product publishes each mapping.

// age (ticks since a cell was lit) -> band 0..5
function ageBand(a) {
  if (a <= 1) return 0;
  if (a <= 3) return 1;
  if (a <= 6) return 2;
  if (a <= 11) return 3;
  if (a <= 20) return 4;
  return 5;
}
const BAND_COLOR = ['#ffd24a', '#ff9a2e', '#f5631e', '#c93417', '#7c1d12', '#2b1410'];

// Rectangle covering cells [c0..c1] of row r.
function rowRect(c0, c1, r) {
  const w = WEST + c0 * dLng, e = WEST + (c1 + 1) * dLng;
  const n = NORTH - r * dLat, s = n - dLat;
  return [[[w, n], [e, n], [e, s], [w, s], [w, n]]];
}

function draw(segs) {
  const bands = [[], [], [], [], [], []];   // band -> array of MultiPolygon members
  // Merge each row's burnt cells into runs of constant band — thousands of
  // unit squares re-tessellated on the 3D terrain every tick is the slow
  // path; a few hundred row-rectangles look identical here.
  for (let r = 0; r < NROWS; r++) {
    let c0 = -1, curBand = -1;
    for (let c = 0; c <= NCOLS; c++) {
      const i = c < NCOLS ? idx(c, r) : -1;
      const b = i >= 0 && state[i] !== UNBURNED ? ageBand(tick - litAt[i]) : -1;
      if (b === curBand) continue;
      if (curBand >= 0) bands[curBand].push(rowRect(c0, c - 1, r));
      c0 = c;
      curBand = b;
    }
  }
  map.getSource('burn')?.setData({
    type: 'FeatureCollection',
    features: bands
      .map((members, band) => ({
        type: 'Feature',
        properties: { band },
        geometry: { type: 'MultiPolygon', coordinates: members },
      }))
      .filter((f) => f.geometry.coordinates.length),
  });

  map.getSource('perimeter')?.setData(
    segs.length
      ? { type: 'Feature', properties: { tick }, geometry: { type: 'MultiLineString', coordinates: segs } }
      : EMPTY
  );
}

// Every cell face between a burned/burning cell and a non-burned one, as a
// MultiLineString. Cheap, needs no polygon library, and is exactly the fire
// perimeter.
function perimeterSegments() {
  const burnt = (c, r) => inGrid(c, r) && state[idx(c, r)] !== UNBURNED;
  const segs = [];
  for (let r = 0; r < NROWS; r++) {
    for (let c = 0; c < NCOLS; c++) {
      if (!burnt(c, r)) continue;
      const ring = cellRing(c, r);           // [NW, NE, SE, SW, NW]
      if (!burnt(c, r - 1)) segs.push([ring[0], ring[1]]);   // north face
      if (!burnt(c + 1, r)) segs.push([ring[1], ring[2]]);   // east face
      if (!burnt(c, r + 1)) segs.push([ring[2], ring[3]]);   // south face
      if (!burnt(c - 1, r)) segs.push([ring[3], ring[0]]);   // west face
    }
  }
  return segs;
}
// One progression frame per tick: the perimeter plus a little metadata. The
// `progression` array *is* a fire progression in the usual sense — a
// time-ordered stack of perimeters — just keyed by tick instead of an ISO
// date. `fire.progression()` hands it back as a FeatureCollection you can
// save to a .geojson file.
function snapshotFeature(segs) {
  return {
    type: 'Feature',
    properties: {
      tick,
      minutes: tick * MINUTES_PER_TICK,
      acres: +acresBurnt().toFixed(1),
    },
    geometry: { type: 'MultiLineString', coordinates: segs },
  };
}

// Trigger a real file download of the current progression as a .geojson
// file — `copy()` only exists as a DevTools console convenience, not a
// callable from in-page script, so this uses the standard Blob + temporary
// <a download> approach instead.
function saveProgression(filename) {
  const data = JSON.stringify({ type: 'FeatureCollection', features: progression });
  const blob = new Blob([data], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `fire-progression-tick${tick}.geojson`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- 6. Start / stop / reset -------------------------------------

function start() {
  if (timer || !demGrid) return;
  // fire's out → start a fresh one; otherwise (paused, or stopped at the
  // step budget) resume — raise the run-length slider first to carry on.
  if (tick > 0 && tally().burning === 0) buildGrid();
  timer = setInterval(step, STEP_MS);
  playButton.textContent = 'Pause';
}
function stop() {
  clearInterval(timer);
  timer = null;
  playButton.textContent = tick > 0 ? 'Resume' : 'Start';
}
function reset() {
  stop();
  buildGrid();
  playButton.textContent = 'Start';
}

// Download the elevation for a [[W,S],[E,N]] box and start a fresh fire on
// it. Called once on load with the Santa Fe box, and again each time you
// shift-drag a new region.
async function loadRegion(bounds, zoom = pickDemZoom(bounds)) {
  stop();
  setRegion(bounds);
  map.getSource('region')?.setData(boundsRing(bounds));
  // drop an ignition point that's no longer inside the region
  if (ignition && (ignition[0] < WEST || ignition[0] > EAST ||
                   ignition[1] < SOUTH || ignition[1] > NORTH)) ignition = null;
  statBox.textContent = 'loading elevation…';
  try {
    demGrid = await fetchElevation({ bounds, zoom });
    buildGrid();
  } catch (err) {
    console.error('elevation grid failed to load:', err);
    statBox.textContent = 'elevation data failed to load';
  }
}

function updateStat() {
  const { burning } = tally();
  const hrs = (tick * MINUTES_PER_TICK) / 60;
  statBox.textContent =
    `tick ${tick}  ·  ${hrs.toFixed(1)} h  ·  ${acresBurnt().toFixed(0)} ac` +
    (timer ? '' : tick === 0 ? '  (press Start)' : burning ? '  (paused)' : '  (out)');
}

// --- 7. Map wiring ---------------------------------------------

map.on('load', async () => {
  map.addSource('burn', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'burn',
    type: 'fill',
    source: 'burn',
    paint: {
      'fill-color': [
        'match', ['get', 'band'],
        0, BAND_COLOR[0], 1, BAND_COLOR[1], 2, BAND_COLOR[2],
        3, BAND_COLOR[3], 4, BAND_COLOR[4],
        BAND_COLOR[5],
      ],
      'fill-opacity': ['case', ['==', ['get', 'band'], 0], 0.92, 0.8],
    },
  });

  map.addSource('perimeter', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'perimeter',
    type: 'line',
    source: 'perimeter',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#fff2b0', 'line-width': 1.6, 'line-opacity': 0.75 },
  });

  // The model-region outline — a dashed rectangle so you can still see where
  // the fire's domain is after panning away, and where a shift-drag put it.
  map.addSource('region', { type: 'geojson', data: boundsRing(MODEL_BOUNDS) });
  map.addLayer({
    id: 'region',
    type: 'line',
    source: 'region',
    paint: { 'line-color': '#d9480f', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.9 },
  });

  setWind(windDirSelect.value);
  loadRegion(MODEL_BOUNDS, DEM_ZOOM);

  // Shift-drag a new box -> new model region.
  onRegionSelect(map, (bounds) => loadRegion(bounds));
});

// Click the map to move the ignition point (and reset to it).
map.on('click', (e) => {
  const { lng, lat } = e.lngLat;
  if (lng < WEST || lng > EAST || lat < SOUTH || lat > NORTH) return;
  ignition = [lng, lat];
  reset();
});

// --- 8. Panel: collapse toggle + controls --------------------

const panel = document.getElementById('panel');
panel.addEventListener('click', (e) => {
  if (e.target.closest('a, #controls')) return;
  const collapsed = panel.classList.toggle('collapsed');
  document.getElementById('panel-toggle').textContent = collapsed ? '+' : '–';
});

// Cell-size (resolution) slider — like the droplet-spacing slider in the
// Elevation app. Label updates live on `input`; the grid only rebuilds on
// `change` (mouse release), since the fine end is tens of thousands of cells.
const cellInput = document.getElementById('cell');
const cellLabel = document.getElementById('cell-val');
cellInput.value = cellSizeM;
cellLabel.textContent = `${cellSizeM} m`;
cellInput.addEventListener('input', () => {
  cellLabel.textContent = `${cellInput.value} m`;
});
cellInput.addEventListener('change', () => {
  cellSizeM = +cellInput.value;
  resize();
  reset();
});

const windDirSelect = document.getElementById('wind-dir');
windDirSelect.addEventListener('change', () => {
  setWind(windDirSelect.value);
});

const windStrInput = document.getElementById('wind-str');
const windStrLabel = document.getElementById('wind-str-val');
windStrInput.addEventListener('input', () => {
  windStrength = +windStrInput.value;
  windStrLabel.textContent = windStrength.toFixed(1);
});

const rateInput = document.getElementById('rate');
const rateLabel = document.getElementById('rate-val');
rateInput.addEventListener('input', () => {
  rate = +rateInput.value;
  rateLabel.textContent = rate.toFixed(2);
});

const ticksInput = document.getElementById('ticks');
const ticksLabel = document.getElementById('ticks-val');
ticksInput.addEventListener('input', () => {
  maxTicks = +ticksInput.value;
  ticksLabel.textContent = maxTicks;
});

const playButton = document.getElementById('play');
const resetButton = document.getElementById('reset');
const statBox = document.getElementById('stat');
playButton.addEventListener('click', () => (timer ? stop() : start()));
resetButton.addEventListener('click', reset);

// --- 9. Console hooks ----------------------------------------

// fire.step(), fire.reset(), fire.progression() -> FeatureCollection of the
// per-tick perimeters. fire.save() downloads that same FeatureCollection as
// a .geojson file (fire.save('name.geojson') to pick the filename).
window.fire = {
  start, stop, step, reset,
  state: () => ({ tick, ...tally(), region: MODEL_BOUNDS }),
  grid: () => demGrid,
  region: (bounds) => loadRegion(bounds),   // fire.region([[w,s],[e,n]])
  progression: () => ({ type: 'FeatureCollection', features: progression }),
  save: (filename) => saveProgression(filename),
};
window.map = map;

map.on('moveend', () => {
  const c = map.getCenter();
  console.log(
    `center: [${c.lng.toFixed(4)}, ${c.lat.toFixed(4)}]  ` +
    `zoom: ${map.getZoom().toFixed(2)}  ` +
    `pitch: ${map.getPitch().toFixed(1)}  ` +
    `bearing: ${map.getBearing().toFixed(1)}`
  );
});
