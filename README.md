# 🐐 GoatCounter Dashboard

A modern, beautiful, open-source alternative dashboard for [GoatCounter](https://www.goatcounter.com/) analytics. Dark mode by default, interactive charts, fully responsive — and zero servers, zero build step, zero cost. It's a single `index.html` file that you can host anywhere (GitHub Pages, Netlify, your local disk).

![Dashboard Screenshot](assets/screenshot.png)

## ✨ Features

- 📊 **Interactive charts** — area chart for traffic, donut charts for browsers/OS/devices, horizontal bars for countries and languages.
- 🌗 **Dark & light mode** — defaults to your system preference, toggle persisted across sessions.
- 📅 **Flexible date ranges** — Today, 7d, 30d, 90d, or a custom range.
- 📈 **Period-over-period trends** — every KPI card compares against the previous equivalent window.
- 🔍 **Drill into pages** — click any page in the Top Pages list to see referrer breakdown for just that page.
- 📱 **Fully responsive** — single column on mobile, two-column on tablet, full grid on desktop.
- 🚀 **Zero build step** — single `index.html`, React + Recharts loaded from CDN. Open in a browser and it works.
- 🔒 **Privacy-first** — your API key is stored only in your browser's localStorage. Nothing is sent anywhere except the GoatCounter API directly.
- ♿ **Accessible** — proper ARIA roles, keyboard navigation, focus indicators, and skeleton loading states.

## 🚀 Quick Start

1. Visit **[abhishekhsingh.github.io/goatcounter-dashboard](https://abhishekhsingh.github.io/goatcounter-dashboard)**.
2. Enter your GoatCounter URL (e.g. `https://yoursite.goatcounter.com`) and an API key.
3. That's it — your dashboard is live.

## 🏠 Self-Hosting

You don't need to trust someone else's hosting. Run your own copy in two minutes:

1. **Fork** this repo (or just download `index.html`).
2. Enable **GitHub Pages** for the repo (Settings → Pages → Source: `main` branch, root).
3. Visit `https://<your-username>.github.io/goatcounter-dashboard`. Done.

Or just drop `index.html` into any static host (Netlify, Cloudflare Pages, S3, your own server) — there's no build step.

### Running locally

```bash
git clone https://github.com/abhishekhsingh/goatcounter-dashboard.git
cd goatcounter-dashboard
# Open directly:
open index.html
# Or serve it with anything that serves static files:
python3 -m http.server 8000
# → visit http://localhost:8000
```

## 🔑 Getting a GoatCounter API Key

1. Log into your GoatCounter site.
2. Click your username (top right) → **Settings** → **API** tab.
3. Click **Create key**.
4. Grant the **Count** and **Read statistics** permissions.
5. Copy the key and paste it into the connect screen.

## 🛠 API Endpoints Used

This dashboard talks to GoatCounter's public REST API (`/api/v0`). All requests are rate-limited client-side (~4 req/sec) to respect GoatCounter's limits.

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v0/me` | Verify connection, fetch site name |
| `GET /api/v0/stats/total` | Hero KPI total visitors |
| `GET /api/v0/stats/hits` | Traffic time-series + top pages list |
| `GET /api/v0/stats/hits/{path_id}` | Per-page referrer drill-down |
| `GET /api/v0/stats/browsers` | Browser donut chart |
| `GET /api/v0/stats/systems` | OS donut chart |
| `GET /api/v0/stats/sizes` | Device breakdown |
| `GET /api/v0/stats/locations` | Countries chart |
| `GET /api/v0/stats/languages` | Languages chart |
| `GET /api/v0/stats/campaigns` | Campaigns table (when available) |

## 🧱 Tech Stack

- **React 18** (UMD build, via unpkg CDN)
- **Recharts 2** for all charts
- **Babel Standalone** for in-browser JSX compilation
- **Inter** + **JetBrains Mono** from Google Fonts
- Plain CSS with custom properties for theming — no Tailwind, no preprocessor, no bundler

The whole app is a single ~1000-line `index.html`. That's it.

## 🧭 Project Status

This is an early v1. Things that work:

- ✅ Connect / disconnect with persisted credentials
- ✅ All 9 GoatCounter stat endpoints integrated
- ✅ Period-over-period trends
- ✅ Drill-down referrers per page
- ✅ Dark / light theme with system-preference default
- ✅ Custom date range picker
- ✅ Rate-limited request queue
- ✅ Skeleton loading states + error handling

Ideas for the future: world-map view for countries, CSV export, multi-site switcher, real-time mode.

## 🤝 Contributing

PRs welcome! Because there's no build step, contributing is easy:

1. Fork & clone.
2. Edit `index.html`.
3. Open it in a browser to test.
4. Open a PR.

Bug reports and feature ideas → [GitHub Issues](https://github.com/abhishekhsingh/goatcounter-dashboard/issues).

## 📄 License

MIT — see [LICENSE](LICENSE).

## 👤 Author

**Abhishekh Singh**
- Portfolio: [abhishekhsingh.github.io](https://abhishekhsingh.github.io)
- GitHub: [@abhishekhsingh](https://github.com/abhishekhsingh)

GoatCounter itself is built by [Martin Tournoij](https://github.com/arp242) and is wonderful — go [support the project](https://www.goatcounter.com/) if you find it useful.
