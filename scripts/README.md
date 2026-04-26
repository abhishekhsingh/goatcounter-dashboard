# scripts/

Optional build tooling for the GoatCounter dashboard. **The dashboard itself does not need Node.** Routine code changes (editing `../index.html`, CSS, etc.) don't run anything in this folder.

## When to use this

You only need to run anything here if you're regenerating `../assets/world-map.js` — the choropleth world-map data. That's a rare event: country boundaries change very slowly, and the underlying dataset (Natural Earth 110m via `world-atlas`) is updated every few years.

## Regenerate the world map

```bash
cd scripts/
npm install
node build-world-map.js
```

This rewrites `../assets/world-map.js` from the pinned source data:

- `world-atlas@2.0.2` — Natural Earth 110m country geometries (TopoJSON, public domain). Pinned via npm.
- `topojson-client@3.1.0` — TopoJSON → GeoJSON decoder. Pinned via npm.
- `data/iso-3166.json` — canonical ISO 3166-1 country list, vendored from [lukes/ISO-3166-Countries-with-Regional-Codes](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes) (CC0). Vendored rather than installed because the popular npm packages ship outdated names ("Turkey", "Czech Republic", "Swaziland") that would mis-map countries at runtime.

All three sources are pinned — the npm deps to exact versions in `package.json`, and the ISO list by being checked in. The script produces byte-identical output on every run. Bumping any source is a deliberate act and should be reviewed.

## Output format

`../assets/world-map.js` exposes three globals when loaded:

- `window.WORLD_MAP_VIEWBOX` — `"0 0 1000 500"`.
- `window.WORLD_MAP_PATHS` — `{ [isoAlpha2]: svgPathString }`. ~174 countries.
- `window.WORLD_MAP_NAMES` — `{ [canonicalEnglishName]: isoAlpha2 }`, restricted to countries that have a path. Used by `index.html` as a fallback when its hand-curated `COUNTRY_NAME_TO_CODE` table doesn't have an explicit variant.

The script's logic (projection, antimeridian split, country-name aliasing, Antarctica handling) is documented inline in `build-world-map.js`.

## Adding country-name variants

If GoatCounter starts returning a country name that isn't matching:

- **For variant English names** (e.g. "Czech Republic" vs "Czechia"): add the variant to `COUNTRY_NAME_TO_CODE` in `../index.html` and **don't** rebuild the map. The runtime table is the right place for variant handling.
- **For names world-atlas labels differently** (e.g. "United States of America" vs "United States"): the `nameAlias` map in `build-world-map.js` already covers known cases. Add to it and rebuild only if a new world-atlas-specific label comes up.

When in doubt, append `?debug=1` to the dashboard URL — it logs unmapped names to the console so you can see exactly what's missing.
