// fetch-progression.js — pull a fire's dated perimeter snapshots from an
// ArcGIS FeatureServer layer (NIFC's historic GeoMAC archive, or a one-off
// agency progression service) and write a clean, right-sized GeoJSON file
// into this folder for the Progression app.
//
//   deno -A fetch-progression.js <name>     # one entry of SOURCES below
//   deno -A fetch-progression.js --all      # refetch every known dataset
//   deno -A fetch-progression.js --list     # show known dataset names
//
// Two problems a plain REST query leaves for you to deal with by hand:
//
//   - Old GeoMAC perimeters are full-precision infrared-flight boundaries —
//     tens of MB for one fire, no visible benefit at map scale. `offset`
//     asks the ArcGIS server to generalize the geometry server-side before
//     it's even sent (the `maxAllowableOffset` query param, in degrees) —
//     this is what took Camp Fire 2018 from 24.6 MB to 1.5 MB.
//   - Some incidents report several disjoint polygon pieces sharing one
//     date instead of a single feature (Hermits Peak/Calf Canyon: ~500
//     pieces across 37 days). `dissolveByDate: true` merges same-date
//     features into one MultiPolygon feature — not a real geometric union,
//     just concatenated rings, which is all a fill/line layer needs to
//     draw correctly (Fire's own `draw()` merges burnt cells into
//     row-rects the same unfussy way).
//
// GeoMAC itself was retired in 2020, so its historic archive only goes
// through 2019 — there's no equivalent single feed for later fires. Recent
// incidents need a one-off agency service found per-fire (see
// Progression/README.md's "Where the real data came from").
//
// A third source shape entirely: `kind: "toa-raster"` sources (from
// SimTable) are a single PNG "time of arrival" image, not dated perimeter
// vectors — each pixel's RGB packs a seconds-since-ignition value
// (`R*65536 + G*256 + B`; pure white, 16777215, means "never reached").
// `fetchToaRaster` decodes it, downsamples to a coarse grid, and thresholds
// that grid at each of the incident's real report times to produce the
// same "one MultiPolygon per dated frame" shape every other source here
// produces — so nothing downstream (Progression app included) needs to
// know a raster was ever involved.

import { PNG } from "npm:pngjs@7";
import { Buffer } from "node:buffer";
import { union } from "npm:@turf/union@7";
import { featureCollection } from "npm:@turf/helpers@7";

const SOURCES = {
  "camp-fire-2018": {
    url: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Historic_Geomac_Perimeters_2018/FeatureServer/0",
    where: "incidentname='CAMP'",
    dateField: "perimeterdatetime",
    outFields: "incidentname,perimeterdatetime,gisacres,state",
    offset: 0.0001,
    outFile: "camp-fire-2018-progression.geojson",
  },
  "las-conchas-2011": {
    url: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Historic_Geomac_Perimeters_2011/FeatureServer/0",
    where: "incidentname='Las Conchas'",
    dateField: "perimeterdatetime",
    outFields: "incidentname,perimeterdatetime,gisacres,state",
    offset: 0.0001,
    outFile: "las-conchas-2011-progression.geojson",
  },
  "dog-head-2016": {
    url: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Historic_Geomac_Perimeters_2016/FeatureServer/0",
    where: "incidentname='Dog Head'",
    dateField: "perimeterdatetime",
    outFields: "incidentname,perimeterdatetime,gisacres,state",
    offset: 0.0001,
    outFile: "dog-head-2016-progression.geojson",
  },
  "palisades-2025": {
    url: "https://services.arcgis.com/xsiPoFK0f7RrxF0D/arcgis/rest/services/Palisades_Fire_Progression/FeatureServer/0",
    where: "1=1",
    dateField: "PROG_DATETIME",
    outFields:
      "PROG_DATETIME,PROG_DATE,PROG_TIME,PROG_DAILY_ACRES,PROG_TOTAL_ACRES,PROG_GIS_ACRES",
    // Already a clean 11 features / ~1.4 MB — no offset needed.
    outFile: "palisades-2025-progression.geojson",
  },
  // NOT wired into the Progression app yet — the dissolve+simplify mechanics
  // check out (493 pieces / 22 MB -> 37 dated frames / 3.3 MB), but the
  // Acres_1 attribute doesn't: it hits 474,490 ac by 2022-05-22, already
  // past the fire's real, official final size (341,735 ac, reached months
  // later in August 2022). The source item's own title — "Relationship
  // Between Forest Thinning Treatments and Hermit's Peak Fire Progression"
  // — suggests this layer mixes in treatment-area polygons rather than
  // being a pure fire perimeter. Left here as a documented, working
  // *fetch*; don't ship its output without resolving that first (ask NM
  // State Forestry what Acres_1 actually represents, or find a cleaner
  // source for this fire).
  "hermits-peak-2022": {
    url: "https://gis.emnrd.nm.gov/arcgis/rest/services/SFDView/Hermits_Peak_Time_Enabled/MapServer/0",
    where: "1=1",
    dateField: "Date",
    acresField: "Acres_1",
    outFields: "Date,Acres_1",
    offset: 0.0002,
    dissolveByDate: true,
    outFile: "hermits-peak-2022-progression.geojson",
  },
  // Was "fox-tartar-2026" (two fires) — Powder Fire joined the complex and
  // SimTable renamed the incident; this URL superseded the old one (which
  // now 302s to a login page). `base` can also be a local path instead of
  // a URL — useful if their server gates a link again before this one does.
  "powder-fox-tartar-2026": {
    kind: "toa-raster",
    // <base>.png (the raster), <base>.json (worldfile + real report times/
    // acres — though note this incident's own `acres` array is length 61
    // against 58 `files`/`UTC` entries, misaligned in the source; we don't
    // use it, computing acreage from the raster instead), <base>.pgw (same
    // worldfile, redundant with the JSON's copy).
    base:
      "https://incidents.anyhazard.com/PowderFoxTartarComplexPS040826/PowderFoxTartarComplexPS040826",
    grid: 180, // downsampled grid width in cells; ~12px/cell at this image's 2048px
    outFile: "powder-fox-tartar-2026-progression.geojson",
  },
};

async function fetchProgression(name) {
  const src = SOURCES[name];
  if (!src) {
    throw new Error(`Unknown dataset "${name}". Known: ${Object.keys(SOURCES).join(", ")}`);
  }
  if (src.kind === "toa-raster") return fetchToaRaster(name, src);

  const params = new URLSearchParams({
    where: src.where,
    outFields: src.outFields,
    orderByFields: `${src.dateField} ASC`,
    outSR: "4326",
    f: "geojson",
  });
  if (src.offset) params.set("maxAllowableOffset", String(src.offset));

  console.log(`Fetching ${name}…`);
  const res = await fetch(`${src.url}/query?${params}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  let geojson = await res.json();
  if (geojson.error) throw new Error(`${name}: ${JSON.stringify(geojson.error)}`);
  console.log(`  ${geojson.features.length} features`);

  if (src.dissolveByDate) {
    geojson = dissolveByDate(geojson, src.dateField, src.acresField);
    console.log(`  dissolved to ${geojson.features.length} dated frames`);
  }

  const text = JSON.stringify(geojson);
  await Deno.writeTextFile(src.outFile, text);
  console.log(`  wrote ${src.outFile} (${(text.length / 1e6).toFixed(2)} MB)`);
}

// Merge every feature sharing the same date value into one feature, summing
// their acreage. A real geometric union (Turf), not just concatenating
// rings — matters when a date's pieces overlap (union merges them cleanly;
// concatenated rings would double-draw the overlap and leave a seam).
// Build-time only — this and its dependencies never reach the browser.
function dissolveByDate(geojson, dateField, acresField) {
  const byDate = new Map();
  for (const f of geojson.features) {
    const key = f.properties[dateField];
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(f);
  }
  const features = [...byDate.entries()].map(([date, group]) => {
    const merged = group.length === 1
      ? group[0].geometry
      : union(featureCollection(group.map((f) => ({ ...f, properties: {} })))).geometry;
    return {
      type: "Feature",
      properties: {
        [dateField]: date,
        // Each piece of a multi-piece date carries the *same* cumulative
        // total already (confirmed on Hermits Peak: two pieces on one date,
        // identical Acres_1 on both) — summing would double-count, so take
        // the max instead (equal to "any of them" when they already agree).
        [acresField]: Math.max(...group.map((f) => f.properties[acresField] ?? 0)),
        pieces: group.length,
      },
      geometry: merged,
    };
  });
  return { type: "FeatureCollection", features };
}

// `base` can be a URL (fetched over HTTP) or a local path (SimTable's
// server has started requiring a login, so these sometimes arrive as a
// manual download instead of a stable public link).
async function readJson(base) {
  return base.startsWith("http")
    ? await (await fetch(`${base}.json`)).json()
    : JSON.parse(await Deno.readTextFile(`${base}.json`));
}
async function readPng(base) {
  return base.startsWith("http")
    ? new Uint8Array(await (await fetch(`${base}.png`)).arrayBuffer())
    : await Deno.readFile(`${base}.png`);
}

// Turn a SimTable time-of-arrival raster into the same "one MultiPolygon
// per dated frame" shape the vector sources above produce.
async function fetchToaRaster(name, src) {
  console.log(`Fetching ${name}…`);
  const json = await readJson(src.base);
  const pngBuf = await readPng(src.base);
  const { width, height, data } = PNG.sync.read(Buffer.from(pngBuf));

  // worldfile4326: pixelWidth, rotation, rotation, pixelHeight(negative),
  // top-left lon, top-left lat — the standard 6-line ESRI world-file
  // fields, already reprojected to plain lon/lat degrees for us.
  const [pw, , , ph, tlx, tly] = json.worldfile4326.split("\n").map(Number);
  // t=0 for the packed values is the complex's earliest ignition, not the
  // first *reported* time (which can lag origin by hours) — see the origin
  // object on the first entry of `fires`. Fall back to the first report if
  // a future TOA export doesn't carry `fires` the same way.
  const originUtc = json.fires?.[0]?.origin?.UTC ?? json.UTC[0];
  const SENTINEL = 16777215; // 0xFFFFFF — "never reached" (pure white)
  const valAt = (px, py) => {
    const i = (py * width + px) * 4;
    return data[i] * 65536 + data[i + 1] * 256 + data[i + 2];
  };

  // Downsample to a coarse grid by point-sampling each cell's center pixel.
  // A min/max over each block would dilate or erode the fire's boundary and
  // bias the burned-area count (tried it: ~8% overshoot); a straight
  // nearest-neighbor resample doesn't.
  const bx = Math.ceil(width / src.grid), by = Math.ceil(height / src.grid);
  const cols = Math.ceil(width / bx), rows = Math.ceil(height / by);
  const cell = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const py = Math.min(height - 1, Math.floor(r * by + by / 2));
    for (let c = 0; c < cols; c++) {
      const px = Math.min(width - 1, Math.floor(c * bx + bx / 2));
      const v = valAt(px, py);
      cell[r * cols + c] = v === SENTINEL ? Infinity : v;
    }
  }
  console.log(`  ${width}x${height} raster -> ${cols}x${rows} grid`);

  const dLng = pw * bx, dLat = ph * by; // ph already negative (north to south)
  const rowRect = (c0, c1, r) => {
    const w = tlx + c0 * dLng, e = tlx + (c1 + 1) * dLng;
    const n = tly + r * dLat, s = n + dLat;
    return [[[w, n], [e, n], [e, s], [w, s], [w, n]]];
  };
  const metresPerDegLat = 111320;
  const metresPerDegLng = metresPerDegLat * Math.cos((tly + dLat * rows / 2) * Math.PI / 180);
  const cellAcres = Math.abs(dLng * metresPerDegLng * dLat * metresPerDegLat) / 4046.86;

  // One frame per real report time (json.UTC), not an arbitrary even
  // spacing — ties the raster-derived frames to the same moments the
  // incident's own KML reports were issued.
  const features = json.UTC.map((utcMs, k) => {
    const thresh = (utcMs - originUtc) / 1000;
    const members = [];
    let burnedCount = 0;
    for (let r = 0; r < rows; r++) {
      let c0 = -1;
      for (let c = 0; c <= cols; c++) {
        const burned = c < cols && cell[r * cols + c] <= thresh;
        if (burned) burnedCount++;
        if (burned === (c0 >= 0)) continue;
        if (c0 >= 0) members.push(rowRect(c0, c - 1, r));
        c0 = burned ? c : -1;
      }
    }
    return {
      type: "Feature",
      properties: { utcMs, acres: +(burnedCount * cellAcres).toFixed(1) },
      geometry: { type: "MultiPolygon", coordinates: members },
    };
  });

  const text = JSON.stringify({ type: "FeatureCollection", features });
  await Deno.writeTextFile(src.outFile, text);
  console.log(`  wrote ${features.length} frames to ${src.outFile} (${(text.length / 1e6).toFixed(2)} MB)`);
}

const [arg] = Deno.args;
if (arg === "--list") {
  console.log(Object.keys(SOURCES).join("\n"));
} else if (arg === "--all") {
  for (const name of Object.keys(SOURCES)) await fetchProgression(name);
} else if (arg) {
  await fetchProgression(arg);
} else {
  console.log(
    `Usage: deno -A fetch-progression.js <name>|--all|--list\nKnown datasets: ${
      Object.keys(SOURCES).join(", ")
    }`
  );
}
