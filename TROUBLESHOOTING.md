# Troubleshooting

This guide covers the most common issues people run into when connecting the GoatCounter Dashboard to their analytics instance. If your problem isn't listed here, please [open an issue](https://github.com/abhishekhsingh/goatcounter-dashboard/issues).

**Quick sanity check:** click **Try Demo** on the connect screen first. If the dashboard loads fine in demo mode but fails with your real credentials, the dashboard itself is working — the issue is between your browser and your GoatCounter instance. Work through the sections below.

---

## Connection Issues

### "Could not reach [URL] … If you have an ad blocker … try disabling it"

This is the most common error, and it can have several causes. The error message itself hints at ad blockers — work through the causes in order:

#### 1. Ad blocker interference (most common cause)

**uBlock Origin, AdBlock Plus, Brave Shields, Pi-hole, and DNS-level blockers** maintain filter lists that include `*.goatcounter.com`. When the dashboard (served from a different domain) makes API requests to your GoatCounter instance, the ad blocker silently intercepts and kills the requests *before they leave your browser*. The browser reports this as a network error or CORS failure — the error message is misleading because the request never actually reached the server.

**Fix:** Disable your ad blocker for the page running the dashboard, or add an exception for your GoatCounter domain. In uBlock Origin, click the extension icon and toggle the big power button off for the dashboard site.

**How to tell it's the ad blocker:** Open your browser's Developer Tools (F12) → Network tab, then click Connect. If blocked requests show as `(blocked:other)` or never appear at all, an extension is intercepting them.

#### 2. URL format

Enter just the base URL of your GoatCounter instance — no trailing slash, no path segments:

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

### "API key lacks read permission" (HTTP 403)

The API key is valid but doesn't have permission to read stats. The dashboard shows this specific message to help you fix it.

GoatCounter API keys have permission levels:

| Permission | Can read stats? | Works with dashboard? |
|---|---|---|
| **Read only** | Yes | Yes |
| **Count and read** | Yes | Yes |
| **Count only** | No | **No** — returns 403 on every stats endpoint |

If you created a **"Count only"** key, the connection test (`/api/v0/me`) may succeed, but every subsequent stats call will fail with 403 — which bounces you back to the connect screen.

**Fix:** Go to your GoatCounter site → click your username (top right) → **Settings** → **API** tab → create a new key with **"Read only"** or **"Count & Read"** permission.

---

### "Not found: [endpoint]. Check that the URL points to your GoatCounter site (not a sub-path)."

The dashboard reached a server, but it returned 404 for an API endpoint. This usually means the URL points to something that isn't a GoatCounter instance — double-check you entered the right hostname.

---

### Connection works but some cards show "Failed to load" with a Retry button

This is usually **rate limiting**. GoatCounter's API uses a token-bucket rate limiter (~4 requests/second for hosted instances, configurable for self-hosted). The dashboard handles this with a strict-sequential request queue and 500ms gaps between requests, but under certain conditions some requests can still get throttled:

- Rapidly switching date ranges before the previous batch finishes
- A slow or overloaded GoatCounter instance taking longer to respond
- Self-hosted instances with a stricter rate limit configuration

**What to do:**
- Click the **Retry** button on each failed card — it retries just that one request, which usually succeeds once the rate limit bucket refills.
- The dashboard shows a banner at the top listing which sections failed.
- Responses are cached for 60 seconds, so switching back to a date range you just viewed won't trigger new API calls.

---

## Self-Hosted GoatCounter Instances

### CORS not working through a reverse proxy

GoatCounter itself sets CORS headers on its API responses. If your reverse proxy strips or overwrites these headers, the browser will block the dashboard's requests.

**nginx** — make sure your proxy configuration forwards CORS headers:

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

**Alternative** — if GoatCounter's built-in CORS headers aren't making it through your proxy, add them directly in nginx:

```nginx
add_header Access-Control-Allow-Origin "*" always;
add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
```

Use a specific origin instead of `*` in production if possible (e.g., `https://yourusername.github.io`).

**Caddy** — Caddy generally proxies all response headers by default. If you've overridden headers, ensure CORS headers pass through:

```caddy
stats.example.com {
    reverse_proxy localhost:8080
}
```

### Custom port or base path

- **Non-standard port:** Include the port in the URL, e.g. `https://stats.example.com:8080`.
- **`-base-path` flag:** If you run GoatCounter with `-base-path` (e.g., `example.com/stats`), enter the full base URL: `https://example.com/stats`.

### Rate limit configuration

Self-hosted instances can adjust rate limits with the `-ratelimit` flag on `goatcounter serve`. If the dashboard consistently hits rate limits on your self-hosted instance, you may want to raise this value.

---

## Data Display Issues

### Traffic chart shows wrong timezone / shifted hours

GoatCounter returns hourly data bucketed in your *site's* configured timezone, not UTC. The dashboard passes this data through as-is. If hours look shifted, check your site's timezone setting in GoatCounter (Settings → Site tab).

### World map doesn't show small countries (Singapore, Monaco, Vatican, etc.)

The choropleth uses Natural Earth 110m resolution for fast loading — microstate boundaries don't exist at this scale. These countries still appear in the **country list** below the map with their flag and visitor count.

### Campaign card doesn't appear

The campaigns card only renders when your GoatCounter instance has collected UTM-tagged traffic (`utm_source`, `utm_medium`, `utm_campaign`). If no campaign data exists, the card is intentionally hidden — it's not a bug.

### Devices card shows "Unknown" for all entries

This was a bug in earlier versions that has been fixed. If you still see it, clear your browser's localStorage for the dashboard domain — the dashboard caches API responses and the stale cached response may be the problem.

**How to clear:** Open Developer Tools (F12) → Application/Storage tab → Local Storage → delete all entries for the dashboard's domain. Or use the dashboard's **Refresh** button in the settings menu (gear icon, top right), which clears the response cache.

---

## Browser and Environment Issues

### Dashboard looks broken or won't load at all

The dashboard requires a modern browser with ES2020+ support:

| Browser | Minimum version |
|---------|----------------|
| Chrome / Edge | 80+ |
| Firefox | 78+ |
| Safari | 13+ |

If using **Brave**, Brave Shields may block GoatCounter domains by default — same issue as ad blockers. Disable shields for the dashboard page.

### localStorage errors or credentials not persisting

The dashboard stores your credentials and response cache in `localStorage`. Some environments restrict this:

- **Private/incognito browsing** — some browsers limit or disable localStorage in private mode.
- **Aggressive privacy settings** — certain Firefox configurations (`dom.storage.enabled = false`) disable it entirely.
- **Storage quota exceeded** — extremely rare, but possible if localStorage is nearly full from other sites.

**Symptoms:** The dashboard may fail to save credentials (you have to re-enter them each visit) or fail to cache responses (every page load makes fresh API calls).

**Fix:** Try clearing localStorage for the dashboard domain, then reconnect. If localStorage is completely unavailable, the dashboard will still work — it just won't persist credentials or cache responses between page loads.

### Demo mode works but real connection doesn't

This confirms the dashboard code is working correctly. Demo mode uses in-memory sample data and makes zero network requests. The issue is between your browser and your GoatCounter instance — work through the [Connection Issues](#connection-issues) section above.

---

## Performance

### Dashboard loads slowly on first visit

The initial load makes up to 13 API calls spread across 4 lazy-load tiers:
1. **Tier 1 (immediate):** Total visitors + traffic chart — 3 requests
2. **Tier 2 (scroll):** Browsers, OS, Devices — 3 requests
3. **Tier 3 (scroll):** Countries, Languages — 2 requests
4. **Tier 4 (scroll):** Campaigns — 1 request
5. **Previous-period comparisons** — additional requests for trend arrows

Tiers 2-4 only fire when their cards scroll into view (`IntersectionObserver`), so the initial visible load is just 3 requests. On slow connections or heavily loaded GoatCounter instances, the full load can take 15-30 seconds.

Subsequent interactions are faster thanks to the 60-second response cache.

### Persistent rate limit errors (429)

The dashboard's built-in rate handling (strict-sequential queue, 500ms gap between completions, exponential backoff on 429s) is designed to stay comfortably under GoatCounter's default rate limit. If you still hit 429s consistently:

- **Hosted GoatCounter:** You may be sharing the rate limit with other API clients or integrations hitting the same site. Space out your usage.
- **Self-hosted:** Increase the rate limit with the `-ratelimit` flag on `goatcounter serve`.

---

## Still stuck?

1. Open Developer Tools (F12) → **Console** tab and look for red error messages.
2. Check the **Network** tab for blocked or failed requests.
3. Try a different browser or disable all extensions to rule out interference.
4. [Open an issue](https://github.com/abhishekhsingh/goatcounter-dashboard/issues) with your browser, GoatCounter setup (hosted vs. self-hosted), and any error messages you see.
