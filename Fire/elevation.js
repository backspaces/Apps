// elevation.js — fetch a patch of terrain as a lng/lat-addressable elevation grid.
//
// Standalone: no dependencies, no MapLibre. Give it a lng/lat bounding box and a
// slippy-map zoom level; it works out which DEM tiles cover the box, downloads
// and decodes them, and returns a grid where every sample knows its elevation
// in metres and its lng/lat.
//
// The default tiles are "terrarium" PNGs (height packed into the RGB channels)
// from AWS's free Terrain Tiles open data set. The grid it returns is the whole
// tile mosaic, so it is a little larger than the box you asked for — `.bounds`
// gives its true extent.
//
// Runs anywhere with `fetch`, `createImageBitmap` and `OffscreenCanvas`
// (all browsers; Deno with `--unstable` canvas).

const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;

// --- Web Mercator <-> lng/lat -----------------------------------------
// "Normalised" mercator: x and y run 0..1 from the NW corner of the world
// (lng -180, lat ~85.0511). Longitude is linear in x; latitude is NOT linear
// in y, which is why the grid un-projects every row rather than lerping the
// north/south bounds.

export function lngLatToMercator(lng, lat) {
  const x = (lng + 180) / 360;
  const s = Math.sin(lat * D2R);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
}

export function mercatorToLngLat(x, y) {
  const lng = x * 360 - 180;
  const lat = (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) * R2D;
  return [lng, lat];
}

// --- height-encoding decoders ----------------------------------------

const DECODERS = {
  // https://github.com/tilezen/joerd/blob/master/docs/formats.md
  terrarium: (r, g, b) => r * 256 + g + b / 256 - 32768,
  // Mapbox / MapTiler "Terrain-RGB"
  'terrain-rgb': (r, g, b) => -10000 + (r * 65536 + g * 256 + b) * 0.1,
};
DECODERS.mapbox = DECODERS['terrain-rgb'];

// --- one tile: fetch PNG -> Float array of metres --------------------

async function fetchTile(url, tileSize, decode) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);

  // AWS Terrain Tiles report which real data set each tile came from.
  const source = res.headers.get('x-amz-meta-x-imagery-sources');

  // colorSpaceConversion/premultiplyAlpha 'none' keep the bytes exactly as
  // stored — a colour-managed decode would corrupt the packed heights.
  const bitmap = await createImageBitmap(await res.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const canvas = new OffscreenCanvas(tileSize, tileSize);
  const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  ctx.drawImage(bitmap, 0, 0, tileSize, tileSize);
  bitmap.close?.();

  const { data: rgba } = ctx.getImageData(0, 0, tileSize, tileSize);
  const out = new Float32Array(tileSize * tileSize);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    out[p] = decode(rgba[i], rgba[i + 1], rgba[i + 2]);
  }
  return { heights: out, source };
}

// run async `fn` over `items`, at most `limit` at a time
async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

// --- the grid -------------------------------------------------------

export class ElevationGrid {
  constructor({ data, width, height, zoom, merc, tiles, sources }) {
    this.data = data;        // Float32Array, row-major, north row first
    this.width = width;
    this.height = height;
    this.zoom = zoom;
    this.tiles = tiles;      // { x0, x1, y0, y1 } tile indices covered
    this.sources = sources;  // Set<string> of underlying imagery data sets
    this._merc = merc;       // { west, east, north, south } in normalised mercator

    const [west, north] = mercatorToLngLat(merc.west, merc.north);
    const [east, south] = mercatorToLngLat(merc.east, merc.south);
    this.bounds = { west, south, east, north };
  }

  get count() { return this.width * this.height; }

  // Raw sample at a pixel (col east from the west edge, row south from the
  // north edge). NaN if out of range.
  get(col, row) {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return NaN;
    return this.data[row * this.width + col];
  }

  // lng/lat of a pixel's centre.
  lngLatAt(col, row) {
    const { west, east, north, south } = this._merc;
    const mx = west + ((col + 0.5) / this.width) * (east - west);
    const my = north + ((row + 0.5) / this.height) * (south - north);
    return mercatorToLngLat(mx, my);
  }

  // Fractional pixel coords for a lng/lat (inverse of lngLatAt).
  pixelAt(lng, lat) {
    const { west, east, north, south } = this._merc;
    const [mx, my] = lngLatToMercator(lng, lat);
    return [
      ((mx - west) / (east - west)) * this.width - 0.5,
      ((my - north) / (south - north)) * this.height - 0.5,
    ];
  }

  // Is this lng/lat inside the mosaic at all?
  contains(lng, lat) {
    const { west, south, east, north } = this.bounds;
    return lng >= west && lng <= east && lat >= south && lat <= north;
  }

  // Bilinear-interpolated elevation (metres) at a lng/lat, or null if the
  // point is outside the mosaic. Within the last half-pixel of an edge the
  // stencil is clamped inward rather than returning null.
  elevation(lng, lat) {
    if (!this.contains(lng, lat)) return null;
    const [fx, fy] = this.pixelAt(lng, lat);
    const cx = Math.min(this.width - 1.001, Math.max(0, fx));
    const cy = Math.min(this.height - 1.001, Math.max(0, fy));
    const x0 = Math.floor(cx), y0 = Math.floor(cy);
    const tx = cx - x0, ty = cy - y0;
    const a = this.data[y0 * this.width + x0];
    const b = this.data[y0 * this.width + x0 + 1];
    const c = this.data[(y0 + 1) * this.width + x0];
    const d = this.data[(y0 + 1) * this.width + x0 + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  // Visit every sample: fn(lng, lat, metres, col, row).
  forEach(fn) {
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const [lng, lat] = this.lngLatAt(col, row);
        fn(lng, lat, this.data[row * this.width + col], col, row);
      }
    }
  }

  // Min/max elevation over the mosaic.
  range() {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min, max };
  }

  // GeoJSON Points, optionally decimated (`step`) or clipped to a lng/lat
  // `bbox` = [west, south, east, north]. One point per sample can be a lot —
  // pass a step for anything you mean to draw.
  toGeoJSON({ step = 1, bbox } = {}) {
    const hit = bbox
      ? (lng, lat) => lng >= bbox[0] && lat >= bbox[1] && lng <= bbox[2] && lat <= bbox[3]
      : () => true;
    const features = [];
    for (let row = 0; row < this.height; row += step) {
      for (let col = 0; col < this.width; col += step) {
        const [lng, lat] = this.lngLatAt(col, row);
        if (!hit(lng, lat)) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { elevation: this.data[row * this.width + col] },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }
}

// --- the entry point ----------------------------------------------

// fetchElevation({ bounds, zoom }) -> Promise<ElevationGrid>
//
//   bounds       [[west, south], [east, north]] in lng/lat
//   zoom         slippy-map tile zoom (rounded to an integer)
//   url          tile URL template, {z}/{x}/{y}
//   encoding     'terrarium' (default) | 'terrain-rgb'
//   tileSize     256 (default)
//   concurrency  max simultaneous tile downloads (default 8)
export async function fetchElevation({
  bounds,
  zoom,
  url = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
  encoding = 'terrarium',
  tileSize = 256,
  concurrency = 8,
} = {}) {
  const decode = DECODERS[encoding];
  if (!decode) throw new Error(`unknown encoding "${encoding}"`);

  const z = Math.round(zoom);
  const n = 2 ** z;
  const [[west, south], [east, north]] = bounds;

  // lng/lat box -> the block of tiles that covers it
  const [mxW] = lngLatToMercator(west, north);
  const [mxE] = lngLatToMercator(east, south);
  const [, myN] = lngLatToMercator(west, north);
  const [, myS] = lngLatToMercator(east, south);

  const x0 = Math.floor(mxW * n);
  const x1 = Math.floor(mxE * n);
  const y0 = Math.max(0, Math.floor(myN * n));
  const y1 = Math.min(n - 1, Math.floor(myS * n));

  const width = (x1 - x0 + 1) * tileSize;
  const height = (y1 - y0 + 1) * tileSize;
  const data = new Float32Array(width * height);

  const merc = { west: x0 / n, east: (x1 + 1) / n, north: y0 / n, south: (y1 + 1) / n };

  const jobs = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) jobs.push({ tx, ty });
  }

  const sources = new Set();
  await mapLimit(jobs, concurrency, async ({ tx, ty }) => {
    const wrappedX = ((tx % n) + n) % n;   // wrap across the antimeridian
    const tileUrl = url
      .replace('{z}', z).replace('{x}', wrappedX).replace('{y}', ty);
    const { heights, source } = await fetchTile(tileUrl, tileSize, decode);
    if (source) source.split(/[;,]\s*/).forEach((s) => s && sources.add(s.trim()));

    const ox = (tx - x0) * tileSize;
    const oy = (ty - y0) * tileSize;
    for (let py = 0; py < tileSize; py++) {
      const dst = (oy + py) * width + ox;
      const src = py * tileSize;
      for (let px = 0; px < tileSize; px++) data[dst + px] = heights[src + px];
    }
  });

  return new ElevationGrid({
    data, width, height, zoom: z, merc, tiles: { x0, x1, y0, y1 }, sources,
  });
}
