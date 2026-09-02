// Import MapLibre as an ES module from a CDN — same "no build step" idea
// as the other apps in this repo (Leaflet in NYC, d3 in Voronoi). We load
// MapLibre's own bundle straight from unpkg (not a re-bundler like esm.sh)
// because MapLibre also needs to fetch a Web Worker file that sits next to
// this one, and unpkg serves that unchanged.
//
// MapLibre v6 has only named exports, so we pull them all in under one
// name and use maplibregl.Map, maplibregl.NavigationControl, ...
import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.mjs';

// MapLibre's controls (zoom buttons, attribution, popups) need its stylesheet.
// Rather than a <link> in index.html, we add it here so everything MapLibre
// needs is declared in one file. Same pinned version as the import above.
document.head.insertAdjacentHTML(
  'beforeend',
  '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.css">'
);

// --- 1. The map itself -------------------------------------------------

// Santa Fe Plaza, the center of downtown. MapLibre uses [lng, lat] order
// (note: that's the opposite of Leaflet's [lat, lng]).
const PLAZA = [-105.9377, 35.6870];

// A loose box around downtown — roughly the Railyard up to Marcy St, and
// Guadalupe St across to Paseo de Peralta. The map won't pan outside it,
// which keeps this demo pointed at the neighborhood we care about.
const DOWNTOWN_BOUNDS = [
  [-105.9520, 35.6770],  // southwest corner [lng, lat]
  [-105.9230, 35.6960],  // northeast corner [lng, lat]
];

const map = new maplibregl.Map({
  container: 'map',

  // The "style" is the whole look of the base map — colors, labels,
  // which roads show at which zoom. This one ("positron") is a clean,
  // light style hosted for free by OpenFreeMap: no API key, no signup.
  style: 'https://tiles.openfreemap.org/styles/positron',

  center: PLAZA,
  zoom: 15.3,      // close enough to see individual buildings
  pitch: 55,       // tilt the camera (0 = straight down, 60 = max-ish)
  bearing: -17.6,  // rotate so the street grid sits at a nice angle
  maxBounds: DOWNTOWN_BOUNDS,
  minZoom: 13,
  maxZoom: 19,
});

// Zoom / compass / tilt buttons, and a distance scale.
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

// --- 2. The 3D buildings layer --------------------------------------

// We have to wait until the base style has finished loading before we
// can add a layer on top of it.
map.on('load', () => {
  // The positron style already paints flat grey building shapes (its
  // layer is named "building"). A style is just an ordered list of
  // layers, so we can drop that one and replace it with a 3D version.
  if (map.getLayer('building')) map.removeLayer('building');

  map.addLayer({
    id: 'buildings-3d',
    type: 'fill-extrusion',   // "fill-extrusion" = a polygon pushed up into a 3D box

    // Draw from the same vector-tile data the base map uses. Every
    // OpenFreeMap style ships an "openmaptiles" source; inside it, the
    // "building" layer carries one polygon per building footprint,
    // straight from OpenStreetMap.
    source: 'openmaptiles',
    'source-layer': 'building',

    minzoom: 14,  // only bother drawing buildings once we're zoomed in

    paint: {
      'fill-extrusion-color': '#d9cbb3',

      // Height in meters. "render_height" is a field baked into the
      // tiles: it's the building's OSM "height" tag, or an estimate from
      // "building:levels" (~3 m per floor), or a small default when OSM
      // has neither.
      'fill-extrusion-height': ['get', 'render_height'],

      // Where the building starts vertically — nonzero for things like
      // raised walkways. Almost always 0 downtown.
      'fill-extrusion-base': ['get', 'render_min_height'],

      'fill-extrusion-opacity': 0.9,
    },
  });
});

// --- 3. Click a building for its address + info -----------------------

// What the vector tiles actually carry per building is just geometry +
// height (render_height / render_min_height / colour) — there is NO street
// address in the tiles. So we do it in two parts:
//   a) the height etc. comes straight from the clicked feature (instant), and
//   b) the address comes from one call to OpenStreetMap's free reverse
//      geocoder, Nominatim, asking "what's at this lat/lng?"
// Nominatim asks for light use only (≈1 request/second) — fine for clicking.

map.on('click', 'buildings-3d', async (e) => {
  const props = e.features[0].properties;
  const height = props.render_height;

  // Open a popup right away with a placeholder while the address loads.
  const popup = new maplibregl.Popup({ maxWidth: '260px' })
    .setLngLat(e.lngLat)
    .setHTML('<em>Looking up address…</em>')
    .addTo(map);

  const { lng, lat } = e.lngLat;
  const url = `https://nominatim.openstreetmap.org/reverse` +
    `?format=json&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`;

  try {
    const data = await (await fetch(url)).json();
    const a = data.address || {};
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const town = [a.city || a.town || a.village, a.postcode].filter(Boolean).join(' ');

    popup.setHTML(`
      <strong>${street || data.display_name || 'address not found'}</strong>
      ${town ? `<br>${town}` : ''}
      ${data.name ? `<br><span style="color:#555">${data.name}</span>` : ''}
      <br><span style="color:#777">
        height ≈ ${height ? Math.round(height) + ' m' : 'unknown'}
        ${props.render_min_height ? ` · base ${props.render_min_height} m` : ''}
      </span>
    `);
  } catch {
    popup.setHTML(`<strong>address lookup failed</strong>
      <br><span style="color:#777">height ≈ ${height ? Math.round(height) + ' m' : 'unknown'}</span>`);
  }
});

// Show a pointer cursor while hovering a building, so it's obviously clickable.
map.on('mouseenter', 'buildings-3d', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'buildings-3d', () => { map.getCanvas().style.cursor = ''; });

// Handy while tweaking: log the camera position when you stop moving,
// so you can copy good values back into center/zoom/pitch/bearing above.
map.on('moveend', () => {
  const c = map.getCenter();
  console.log(
    `center: [${c.lng.toFixed(4)}, ${c.lat.toFixed(4)}]  ` +
    `zoom: ${map.getZoom().toFixed(2)}  ` +
    `pitch: ${map.getPitch().toFixed(1)}  ` +
    `bearing: ${map.getBearing().toFixed(1)}`
  );
});
