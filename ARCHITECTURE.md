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
  ambient.js          Nova's living background: one fullscreen shader, tuned to stay cheap
  stars.js            Nova dark: starfield in the side margins and shooting stars
  fx.js               pointer effects (3D tilt, cursor glow), scroll hold and CSS variable helpers
  components/
    app.js            App (connect, session), Dashboard (state, layout), Appearance panel
    common.js         useApi hook, animated number, skeletons, sparkline, delta chip, credit line
    connect.js        connect screen
    hero.js           the main chart
    cards.js          stat cards, ranked lists, top pages, countries (globe and map)
    breakdown.js      donut cards with logos
    skyline.js        3D skyline, flat heat grid, 24-hour clock
    ridgeline.js      day-by-day ridgeline (one line per day, drawn as a mountain range)
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

`api.js` sends one request at a time. After each response it waits a short gap (330 ms, or 450 ms until a response proves the rate-limit headers are readable; GoatCounter does not expose them across origins, so in practice the gap stays at 450 ms). A request whose card was replaced meanwhile is skipped when its turn comes (`skip`). A short 429 or a network error retries with a back-off. A long 429 (the hourly cap of 500) is read from its text, "try again in 40m7s": the client sets `blockedUntil`, calls `onLimit` so `Dashboard` can show a notice, and fails further requests at once with the kind `limit` instead of waiting; `useApi` keeps showing a card's saved answer when that happens; a 401, 403 or 404 does not, and each has its own readable message. Cached answers skip the queue.

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
- Heavy code loads on demand: `ambient.js` (background), `cobe` (globe), `icons.js` (logos), `demo.js` (the demo), `assets/world-map.js` (map paths), and the recap fonts.
- The static splash in `index.html` uses the system font on purpose. If it used the web fonts, their download would compete with the app's scripts on a slow link.
- Animation work pauses offscreen and when the tab is hidden, and every animation respects `prefers-reduced-motion`.
- Budget: about 200 KB gzip for the first screen. Current figures are in the README.

## The demo

`demo.js` builds one hourly model for 760 days: weekday and time-of-day rhythm across several audience time zones, a seasonal swing, per-page growth curves, newsletter pulses, one viral spike tied to a named referrer and page, a page that launches part-way through, and a two-day lull. Three imaginary sites (`createDemoSites`) feed the site switcher; each builds on first use from its own seed, rate and page list, and understands `include_paths`. Every API answer (`total`, `hits`, `toprefs`, countries, browsers and the rest) is computed from that model, so any range, previous period or drill-down stays consistent. It is seeded, so the numbers are the same on every load.

## Globe, map and skyline

- The globe uses cobe 0.6.3 (with phenomenon, its render loop). Marker positions come from the centre of each country's largest shape in `assets/world-map.js` (equirectangular, latitude 84 down to -58). It starts facing your top country (cobe centres on longitude -90 minus `phi`), is destroyed when scrolled away or when the design changes, and falls back to the flat map if WebGL fails. The canvas is created inside a `.globe-box` that Preact never touches, with a second, flat canvas (`.globe-over`) laid over it. Everything that moves on the globe is drawn on that overlay from cobe's own rotation (`unit` and `turn` in `cards.js`: spin by `phi`, tilt by `theta`, looking down z, checked against real renders to about 1% of the globe's width): arcs from the top country to the next seven that fly out one after another, a small dot that keeps travelling along each, pulse rings on the seven busiest countries, and name labels on the three busiest while they face you. It needs no special browser support and costs almost nothing, as long as it never uses canvas shadows: a shadow blur is repainted on the CPU every frame, and an earlier version that glowed the arcs that way took 50 to 66 ms a frame at 2x on an M1 Pro. The glows are small pre-drawn sprites and two wide, faint strokes under a thin bright one. The sphere turns at full rate and the overlay is redrawn every other frame. The globe is created when its own box is within 40 px of the screen and destroyed when it leaves. cobe 2 has arcs and CSS anchors built in, but in a WebKit test its per-frame update blocked for tens of milliseconds, so the page lost most of its frames whenever the globe was on screen. Do not upgrade to it without measuring that.
- The flat map shades paths by the square root of visitors and shares its tooltip and hover logic with the list.
- The skyline and the clock use typical values (medians per weekday and hour over 90 days), so one viral day cannot rewrite the pattern.

## Motion

- **Background** (`ambient.js`): one triangle and a fragment shader (soft warped noise, three octaves, no fine detail) in a `#flow` canvas inside `.aurora`. It is meant to be quiet: low contrast, slow, and capped well under the brightness of the old blobs. The Appearance panel's **Background** setting (`data-bg` on `<html>`, saved with the design and mode) picks Flowing, Still (one frame) or Off (the plain CSS gradient, not moving). It reads its palette from the design tokens, so dark, light and a new design need no shader change. `Dashboard` sends one number through the `gc:energy` event (how hot recent days run against the peak, or the value under the chart cursor). Time is a running total (`phase`) that only grows by the length of a drawn frame times a speed, so a change of energy changes the speed from then on and never moves the picture, and a pause never makes it jump. (An earlier version multiplied the clock by the energy, which made the background lurch whenever the pointer moved over the chart.) The cursor nudges the flow, and the hour of the day shifts it slightly. It is drawn at about 40% size (never more than 960 px on the long edge), upscaled by CSS, at 20 fps. It starts 900 ms after the first screen, then at idle. It keeps moving while the page scrolls (measured: it costs no frames), stops in a hidden tab, draws one still frame under reduced motion, halves its size if the first 45 frames average over 68 ms, and drops out for the CSS blobs if that is still too slow, if the context is lost, on `saveData`, and on two cores or 2 GB of memory or less. Intensity is capped so body text keeps at least the contrast it had over the old blobs.
- **Stars** (`stars.js`): dark Nova only, when each side margin is at least 70 px wide (about 1400 px and up), and not for `data-bg` Off, reduced-motion shooting stars, weak devices or the light theme. The stars sit only in the margins beside the content, never behind a glass card, because a card re-blurs whatever changes behind it, and twinkling stars behind twenty cards would make every frame costly. Each side holds three small canvases drawn once from a seeded generator (so a resize gives the same sky), at the screen's pixel density, with a few brighter stars carrying a halo and a four-point glint. Stars near the section rail are left out. CSS fades each canvas in and out at its own speed (4.6, 6.7 and 9.1 s), which runs on the compositor. Shooting stars are one `<span class="shoot">` each (not an `<i>`: `.aurora i` is the blob rule), animated with `translate` from the margins, only in the Flowing setting and a visible tab. There are three kinds. Margin streaks are steep and stay in one margin (about 1 s). Dives start in a margin, slant inward and finish behind the cards, where the glass hides them (about 1.5 s). Crossings run from one margin to the other, behind the whole dashboard, one or two at a time (about 2.3 s). A margin or dive streak comes every 5 to 11 s (the first after 3 to 5 s) and a crossing every 28 to 54 s (the first after 14 to 22 s). Streaks behind the cards make those cards re-blur while they pass, which measured as free on an M1 Pro at 2x even with six always in flight. Still draws the stars without twinkle or streaks. Measured on an M1 Pro at 2x and 1920 px: no change in frame time or slow frames.
- **Day and night switch**: a `role="switch"` button (`.modesw`) with `aria-checked` for dark. The knob is a plain element moved with a transform, the icons sit above it and take the on-accent colour when under the knob, and the colour change still starts from the knob with the circular reveal. Nova draws the track as a deep night or a pale sky from gradients, Classic leaves it flat.
- **Cards**: `installPointerFX` tells the card under a mouse where the pointer is, and `nova.css` draws a soft glow and a bright edge thread from it. Both are CSS variables on one card at a time, and neither runs for touch or reduced motion. The stat strip's turning edge light animates a registered property (a style pass and repaint per frame), so it only turns while a card is hovered or focused. The first screen rises in with a short stagger using `translate` and `scale`, so it does not fight the tilt's `transform`. Cards do not animate as they scroll in: animating a card that has `backdrop-filter` makes the browser redo the blur every frame, which is how a page loses smoothness. While the shader runs the glass blur is lighter (9px).
- **Ridgeline** (`ridgeline.js`): canvas 2D. Each of up to 42 days is a smoothed 24-point line, drawn back to front with an opaque fill so nearer days hide farther ones, and narrower at the back for depth. Heights share one scale set by the 95th percentile of all hours, and a viral day may rise to 1.6 times it. The lean toward the pointer is a CSS transform on the canvas (compositor only). It redraws only while it animates in or while a line is hovered.
- Every loop checks `prefers-reduced-motion`, and the browser pauses them in a hidden tab.
- On touch screens, `-webkit-user-select: none` and `-webkit-touch-callout: none` on SVG and canvas charts stop a long press from selecting text; rows and numbers stay selectable.

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
