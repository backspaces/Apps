# data

Downloadable data files shared across apps in this repo, rather than
duplicated per-app.

| file | used by | contents |
|---|---|---|
| `fire-santafe-sample.geojson` | [Progression](../Progression/) | a saved run of [Fire](../Fire/)'s made-up cellular spread model — 120 `MultiLineString` perimeters, keyed by `tick`, from `fire.save()` |
| `palisades-2025-progression.geojson` | [Progression](../Progression/) | CAL FIRE's official progression mapping for the January 2025 Palisades Fire (LA) — 11 `MultiPolygon` snapshots, keyed by `PROG_DATETIME`, 770 → 23,717 acres over 5 days |
| `camp-fire-2018-progression.geojson` | [Progression](../Progression/) | NIFC's historic GeoMAC archive for the November 2018 Camp Fire (CA) — 28 `MultiPolygon` snapshots, keyed by `perimeterdatetime`, 54,586 → 153,336 acres |
| `las-conchas-2011-progression.geojson` | [Progression](../Progression/) | NIFC's historic GeoMAC archive for the June–July 2011 Las Conchas Fire (Jemez Mountains, NM) — 29 `MultiPolygon` snapshots, keyed by `perimeterdatetime`, 43,641 → 156,656 acres |
| `dog-head-2016-progression.geojson` | [Progression](../Progression/) | NIFC's historic GeoMAC archive for the June 2016 Dog Head Fire (NM) — 18 `MultiPolygon` snapshots, keyed by `perimeterdatetime`, 682 → 17,911 acres |
| `powder-fox-tartar-2026-progression.geojson` | [Progression](../Progression/) | SimTable's time-of-arrival raster for the Jul–Aug 2026 Powder/Fox/Tartar Fire Complex (OR), converted to polygons — 58 `MultiPolygon` frames, keyed by `utcMs`, one per real report time |

The real ones (everything but the Fire sample) are downloaded and cleaned
up by `fetch-progression.js`:

```sh
deno -A fetch-progression.js --list        # known dataset names
deno -A fetch-progression.js camp-fire-2018
deno -A fetch-progression.js --all         # refetch everything
```

Two source shapes feed it. Most are an ArcGIS FeatureServer of dated
perimeter vectors (NIFC's historic GeoMAC archive, or a one-off agency
progression service) — the script handles the two things a plain REST
query leaves for you to clean up by hand: oversized geometry (the
server-side `maxAllowableOffset` param — cut Camp Fire from 24.6 MB to
1.5 MB) and incidents that report several disjoint polygon pieces per date
instead of one (`dissolveByDate`, tested against Hermits Peak/Calf Canyon —
see the script's `SOURCES` entry for why that one's output isn't shipped
here despite the mechanics working). The other shape, `kind: "toa-raster"`,
is a single PNG where each pixel's color packs a seconds-since-ignition
value (SimTable's format — see Powder/Fox/Tartar's `SOURCES` entry for the
decoding and downsampling); the script thresholds it at each of the
incident's real report times to produce the same per-frame `MultiPolygon`
shape as everything else, so the Progression app never has to know a
raster was involved.

See [Progression/README.md](../Progression/README.md) for how each dataset
is shaped and where it was found.
