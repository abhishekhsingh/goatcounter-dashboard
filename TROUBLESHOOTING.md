# Troubleshooting

This guide covers the most common issues people run into when connecting the GoatCounter Dashboard to their analytics instance. If your problem isn't listed here, please [open an issue](https://github.com/abhishekhsingh/goatcounter-dashboard/issues).

**Quick sanity check:** press **Try demo** on the connect screen first. If the dashboard loads fine in demo mode but fails with your real credentials, the dashboard itself is working. The issue is between your browser and your GoatCounter instance. Work through the sections below.

---

## Connection Issues

### "Could not reach [URL] … If you have an ad blocker … try disabling it"

This is the most common error, and it can have several causes. The error message itself hints at ad blockers; work through the causes in order:

#### 1. Ad blocker interference (most common cause)

**uBlock Origin, AdBlock Plus, Brave Shields, Pi-hole, and DNS-level blockers** maintain filter lists that include `*.goatcounter.com`. When the dashboard (served from a different domain) makes API requests to your GoatCounter instance, the ad blocker silently intercepts and kills the requests *before they leave your browser*. The browser reports this as a network error or CORS failure. The error message is misleading because the request never actually reached the server.

**Fix:** Disable your ad blocker for the page running the dashboard, or add an exception for your GoatCounter domain. In uBlock Origin, click the extension icon and toggle the big power button off for the dashboard site.

**How to tell it's the ad blocker:** Open your browser's Developer Tools (F12) → Network tab, then click Connect. If blocked requests show as `(blocked:other)` or never appear at all, an extension is intercepting them.

#### 2. URL format

Enter just the base URL of your GoatCounter instance, no trailing slash, no path segments:

| Correct | Incorrect |
|---------|-----------|
| `https://mysite.goatcounter.com` | `https://mysite.goatcounter.com/` |
| `https://stats.example.com` | `https://mysite.goatcounter.com/settings` |
| `https://stats.example.com:8080` | `https://mysite.goatcounter.com/api/v0/stats` |

The dashboard does strip trailing slashes and path segments automatically, but entering the simplest form avoids surprises.

#### 3. CORS headers missing (self-hosted instances)

GoatCounter sets `Access-Control-Allow-Origin` on its API endpoints out of the box. However, if your instance is behind a reverse proxy (nginx, Caddy, Apache), the proxy may strip these headers. See the [Self-Hosted Instances](#self-hosted-goatcounter-instances) section below.

---

### "API key not recognized" (HTTP 401)

The dashboard reached your GoatCounter instance, but the server doesn't recognize the API key.

- **Whitespace or truncation:** Make sure you copied the full API key with no leading/trailing spaces, line breaks, or truncation. The dashboard trims whitespace, but clipboard issues can introduce invisible characters.
- **Expired or deleted key:** If you regenerated your API key in GoatCounter, the old one stops working immediately.
- **Wrong site:** If you have multiple GoatCounter sites, make sure the key belongs to the site URL you entered.

### "API key lacks the Read statistics permission" (HTTP 403)

The API key is valid but is not allowed to read stats. The dashboard shows this specific message so you can fix it.

GoatCounter API keys carry independent permissions: **Record pageviews**, **Read statistics**, **Export**, **Read sites**, **Create sites** and **Update sites**. Every stats request the dashboard makes needs **Read statistics**. No other permission is needed, so grant only that one.

If a key was created without **Read statistics**, the connection test (`/api/v0/me`, which needs no permission) succeeds, but every stats call fails with 403, which bounces you back to the connect screen.

**Fix:** In GoatCounter, click your username in the top menu, open **API**, and create a new key with **Read statistics** enabled.

---

### "Not found (404) at [URL]"

The dashboard reached a server, but it answered 404 for an API address. The message now says whether the answer looked like GoatCounter:

- **"The server answered like GoatCounter, so check the URL"**: the host is right but the address is not, for example a typo in the site name.
- **"The answer did not look like GoatCounter"**: something else answered, such as a corporate proxy, a DNS filter, a VPN, or a wrong host. Open the URL from the message in a new tab. If you see anything other than a GoatCounter error, that is the cause.

---

### Connection works but some cards show a message with a Retry button

This is usually **rate limiting**. GoatCounter allows 4 requests per second by default (reported in the `X-Rate-Limit-*` response headers, and configurable on self-hosted instances). The dashboard sends one request at a time with a short gap, follows those headers when the browser can read them, and retries a 429 after the reset time. Some requests can still be throttled when:

- You switch date ranges quickly, before the previous batch has finished.
- A slow or busy GoatCounter instance takes longer to answer.
- A self-hosted instance has a stricter limit.

**What to do:**
- Press **Retry** on the card. It retries only that request and usually works once the limit refills.
- Answers are cached, so going back to a range you just viewed makes no new requests.

---

## Self-Hosted GoatCounter Instances

### CORS not working through a reverse proxy

GoatCounter itself sets CORS headers on its API responses. If your reverse proxy strips or overwrites these headers, the browser will block the dashboard's requests.

**nginx:** make sure your proxy configuration forwards CORS headers:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Ensure CORS headers from GoatCounter are not stripped
    proxy_pass_header Access-Control-Allow-Origin;
    proxy_pass_header Access-Control-Allow-Methods;
    proxy_pass_header Access-Control-Allow-Headers;
}
```

**Alternative:** if GoatCounter's built-in CORS headers aren't making it through your proxy, add them directly in nginx:

```nginx
add_header Access-Control-Allow-Origin "*" always;
add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
```

Use a specific origin instead of `*` in production if possible (e.g., `https://yourusername.github.io`).

**Caddy:** Caddy generally proxies all response headers by default. If you've overridden headers, ensure CORS headers pass through:

```caddy
stats.example.com {
    reverse_proxy localhost:8080
}
```

### Custom port or base path

- **Non-standard port:** Include the port in the URL, e.g. `https://stats.example.com:8080`.
- **`-base-path` is not supported.** The connect form keeps only the scheme, host and port of the URL and drops any path, so a GoatCounter instance served under a sub-path (for example `-base-path /stats`) cannot be used with this dashboard.

### Rate limit configuration

Self-hosted instances can adjust rate limits with the `-ratelimit` flag on `goatcounter serve`, using the syntax `name:requests/seconds` (for example `-ratelimit api:4/1`, where 4 requests per second is the default for `api`). The server's built-in defaults also include a second API limit named `api2` of 500 requests per 3600 seconds. If the dashboard consistently hits rate limits on your self-hosted instance, you may want to raise these values.

---

## Data Display Issues

### Traffic chart shows wrong timezone / shifted hours

GoatCounter buckets days and hours in your *site's* time zone, not UTC. The dashboard computes its ranges in the time zone GoatCounter reports for your account, and falls back to your browser's if it does not report one. If hours look shifted, check the time zone in your GoatCounter settings. The browser, system and similar breakdowns are always in UTC.

### Small countries are missing from the map or the globe

The map uses Natural Earth 110m shapes for fast loading, and the globe puts a marker at the centre of each country's largest shape. Microstates (Singapore, Monaco, the Vatican and similar) have no shape at this scale, so they get no shading and no marker. They still appear in the country list with their flag and visitor count.

### The globe is missing and I see a flat map

The globe needs WebGL. If your browser has WebGL turned off, or the graphics driver is blocked, the dashboard switches to the flat map on its own. You can also choose **Map** with the Globe and Map buttons above it.

### I only see one site, or the site switcher is missing

The switcher appears when the key can read more than one site. Listing sites needs the **Read sites** permission, so create a new key with **Read statistics** and **Read sites** ticked, then disconnect and connect with it. A site on a custom domain must also answer the API from that domain with CORS allowed, like the first site (see the CORS section below).

### Campaign card doesn't appear

The campaigns card only appears when GoatCounter has recorded campaign traffic (for example `utm_source`, `utm_medium`, `utm_campaign`) in the range you chose. With none, it is hidden on purpose, and it is also hidden if your instance does not offer the campaigns endpoint.

### A card or the whole page shows fewer visitors than GoatCounter's own page

GoatCounter counts **visitors**, and so does this dashboard. It does not show pageviews. Two things can make totals differ slightly from GoatCounter's page: the time zone used for the range, and events, which GoatCounter includes in its total.

### My weekday and hour pattern looks flat or says "Not enough traffic yet"

The pattern uses the last 90 days and needs a few hundred visitors to be meaningful. It also shows typical values (medians), so a single busy day does not change it.

### "Remember my choice" does not stick

A new visit always opens in Nova dark. Your choice lasts for the tab. To keep it for later visits, open the Appearance panel (the palette icon) and turn on **Remember my choice**. If your browser blocks storage (private mode or strict privacy settings), nothing can be remembered.

### The recap image has the wrong font or will not download

The recap embeds its fonts so it looks the same everywhere. If the fonts cannot be fetched, it falls back to a system font. If **Download PNG** fails, try another browser. Counts under 5 are left out on purpose, so a small site may show fewer lines.

---

## Browser and Environment Issues

### The page is blank, or the console says a module could not load

The dashboard uses ES modules, which browsers will not load from a `file://` address. Serve the folder instead:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Also make sure your host sends `.js` files as JavaScript. All files in the repo use `.js` for that reason.

### The dashboard looks broken in an older browser

You need ES modules, import maps and the popover attribute:

| Browser | Minimum version |
|---------|----------------|
| Chrome / Edge | 114+ |
| Firefox | 125+ |
| Safari | 17+ |

Without popover support the **Appearance** button does nothing, but the command palette (`/`) and the shortcuts `l` (light or dark) and `n` (design) still work. A few decorative styles use `color-mix()`; older browsers skip them and the dashboard still works.

If you use **Brave**, Brave Shields may block GoatCounter domains by default, which is the same issue as an ad blocker. Turn shields off for the dashboard page.

### Credentials or choices not persisting, or the cache not working

The dashboard uses several kinds of browser storage (see the README for the list). Some environments restrict them:

- **Private or incognito windows** may limit or clear storage when the window closes.
- **Strict privacy settings** can turn storage off. Firefox with `dom.storage.enabled = false` disables it entirely.
- **Safari** may delete a site's storage after about 7 days without a visit, so you may need to reconnect.

If storage is unavailable the dashboard still works. It just cannot keep your key, your choices or its cache between visits.

**To reset everything:** use **Disconnect** (this clears the key and the cache for that site). For a full reset, clear site data for the dashboard's address in your browser's settings.

### Demo mode works but a real connection does not

Demo mode uses made-up data and makes no network requests, so this means the dashboard is fine. The problem is between your browser and your GoatCounter instance. Work through [Connection Issues](#connection-issues).

---

## Performance

### The dashboard loads slowly on the first visit

After you connect, the first screen needs five requests: a connection check (`/me`), the current and previous `total`, `hits` and `toprefs`. Every other card loads when it scrolls near the viewport. The **Where visitors go next** card traces six referrers one at a time, so it can take a couple of seconds on a busy site. Because requests go out one at a time to respect GoatCounter's limit, a slow or busy GoatCounter instance is the usual reason for a slow first load.

Later visits are faster. Answers are cached in your browser (60 seconds for a range that includes today, 6 hours for older ranges), and an older copy is shown immediately while a fresh one loads.

### I do not see the stars

The starfield shows in dark Nova, in the empty margins beside the content, so it needs a screen wider than about 1400 px. It is left out in light mode, in Classic, with **Background** set to **Off**, on low-end devices and with reduced motion (which keeps the stars but stops the twinkle and the shooting stars). **Still** keeps the stars and removes the twinkle and shooting stars.

### The Nova background is a plain gradient

The flowing background is optional. It switches itself off, and the plain gradient blobs stay, when WebGL is missing or the graphics context is lost, when the browser asks to save data, on a device with two cores or 2 GB of memory or less, and when its first frames are too slow even after drawing smaller. It also shows a single still frame when your system asks for reduced motion, and it is never loaded in the Classic design. If you find it distracting, open **Appearance** and set **Background** to **Still** or **Off**.

### The page is a little jerky on an older device

The background and the globe keep moving while you scroll. On an older machine, open **Appearance** and set **Background** to **Still** or **Off**, or switch to **Classic**, which has no background shader, no glass blur and no globe.

### Persistent rate limit errors (429)

The dashboard stays under GoatCounter's per-second limit by sending one request at a time. Hosted GoatCounter also caps a key at 500 requests per hour (observed in the `X-Rate-Limit-Limit` header). A full load is about 22 requests, so many refreshes, site switches and range changes in a short time can reach it. When that happens the dashboard shows a notice with the time it reopens (about the same as the "try again in" text GoatCounter sends) and keeps showing saved numbers. Wait for it, or use fewer refreshes. If you still see 429s:

- **Hosted GoatCounter:** the limit may be shared with other API clients using the same site. Space out your usage.
- **Self-hosted:** raise the limit with the `-ratelimit` flag on `goatcounter serve`.

---

## Still stuck?

1. Open Developer Tools (F12) → **Console** tab and look for red error messages.
2. Check the **Network** tab for blocked or failed requests.
3. Try a different browser or disable all extensions to rule out interference.
4. [Open an issue](https://github.com/abhishekhsingh/goatcounter-dashboard/issues) with your browser, GoatCounter setup (hosted vs. self-hosted), and any error messages you see.
