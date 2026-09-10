// Progression — scrub a slider through a fire progression: a time-ordered
// stack of perimeter snapshots, whether it's a saved run from the sibling
// `Fire` app (MultiLineString perimeters, keyed by tick) or a real
// incident's published mapping (Polygon/MultiPolygon perimeters, keyed by
// date). Both shapes are just "one feature per moment in time," so this app
// normalizes either into the same `frames` array and drives the map off it.

import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.mjs';

document.head.insertAdjacentHTML(
  'beforeend',
  '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.css">'
);

// --- 1. Dataset registry -------------------------------------------
//
// Every dataset lives in ../data/ (shared with any other app that wants a
// downloadable data file) and is described by how to pull one time-ordered
// "frame" (a moment's perimeter, plus a caption and an acreage) out of each
// GeoJSON feature's properties.

const DATASETS = [
  {
    label: 'Fire app — Santa Fe sample run (made-up)',
    url: '../data/fire-santafe-sample.geojson',
    sortKey: (p) => p.tick,
    caption: (p) => `tick ${p.tick} · ${(p.minutes / 60).toFixed(1)} h`,
    acres: (p) => p.acres,
  },
  {
    label: 'Palisades Fire, Jan 2025 (CAL FIRE progression)',
    url: '../data/palisades-2025-progression.geojson',
    sortKey: (p) => p.PROG_DATETIME,
    caption: (p) => `${p.PROG_DATE.slice(4, 6)}/${p.PROG_DATE.slice(6, 8)} ${p.PROG_TIME}`,
    acres: (p) => p.PROG_TOTAL_ACRES,
  },
  {
    label: 'Camp Fire, Nov 2018 (historic GeoMAC)',
    url: '../data/camp-fire-2018-progression.geojson',
    sortKey: (p) => p.perimeterdatetime,
    caption: (p) => new Date(p.perimeterdatetime).toISOString().slice(0, 16).replace('T', ' '),
    acres: (p) => p.gisacres,
  },
  {
    label: 'Las Conchas Fire, Jun-Jul 2011, NM (historic GeoMAC)',
    url: '../data/las-conchas-2011-progression.geojson',
    sortKey: (p) => p.perimeterdatetime,
    caption: (p) => new Date(p.perimeterdatetime).toISOString().slice(0, 16).replace('T', ' '),
    acres: (p) => p.gisacres,
  },
  {
    label: 'Dog Head Fire, Jun 2016, NM (historic GeoMAC)',
    url: '../data/dog-head-2016-progression.geojson',
    sortKey: (p) => p.perimeterdatetime,
    caption: (p) => new Date(p.perimeterdatetime).toISOString().slice(0, 16).replace('T', ' '),
    acres: (p) => p.gisacres,
  },
  {
    label: 'Powder/Fox/Tartar Fire Complex, Jul-Aug 2026, OR (SimTable time-of-arrival)',
    url: '../data/powder-fox-tartar-2026-progression.geojson',
    sortKey: (p) => p.utcMs,
    caption: (p) => new Date(p.utcMs).toISOString().slice(0, 16).replace('T', ' '),
    acres: (p) => p.acres,
  },
];

// --- 2. The map ------------------------------------------------------

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/positron',
  center: [-105.80, 35.805],
  zoom: 10,
  pitch: 45,
  bearing: 0,
  minZoom: 2,
  maxZoom: 16,
  maxPitch: 80,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

// Terrain (same AWS "terrarium" DEM tiles the Fire/Elevation apps use) —
// draped under whichever dataset is loaded. Doesn't hurt for a dataset far
// from New Mexico; the tiles are global.
const DEM_SOURCE = 'terrain-dem';
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
});

map.addControl(
  new maplibregl.TerrainControl({ source: DEM_SOURCE, exaggeration: EXAGGERATION }),
  'top-right'
);

const EMPTY = { type: 'FeatureCollection', features: [] };

// --- 3. Drawing a progression -----------------------------------
//
// Two things on screen at once:
//   trail    every prior frame's outline, faded by age — where the fire's
//            already been. Works whether a frame's geometry is a filled
//            Polygon (a `line` layer just draws its boundary) or Fire's own
//            MultiLineString perimeter.
//   current  the active frame: a bold outline, plus (for Polygon/
//            MultiPolygon datasets only) a translucent fill.

function addLayers() {
  map.addSource('trail', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'trail-line',
    type: 'line',
    source: 'trail',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ff9a2e',
      'line-width': 1.2,
      'line-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 0.5, 40, 0.03],
    },
  });

  map.addSource('current-fill', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'current-fill',
    type: 'fill',
    source: 'current-fill',
    paint: { 'fill-color': '#ffd24a', 'fill-opacity': 0.35 },
  });

  map.addSource('current-line', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'current-line',
    type: 'line',
    source: 'current-line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#fff2b0', 'line-width': 2.2, 'line-opacity': 0.95 },
  });
}

// Combined [W, S, E, N] bounding box of a FeatureCollection's coordinates,
// walked recursively so it doesn't care whether a geometry is a
// LineString, MultiLineString, Polygon, or MultiPolygon.
function bboxOf(featureCollection) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    } else {
      coords.forEach(walk);
    }
  };
  featureCollection.features.forEach((f) => walk(f.geometry.coordinates));
  return [[w, s], [e, n]];
}

// --- 4. Loading a dataset into `frames` --------------------------

let frames = [];      // [{ feature, caption, acres }], sorted by sortKey
let index = 0;         // current frame
let timer = null;      // setInterval handle while playing

async function loadDataset(dataset) {
  stop();
  statBox.textContent = 'loading…';
  const res = await fetch(dataset.url);
  applyGeojson(await res.json(), dataset);
}

// Shared by loadDataset (registry entries, fetched) and the drag-and-drop
// handler below (a dropped file, already parsed) — both just need a
// GeoJSON FeatureCollection and a dataset descriptor to turn into frames.
function applyGeojson(geojson, dataset) {
  frames = geojson.features
    .map((feature, i) => ({
      feature,
      key: dataset.sortKey(feature.properties, i),
      caption: dataset.caption(feature.properties, i),
      acres: dataset.acres(feature.properties, i),
    }))
    .sort((a, b) => a.key - b.key);

  frameInput.max = frames.length - 1;
  index = 0;
  frameInput.value = 0;

  map.fitBounds(bboxOf(geojson), { padding: 60, duration: 500 });
  render();
}

// --- 5. Rendering the current frame -------------------------------

function render() {
  const frame = frames[index];
  if (!frame) return;

  const trail = frames.slice(0, index).map((f, i) => ({
    type: 'Feature',
    properties: { age: index - i },
    geometry: f.feature.geometry,
  }));
  map.getSource('trail')?.setData({ type: 'FeatureCollection', features: trail });

  const isPolygon = frame.feature.geometry.type.includes('Polygon');
  map.getSource('current-fill')?.setData(isPolygon ? frame.feature : EMPTY);
  map.getSource('current-line')?.setData(frame.feature);

  frameLabel.textContent = `${index} / ${frames.length - 1}`;
  const acres = frame.acres != null ? `  ·  ${frame.acres.toLocaleString()} ac` : '';
  statBox.textContent = `frame ${index + 1}/${frames.length}  ·  ${frame.caption}${acres}`;
}

// --- 6. Play / pause / reset -------------------------------------

function start() {
  if (timer) return;
  if (index >= frames.length - 1) index = 0;
  const stepMs = () => 400 / +speedInput.value;
  const tick = () => {
    index++;
    frameInput.value = index;
    render();
    if (index >= frames.length - 1) { stop(); return; }
    timer = setTimeout(tick, stepMs());
  };
  timer = setTimeout(tick, stepMs());
  playButton.textContent = 'Pause';
}
function stop() {
  clearTimeout(timer);
  timer = null;
  playButton.textContent = 'Play';
}
function reset() {
  stop();
  index = 0;
  frameInput.value = 0;
  render();
}

// --- 7. Drag-and-drop: load any progression GeoJSON dropped on the map --
//
// No registry entry, no fetch — just parse what's dropped and guess which
// property is the time key and which is the acreage, by name. Native
// File/DragEvent APIs only, so this doesn't pull in anything extra.

// A property value counts as "sortable" if it's already a number (an
// epoch timestamp, a tick count) or a string that `Date.parse` accepts.
function toSortable(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

// Build a dataset descriptor by guessing field names from the first
// feature's properties, rather than the hand-written ones in DATASETS.
// Falls back to feature order (and a bare "frame N" caption, no acreage)
// when nothing matches — still scrubbable, just less labeled.
function detectDataset(geojson, label) {
  const props = geojson.features[0]?.properties ?? {};
  const dateKey = Object.keys(props).find(
    (k) => /date|time|tick/i.test(k) && toSortable(props[k]) !== null
  );
  const acresKey = Object.keys(props).find((k) => /acre/i.test(k));

  return {
    label,
    sortKey: dateKey ? (p) => toSortable(p[dateKey]) : (_p, i) => i,
    caption: dateKey ? (p) => `${dateKey}: ${p[dateKey]}` : (_p, i) => `frame ${i}`,
    acres: acresKey ? (p) => p[acresKey] : () => null,
  };
}

function setupDrop() {
  const mapDiv = document.getElementById('map');
  ['dragenter', 'dragover'].forEach((evt) =>
    mapDiv.addEventListener(evt, (e) => {
      e.preventDefault();
      mapDiv.classList.add('drop-hover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    mapDiv.addEventListener(evt, () => mapDiv.classList.remove('drop-hover'))
  );
  mapDiv.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    stop();
    statBox.textContent = `reading ${file.name}…`;
    let geojson;
    try {
      geojson = JSON.parse(await file.text());
    } catch (err) {
      statBox.textContent = `${file.name}: not valid JSON`;
      return;
    }
    const dataset = detectDataset(geojson, `dropped: ${file.name}`);
    DATASETS.push(dataset);
    const opt = document.createElement('option');
    opt.value = DATASETS.length - 1;
    opt.textContent = dataset.label;
    datasetSelect.appendChild(opt);
    datasetSelect.value = opt.value;
    applyGeojson(geojson, dataset);
  });
}

// --- 8. Wiring -----------------------------------------------------

const panel = document.getElementById('panel');
panel.addEventListener('click', (e) => {
  if (e.target.closest('a, #controls')) return;
  const collapsed = panel.classList.toggle('collapsed');
  document.getElementById('panel-toggle').textContent = collapsed ? '+' : '–';
});

const datasetSelect = document.getElementById('dataset');
DATASETS.forEach((d, i) => {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = d.label;
  datasetSelect.appendChild(opt);
});
datasetSelect.addEventListener('change', () => loadDataset(DATASETS[+datasetSelect.value]));

const frameInput = document.getElementById('frame');
const frameLabel = document.getElementById('frame-val');
frameInput.addEventListener('input', () => {
  stop();
  index = +frameInput.value;
  render();
});

const speedInput = document.getElementById('speed');
const speedLabel = document.getElementById('speed-val');
speedInput.addEventListener('input', () => {
  speedLabel.textContent = `${(+speedInput.value).toFixed(2)}×`;
});

const playButton = document.getElementById('play');
const resetButton = document.getElementById('reset');
const statBox = document.getElementById('stat');
playButton.addEventListener('click', () => (timer ? stop() : start()));
resetButton.addEventListener('click', reset);

setupDrop();

map.on('load', () => {
  addLayers();
  loadDataset(DATASETS[0]);
});

window.progression = { frames: () => frames, goTo: (i) => { index = i; render(); } };
window.map = map;
