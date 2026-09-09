// regionselect.js — shift-drag a rectangle on a MapLibre map to choose a
// lng/lat region, in place of MapLibre's built-in shift-drag "box zoom".
//
// The Elevation and Fire apps both run a simulation over a fixed patch of
// ground (a "model region") whose elevation they download once. This helper
// lets you draw a new patch: hold Shift, drag a box, release. It disables
// the native box-zoom, draws a dashed rubber-band while you drag, and calls
// you back with [[west, south], [east, north]].
//
// Dependency-free: it's handed the map object, it doesn't import MapLibre.

export function onRegionSelect(map, callback, {
  color = '#d9480f',        // rubber-band colour
  minPixels = 12,           // ignore drags smaller than this (treat as a click)
} = {}) {
  map.boxZoom.disable();    // take over Shift-drag from the native box-zoom

  const container = map.getContainer();
  const rubber = document.createElement('div');
  rubber.style.cssText =
    `position:absolute;pointer-events:none;z-index:5;display:none;` +
    `border:2px dashed ${color};background:${hexToRgba(color, 0.12)};`;
  container.appendChild(rubber);

  let start = null;         // {x, y} in container pixels, or null

  // container-relative pixel coords for a raw mouse event
  const pt = (e) => {
    const r = container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const place = (a, b) => {
    rubber.style.left = `${Math.min(a.x, b.x)}px`;
    rubber.style.top = `${Math.min(a.y, b.y)}px`;
    rubber.style.width = `${Math.abs(a.x - b.x)}px`;
    rubber.style.height = `${Math.abs(a.y - b.y)}px`;
  };

  const onMove = (e) => place(start, pt(e));

  const onUp = (e) => {
    const a = start;
    const b = pt(e);
    start = null;
    rubber.style.display = 'none';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    map.dragPan.enable();

    if (Math.abs(a.x - b.x) < minPixels || Math.abs(a.y - b.y) < minPixels) return;

    // screen corners -> lng/lat. NW pixel is (min x, min y); SE is (max, max).
    const nw = map.unproject([Math.min(a.x, b.x), Math.min(a.y, b.y)]);
    const se = map.unproject([Math.max(a.x, b.x), Math.max(a.y, b.y)]);
    callback([[nw.lng, se.lat], [se.lng, nw.lat]]);
  };

  // Start on a Shift + left-button press over the map.
  container.addEventListener('mousedown', (e) => {
    if (!e.shiftKey || e.button !== 0 || start) return;
    start = pt(e);
    map.dragPan.disable();               // don't also pan the map
    rubber.style.display = 'block';
    place(start, start);
    // track on the document so a release outside the map still ends cleanly
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// Pick a slippy-map tile zoom so the longer side of `bounds` comes out to
// about `targetSamples` DEM samples across — so the tile download stays
// bounded however large a box is drawn. Clamped to [min, max].
export function pickDemZoom([[w, s], [e, n]], { targetSamples = 700, min = 8, max = 15 } = {}) {
  const midLat = (s + n) / 2;
  const cos = Math.cos(midLat * Math.PI / 180);
  const spanM = Math.max((e - w) * 111320 * cos, (n - s) * 111320);
  const mPerSampleAtZ0 = (2 * Math.PI * 6378137 * cos) / 256;   // web-mercator, one tile = 256 px
  const z = Math.log2((mPerSampleAtZ0 * targetSamples) / spanM);
  return Math.max(min, Math.min(max, Math.round(z)));
}

// GeoJSON ring for a [[w,s],[e,n]] box — handy for drawing the region
// outline as a `line` layer.
export function boundsRing([[w, s], [e, n]]) {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] },
  };
}

function hexToRgba(hex, a) {
  const m = hex.replace('#', '');
  return `rgba(${parseInt(m.slice(0, 2), 16)},${parseInt(m.slice(2, 4), 16)},${parseInt(m.slice(4, 6), 16)},${a})`;
}
