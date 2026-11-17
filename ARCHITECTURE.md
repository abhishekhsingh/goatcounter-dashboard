# Architecture

This is a folder of static files that the browser runs as they are. There is no bundler, no transpiler and no package install. This page explains how the pieces fit, so you can change them with confidence.

## Layout

```
index.html            entry: theme bootstrap, import map, module preloads, splash
css/
  app.css             shared structure: layout, cards, charts, popovers (uses tokens only)
  nova.css            the Nova design: tokens, fonts, glass, glow, aurora, tilt
  classic.css         the Classic design: tokens, fonts, flat cards
js/
  main.js             mounts the app
  ui.js               one import for Preact, hooks and the htm template tag
  api.js              GoatCounter client: auth, queue, rate limit, cache, errors
  cache.js            IndexedDB key/value cache (memory fallback)
  util.js             formatting, time zones, ranges, easing, chart maths
  model.js            turns API answers into series, spikes, patterns and highlights
  demo.js             seeded demo site that answers like the real API
  countries.js        country names to ISO codes, flags, lazy map loader
  icons.js            browser and system logos, device glyphs (loaded lazily)
  fx.js               pointer effects (3D tilt) and CSS variable helpers
  components/
    app.js            App (connect, session), Dashboard (state, layout), Appearance panel
    common.js         useApi hook, animated number, skeletons, sparkline, delta chip
    connect.js        connect screen
    hero.js           the main chart
    cards.js          stat cards, ranked lists, top pages, countries (globe and map)
    breakdown.js      donut cards with logos
    skyline.js        3D skyline, flat heat grid, 24-hour clock
    year.js           calendar year, streaks, goal rings
    sankey.js         referrer-to-page flows
    palette.js        command palette and the shortcut hook
    rail.js           the numbered section rail and its scroll spy
    recap.js          recap image (SVG to PNG)
vendor/               Preact, hooks, htm, cobe, phenomenon, with their licences
fonts/                self-hosted Latin variable fonts, with licences
assets/world-map.js   generated country paths (see scripts/)
scripts/              Node tooling, only for regenerating the world map
```

## Data flow

1. `App` connects: it calls `/me` (retrying on network errors), reads the account time zone, and stores the URL and key.
2. `Dashboard` turns the chosen preset into a range with `makeRange(preset, tz)`. A range holds the start and end instants of the site's calendar days, the previous period, and whether it includes today.
3. Each card calls `useApi(api, endpoint, { ttl, enabled })`. The hook keeps the previous answer on screen while the next one loads, shows an older cached copy at once, and reports errors with a Retry.
4. `model.js` derives what charts need: the series per bucket, spikes (a point far above the median of the 14 before it), hour and weekday medians, and the highlight sentences.
5. Components render with htm templates. State is plain `useState` in `Dashboard`; the only shared object is the context in `common.js` (auth error handler and the current design).

### The API client

`api.js` sends one request at a time. After each response it waits a short gap (330 ms, or 450 ms until a response proves the rate-limit headers are readable). If `X-Rate-Limit-Remaining` is 1 or less it waits for `X-Rate-Limit-Reset`. A 429 or a network error retries with a back-off; a 401, 403 or 404 does not, and each has its own readable message. Cached answers skip the queue.

### Sites and pages

`App` keeps one `API` client per site address (`pool`) and the open one in `session.api`. About two seconds after the first screen, `listSites` calls `GET /sites` (once per six hours, cached). A site lives at its custom domain, or at `<code>.goatcounter.com`; the same key is used for each. Without the **Read sites** permission the call fails and the list is just the one site. Choosing another site builds its client, asks `/me` for its time zone, and swaps `session.api`. `Dashboard` is keyed by the site address, so it remounts and every card, cache key and filter starts clean.

`narrow(api, ids)` returns a view of a client that adds `include_paths` to statistics requests (except `/stats/hits/{id}`). It shares the queue, rate-limit state and cache with the original. `Dashboard` hands every card the narrowed view while a page is chosen, and because `useApi` depends on its `api` argument, every card refetches by itself.

### Time zones

GoatCounter buckets days and hours in the account's time zone. `util.js` computes "today" and every range boundary in that zone using `Intl.DateTimeFormat`, so a viewer in another zone sees the same days GoatCounter does.

### Cache

`cache.js` stores `{ t, data }` under `baseURL|endpoint`. `api.get(endpoint, { ttl })` returns a fresh copy straight away, or calls `onStale` with an older one and then fetches. `ttlFor(range)` gives 60 seconds when the range includes today and 6 hours otherwise. `clearCache` removes one site's keys. **Refresh data** calls it, then bumps an `epoch` in the context; `useApi` lists the epoch as a dependency and fetches with `force`, so each mounted card keeps its old answer on screen until the new one arrives.

## The two designs

Both designs use the same components and the same class names. Each design is one stylesheet that defines the tokens (`--bg`, `--surface`, `--text`, `--accent`, `--c1` to `--c7`, `--heat-0` to `--heat-4`, fonts, radius) and a few look-specific rules, scoped with `[data-look="nova"]` or `[data-look="classic"]`. Dark and light are `[data-theme]`.

`index.html` reads the saved choice before first paint, sets `data-look` and `data-theme` on `<html>`, and writes the `<link>` for `app.css` and the active design. The other design loads when the user switches, through a View Transition when the browser supports it. Colours never appear in `app.css`; they come from tokens, so a new design only needs one new file.

Components that must differ by design read the current look from the context: the stat cards tilt only in Nova, the Countries card shows a globe in Nova and a map in Classic, and the weekday and hour view is a 3D skyline in Nova and a flat grid in Classic.

### Remember my choice

`index.html` defines `window.gcPref`. `save()` writes the design and mode to `sessionStorage` after every change, and also to `localStorage` if the user has pinned. `pin(on)` turns the pin on or off. On load it reads `sessionStorage` first, then the pin, then falls back to Nova dark.

## Loading and performance

- The first screen needs five requests (`/me`, current and previous `total`, `hits`, `toprefs`). Every lower card uses `useInView` and loads when it scrolls near the viewport.
- All modules in the first load are listed as `modulepreload`, so the browser fetches them in parallel instead of discovering them one import at a time. **The import map must come before the `modulepreload` links**, or bare imports fail.
- Vendor files end in `.js`, not `.mjs`, because some servers send `.mjs` with the wrong MIME type and browsers refuse it.
- Heavy code loads on demand: `cobe` (globe), `icons.js` (logos), `demo.js` (the demo), `assets/world-map.js` (map paths), and the recap fonts.
- The static splash in `index.html` uses the system font on purpose. If it used the web fonts, their download would compete with the app's scripts on a slow link.
- Animation work pauses offscreen and when the tab is hidden, and every animation respects `prefers-reduced-motion`.
- Budget: about 200 KB gzip for the first screen. Current figures are in the README.

## The demo

`demo.js` builds one hourly model for 760 days: weekday and time-of-day rhythm across several audience time zones, a seasonal swing, per-page growth curves, newsletter pulses, one viral spike tied to a named referrer and page, a page that launches part-way through, and a two-day lull. Three imaginary sites (`createDemoSites`) feed the site switcher; each builds on first use from its own seed, rate and page list, and understands `include_paths`. Every API answer (`total`, `hits`, `toprefs`, countries, browsers and the rest) is computed from that model, so any range, previous period or drill-down stays consistent. It is seeded, so the numbers are the same on every load.

## Globe, map and skyline

- The globe uses cobe. Marker positions come from the centre of each country's largest shape in `assets/world-map.js` (equirectangular, latitude 84 down to -58). It starts facing your top country (cobe centres on longitude -90 minus `phi`), is destroyed when scrolled away or when the design changes, and falls back to the flat map if WebGL fails.
- The flat map shades paths by the square root of visitors and shares its tooltip and hover logic with the list.
- The skyline and the clock use typical values (medians per weekday and hour over 90 days), so one viral day cannot rewrite the pattern.

## Logos

Browser and system logos are Simple Icons paths (CC0 data). The Edge and Windows marks come from an older Simple Icons release, because newer releases no longer include them. Device icons are drawn here. Marks are trademarks of their owners and are shown unaltered to identify software.

## Updating vendored libraries

Download the ES module build, save it with a `.js` name, and update its licence file.

```bash
V=https://cdn.jsdelivr.net/npm
curl -sfL $V/preact@10.25.4/dist/preact.module.js        -o vendor/preact.js
curl -sfL $V/preact@10.25.4/hooks/dist/hooks.module.js   -o vendor/hooks.js
curl -sfL $V/htm@3.1.1/dist/htm.module.js                -o vendor/htm.js
curl -sfL $V/cobe@0.6.3/dist/index.esm.js                -o vendor/cobe.js
curl -sfL $V/phenomenon@1.6.0/dist/phenomenon.mjs        -o vendor/phenomenon.js
```

Check that the import map in `index.html` still points at the right files, then run the demo and the checks below.

## Checking a change

There is no test suite in the repo. Before opening a PR:

1. Serve the folder and open the demo. Switch both designs and both modes.
2. Try the keyboard, the palette (`/`) and the recap (`r`).
3. Resize down to about 320px wide and confirm there is no horizontal scroll.
4. Open the console and confirm it is clean.
5. If you can, run axe-core on all four combinations (two designs, two modes), at a desktop and a phone width, with the lower cards scrolled into view.
