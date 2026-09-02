// fetch-buildings.js — download every building in the downtown box, with all
// its OpenStreetMap tags, and save it as GeoJSON + CSV.
//
//   deno -A fetch-buildings.js
//
// The map (map.js) only ever sees the handful of fields baked into the
// vector tiles (render_height, etc.). To get the *full* data — names,
// addresses, floor counts, build dates, Wikidata links — you have to ask
// OpenStreetMap directly. The Overpass API does exactly that: you send it a
// query, it sends back matching OSM elements with every tag.
//
// This is the scripted version. For poking around interactively instead,
// paste the query below into https://overpass-turbo.eu .

// Same downtown rectangle as map.js's DOWNTOWN_BOUNDS, but written the way
// Overpass wants it: (south, west, north, east).
const BBOX = "35.6770,-105.9520,35.6960,-105.9230";

// Overpass QL:
//   nwr["building"]  -> nodes, ways and relations tagged building=*
//   (bbox)           -> only inside our rectangle
//   out geom;        -> include each element's full geometry (lat/lon list)
const query = `
  [out:json][timeout:180];
  nwr["building"](${BBOX});
  out geom;
`;

console.log("Querying Overpass…");
const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "SantaFe-Apps-demo (github.com/backspaces)",
  },
  body: "data=" + encodeURIComponent(query),
});
if (!res.ok) {
  console.error(`Overpass returned ${res.status}. It may be busy — try again in a minute.`);
  Deno.exit(1);
}
const { elements } = await res.json();
console.log(`Got ${elements.length} building elements.`);

// --- Convert to GeoJSON -----------------------------------------------------
// A "way" with geometry is just a ring of points -> a GeoJSON Polygon.
// (The ~1% that are multipolygon "relations" we emit as their outer ring;
// good enough for a demo. Nodes tagged building=* become points.)
function toFeature(el) {
  let geometry = null;
  if (el.type === "node") {
    geometry = { type: "Point", coordinates: [el.lon, el.lat] };
  } else if (el.type === "way" && el.geometry) {
    geometry = {
      type: "Polygon",
      coordinates: [el.geometry.map((p) => [p.lon, p.lat])],
    };
  } else if (el.type === "relation" && el.members) {
    const outers = el.members
      .filter((m) => m.type === "way" && m.role === "outer" && m.geometry)
      .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
    if (outers.length) geometry = { type: "Polygon", coordinates: outers };
  }
  return {
    type: "Feature",
    id: `${el.type}/${el.id}`,
    properties: { osm_id: `${el.type}/${el.id}`, ...(el.tags ?? {}) },
    geometry,
  };
}

const features = elements.map(toFeature).filter((f) => f.geometry);
const geojson = { type: "FeatureCollection", features };
await Deno.writeTextFile("buildings.geojson", JSON.stringify(geojson));
console.log(`Wrote buildings.geojson (${features.length} features).`);

// --- Also write a flat CSV of the columns people usually want --------------
const COLUMNS = [
  "osm_id", "name", "building", "building:levels", "height",
  "addr:housenumber", "addr:street", "addr:postcode",
  "amenity", "shop", "tourism", "historic", "start_date", "wikidata",
];
const csvCell = (v = "") => `"${String(v).replaceAll('"', '""')}"`;
const rows = [COLUMNS.join(",")];
for (const f of features) {
  rows.push(COLUMNS.map((c) => csvCell(f.properties[c])).join(","));
}
await Deno.writeTextFile("buildings.csv", rows.join("\n") + "\n");
console.log(`Wrote buildings.csv (${features.length} rows).`);

// --- Quick summary --------------------------------------------------------
const count = (key) => features.filter((f) => f.properties[key] != null).length;
console.log("\nTag coverage:");
for (const k of ["name", "addr:street", "building:levels", "height", "amenity", "historic"]) {
  console.log(`  ${String(count(k)).padStart(4)}  ${k}`);
}
