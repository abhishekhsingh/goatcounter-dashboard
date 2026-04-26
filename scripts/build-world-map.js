// Regenerate ../assets/world-map.js from pinned source data.
//
// This is an OPTIONAL, run-once tool — the dashboard ships the generated
// file and never sees Node at runtime. Re-run only when the underlying
// country dataset needs refreshing (boundary changes, new countries, etc.).
//
// Usage:
//   cd scripts/
//   npm install
//   node build-world-map.js
//
// Output:
//   ../assets/world-map.js
//
// Determinism note: all three deps are pinned to exact versions in
// package.json so the script produces byte-identical output on every run.
// Bumping any of them is a deliberate act and should be reviewed.

const fs = require('fs');
const path = require('path');
const topojson = require('topojson-client');

// --- Source data --------------------------------------------------------
// world-atlas ships countries-110m.json as a TopoJSON file at the package
// root. Each country has a numeric M49 id and an English `name` property.
const topology = require('world-atlas/countries-110m.json');

// ISO-3166 list is vendored at data/iso-3166.json (originally from
// https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes,
// CC0-licensed). We vendor rather than depend on an npm package because
// the canonical-name churn (Czechia, Türkiye, Eswatini, North Macedonia,
// disambiguated Congos) lives in this list — the popular npm packages
// for ISO-3166 ship outdated names that would mis-map countries at
// runtime. The vendored file is byte-pinned by being checked in.
const isoList = require('./data/iso-3166.json');

const m49ToIso = {};
const nameToIso = {};
for (const c of isoList) {
  m49ToIso[c['country-code']] = c['alpha-2'];
  nameToIso[c.name] = c['alpha-2'];
}

// world-atlas labels diverge from the canonical ISO names for ~30 countries.
// Manual aliases keep the lookup deterministic without depending on fuzzy
// matching. Keep this list trimmed to actual world-atlas labels — adding
// arbitrary variants here belongs in the runtime COUNTRY_NAME_TO_CODE table
// in index.html, not here.
const nameAlias = {
  'United States of America': 'US',
  'W. Sahara': 'EH',
  'Dem. Rep. Congo': 'CD',
  'Dominican Rep.': 'DO',
  'Falkland Is.': 'FK',
  "Côte d'Ivoire": 'CI',
  'Central African Rep.': 'CF',
  'Eq. Guinea': 'GQ',
  'eSwatini': 'SZ',
  'Solomon Is.': 'SB',
  'Taiwan': 'TW',
  'Bosnia and Herz.': 'BA',
  'Macedonia': 'MK',
  'North Macedonia': 'MK',
  'Czechia': 'CZ',
  'Czech Rep.': 'CZ',
  'S. Sudan': 'SS',
  'Somaliland': 'SO',
  'N. Cyprus': 'CY',
  'Vanuatu': 'VU',
  'Russia': 'RU',
  'Iran': 'IR',
  'Syria': 'SY',
  'Vietnam': 'VN',
  'Laos': 'LA',
  'South Korea': 'KR',
  'North Korea': 'KP',
  'Bolivia': 'BO',
  'Venezuela': 'VE',
  'Tanzania': 'TZ',
  'Moldova': 'MD',
  'Brunei': 'BN',
  'Palestine': 'PS',
  'Kosovo': 'XK', // de-facto code used by EU/IBAN; not in ISO 3166-1 yet.
};

// Names we never want to render — Antarctica is the obvious one (no traffic,
// huge distorted shape, breaks the equirectangular bounds we're using).
const SKIP = new Set(['Antarctica']);

// --- Projection ---------------------------------------------------------
// Equirectangular: x = (lon + 180) / 360 * width, y depends on lat range.
// We do NOT clamp the input — vertices outside the lat range project to
// values outside the viewBox and get clipped by SVG's overflow:hidden.
// Clamping caused horizontal-line artifacts along the boundary.
const W = 1000, H = 500;
const PAD = 10;
const LAT_MAX = 84, LAT_MIN = -58;

function project([lon, lat]) {
  const x = ((lon + 180) / 360) * (W - 2 * PAD) + PAD;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (H - 2 * PAD) + PAD;
  return [x, y];
}

// Round to whole pixels — sub-pixel precision is wasted at the display sizes
// the dashboard renders the map at (~600px wide max).
function r(n) { return Math.round(n); }

// --- Path emission ------------------------------------------------------
// Compact d= strings:
//   1. Implicit L (after the initial M, additional points are line-tos).
//   2. Skip duplicate consecutive points (rounding can produce them).
//   3. Antimeridian split: when consecutive projected x-values jump > W/2,
//      the segment is wrapping the dateline. Close the current subpath and
//      start a new one with M, otherwise we'd draw a horizontal line across
//      the whole map (Russia, Fiji, USA-Aleutians all hit this).
const ANTIMERIDIAN_DX = W / 2;

function ringToSvg(ring) {
  if (!ring.length) return '';
  let [lastX, lastY] = project(ring[0]).map(r);
  const parts = ['M' + lastX + ',' + lastY];
  for (let i = 1; i < ring.length; i++) {
    const [x, y] = project(ring[i]).map(r);
    if (x === lastX && y === lastY) continue;
    if (Math.abs(x - lastX) > ANTIMERIDIAN_DX) {
      parts.push('Z M' + x + ',' + y);
    } else {
      parts.push(x + ',' + y);
    }
    lastX = x; lastY = y;
  }
  parts.push('Z');
  return parts.join(' ');
}

function geometryToSvg(geom) {
  const rings = geom.type === 'Polygon'
    ? geom.coordinates
    : geom.type === 'MultiPolygon'
      ? geom.coordinates.flat()
      : [];
  return rings.map(ringToSvg).filter(Boolean).join('');
}

// --- Walk the topology --------------------------------------------------
const features = topojson.feature(topology, topology.objects.countries).features;

const result = {};
const skipped = [];
const unmapped = [];
let mergedCount = 0;

for (const f of features) {
  const name = f.properties.name;
  if (SKIP.has(name)) { skipped.push(name); continue; }

  // Resolve to ISO alpha-2: try M49 numeric first, then alias, then exact name.
  const code = m49ToIso[String(f.id).padStart(3, '0')]
            || nameAlias[name]
            || nameToIso[name];

  if (!code) { unmapped.push(name); continue; }

  const path = geometryToSvg(f.geometry);
  if (!path) continue;

  // Merge if two world-atlas geometries share an ISO code (Cyprus + N. Cyprus,
  // Somalia + Somaliland) — concatenating subpaths is valid SVG.
  if (result[code]) mergedCount++;
  result[code] = (result[code] || '') + path;
}

console.error('ISO codes emitted:', Object.keys(result).length);
console.error('Geometries merged into existing codes:', mergedCount);
console.error('Skipped (filtered by name):', skipped.join(', ') || '(none)');
console.error('Unmapped (no ISO match — DROPPED):', unmapped.join(', ') || '(none)');

// --- Canonical names list -----------------------------------------------
// Restricted to countries we actually have a path for. Used at runtime as
// the fallback when COUNTRY_NAME_TO_CODE in index.html doesn't have an
// explicit variant. ISO is missing Kosovo; that's fine, it's covered by
// nameAlias above and shipped via WORLD_MAP_PATHS.
const namesMap = {};
for (const c of isoList) {
  if (result[c['alpha-2']]) namesMap[c.name] = c['alpha-2'];
}
console.error('Canonical names exported:', Object.keys(namesMap).length);

// --- Emit ---------------------------------------------------------------
const out = `// Generated by scripts/build-world-map.js — do not edit manually.
// Re-run \`cd scripts && npm install && node build-world-map.js\` to regenerate.
//
// Source data:
//   - world-atlas@2.0.2/countries-110m.json (Natural Earth 110m, public domain)
//   - scripts/data/iso-3166.json (vendored from lukes/ISO-3166, CC0)
//
// Projection: equirectangular, viewBox 1000×500, latitude range [-58, 84].
// Vertices outside that range get clipped by the SVG's overflow:hidden.
// Coordinates are rounded to whole pixels and antimeridian-crossing
// segments are split into separate subpaths.
//
// Loaded as a plain <script> tag (NOT through Babel) so the parse cost is
// O(JSON), not O(JS-with-JSX).
window.WORLD_MAP_VIEWBOX = "0 0 1000 500";
window.WORLD_MAP_PATHS = ${JSON.stringify(result)};
window.WORLD_MAP_NAMES = ${JSON.stringify(namesMap)};
`;

const outPath = path.join(__dirname, '..', 'assets', 'world-map.js');
fs.writeFileSync(outPath, out);
console.error('Wrote', outPath, '(' + out.length + ' bytes)');
