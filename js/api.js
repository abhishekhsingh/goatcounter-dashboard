// GoatCounter API client: bearer auth, one request at a time with an adaptive gap, IndexedDB cache
// with stale-while-revalidate, and errors that explain themselves.
import { cacheGet, cacheSet, cacheClear } from './cache.js';

const GAP_MS = 330;          // GoatCounter allows 4 requests per second; preflights add wire traffic
const SAFE_GAP_MS = 450;     // used until a response proves the headers are readable

// GoatCounter answers a 429 with "rate limited exceeded; try again in 40m7.98s". Browsers cannot read its X-Rate-Limit-*
// headers across origins (it does not expose them), but the text is readable. Returns seconds, or 0 if there is none.
export function waitFromText(text) {
  const m = /try again in ([0-9hmsµ.]+)/i.exec(text || '');
  if (!m) return 0;
  let s = 0; for (const [, n, u] of m[1].matchAll(/([0-9.]+)(ms|h|m|s)/g)) s += +n * ({ h: 3600, m: 60, s: 1, ms: 0.001 })[u];
  return s;
}
const LONG_WAIT_S = 20; // a wait longer than this is not worth holding the screen for

export class API {
  constructor(baseURL, apiKey) {
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.lastDone = 0;
    this.gap = SAFE_GAP_MS;
    this.chain = Promise.resolve();
    this.demo = false;
    this.tz = null;
    this.blockedUntil = 0; // set while GoatCounter's hourly cap is closed
    this.onLimit = null;
  }

  _key(endpoint) { return `${this.baseURL}|${endpoint}`; }

  async _fetch(endpoint) {
    const url = this.baseURL + endpoint;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + this.apiKey } });
    const remaining = res.headers.get('X-Rate-Limit-Remaining');
    const reset = res.headers.get('X-Rate-Limit-Reset');
    if (remaining !== null) {
      this.gap = GAP_MS;
      if (Number(remaining) <= 1) this.gap = Math.max(GAP_MS, Math.min(2000, (Number(reset) || 1) * 1000));
    }
    if (res.ok) return res.json();
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    let msg = '';
    try { msg = JSON.parse(body).error || ''; } catch { /* not JSON */ }
    const err = new Error();
    err.status = res.status;
    if (res.status === 401) {
      err.kind = 'auth';
      err.message = 'API key not recognized. Check that you copied the whole key with no extra spaces.';
    } else if (res.status === 403) {
      err.kind = 'auth';
      err.message = 'This key lacks the "Read statistics" permission. In GoatCounter, click your username, open API, and create a key with Read statistics ticked.';
    } else if (res.status === 404) {
      err.kind = 'notfound';
      const looksLikeGC = /goatcounter|"error"/i.test(body);
      err.message = `Not found (404) at ${url}. ${looksLikeGC ? 'The server answered like GoatCounter, so check the URL.' : 'The answer did not look like GoatCounter, so a proxy, filter or wrong host may be in the way.'}`;
    } else if (res.status === 429) {
      err.kind = 'rate'; err.message = 'Rate limit reached. Retrying.';
      err.retryAfter = Number(reset) || waitFromText(body) || 1;
    } else {
      err.message = msg || `Request failed (${res.status}).`;
    }
    throw err;
  }

  // skip() is asked when the request's turn comes: a card that was replaced meanwhile (new range, site or page) never sends it.
  _queued(endpoint, retries = 2, skip) {
    const cancelled = () => Object.assign(new Error('cancelled'), { kind: 'cancelled' });
    const limited = () => {
      const mins = Math.max(1, Math.ceil((this.blockedUntil - Date.now()) / 60000));
      return Object.assign(new Error(`GoatCounter's request limit for this key is used up. It resets in about ${mins} minute${mins === 1 ? '' : 's'}.`), { kind: 'limit', until: this.blockedUntil });
    };
    const run = async () => {
      if (skip && skip()) throw cancelled();
      if (this.blockedUntil > Date.now()) throw limited(); // do not keep knocking while the limit is closed
      const wait = this.gap - (Date.now() - this.lastDone);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (skip && skip()) throw cancelled();
      try {
        for (let attempt = 0; ; attempt++) {
          try { return await this._fetch(endpoint); } catch (e) {
            if (e.kind === 'rate' && e.retryAfter > LONG_WAIT_S) { // the hourly cap: stop, say so, and let the page show saved numbers
              this.blockedUntil = Date.now() + e.retryAfter * 1000;
              if (this.onLimit) this.onLimit(this.blockedUntil);
              throw limited();
            }
            const transient = e instanceof TypeError || e.kind === 'rate';
            if (!transient || attempt >= retries) throw e instanceof TypeError ? unreachable(this.baseURL) : e; // the browser's own text is only "Failed to fetch"

            await new Promise((r) => setTimeout(r, e.kind === 'rate' ? Math.max(1000, (e.retryAfter || 1) * 1000) : 700 + attempt * 900 + Math.random() * 200));
          }
        }
      } finally { this.lastDone = Date.now(); }
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    return next;
  }

  // ttl: how long a cached answer counts as fresh. onStale(data) is called at once with an older copy, if any.
  async get(endpoint, { ttl = 60_000, force = false, onStale, skip } = {}) {
    const key = this._key(endpoint);
    if (!force) {
      const hit = await cacheGet(key);
      if (hit && Date.now() - hit.t < ttl) return hit.data;
      if (hit && onStale) onStale(hit.data);
    }
    const data = await this._queued(endpoint, 2, skip);
    cacheSet(key, { t: Date.now(), data });
    return data;
  }

  clearCache() { return cacheClear(this.baseURL + '|'); }
}

// Window cache rules: a window that ended before today never changes, today refreshes quickly.
export const ttlFor = (range) => (range.live ? 60_000 : 6 * 3600_000);

// When a request never gets an answer (offline, wrong address, or a blocker in the way) the browser only says "Failed to fetch" or "Load failed".
const unreachable = (url) => Object.assign(new Error(`Could not reach ${url}. If you have an ad blocker or a privacy extension, try disabling it for this page. Otherwise check the address and your internet connection.`), { kind: 'network' });

export const q = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

// A view of the same client narrowed to some pages (GoatCounter path ids). It shares the queue, the rate-limit state
// and the cache with the original; only the statistics requests gain `include_paths`, so every card narrows at once.
export function narrow(api, ids) {
  const list = ids.join(',');
  const view = Object.create(api);
  view.filter = ids;
  view.get = (endpoint, opts) => {
    const plain = !/\/stats\//.test(endpoint) || /\/stats\/hits\/\d/.test(endpoint) || /include_paths=/.test(endpoint);
    return api.get(plain ? endpoint : endpoint + (endpoint.includes('?') ? '&' : '?') + 'include_paths=' + list, opts);
  };
  return view;
}

// The sites this key can read, as { id, name, url }. Listing them takes the "Read sites" permission; without it the
// key still reads the one site it was made on, so that one is returned alone.
export async function listSites(api) {
  const here = new URL(api.baseURL);
  const self = { id: 0, name: here.host, url: api.baseURL };
  try {
    const r = await api.get('/api/v0/sites', { ttl: 6 * 3600_000 });
    const rows = (Array.isArray(r) ? r : (r && r.sites) || []).filter((x) => x && (x.cname || x.code));
    const seen = new Set(), out = [];
    for (const x of rows) {
      // a custom domain, else the code's subdomain on goatcounter.com, else the host the user typed
      const host = x.cname || (here.host.endsWith('goatcounter.com') ? x.code + '.goatcounter.com' : here.host);
      const url = here.protocol + '//' + host;
      if (!seen.has(url)) { seen.add(url); out.push({ id: x.id, name: x.cname || x.code, url }); }
    }
    if (!out.some((x) => x.url === api.baseURL)) out.unshift(self);
    return out;
  } catch { return [self]; }
}
