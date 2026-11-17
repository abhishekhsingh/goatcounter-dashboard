// GoatCounter API client: bearer auth, one request at a time with an adaptive gap, IndexedDB cache
// with stale-while-revalidate, and errors that explain themselves.
import { cacheGet, cacheSet, cacheClear } from './cache.js';

const GAP_MS = 330;          // GoatCounter allows 4 requests per second; preflights add wire traffic
const SAFE_GAP_MS = 450;     // used until a response proves the headers are readable

export class API {
  constructor(baseURL, apiKey) {
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.lastDone = 0;
    this.gap = SAFE_GAP_MS;
    this.chain = Promise.resolve();
    this.demo = false;
    this.tz = null;
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
      err.retryAfter = Number(reset) || 1;
    } else {
      err.message = msg || `Request failed (${res.status}).`;
    }
    throw err;
  }

  _queued(endpoint, retries = 2) {
    const run = async () => {
      const wait = this.gap - (Date.now() - this.lastDone);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        for (let attempt = 0; ; attempt++) {
          try { return await this._fetch(endpoint); } catch (e) {
            const transient = e instanceof TypeError || e.kind === 'rate';
            if (!transient || attempt >= retries) throw e;
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
  async get(endpoint, { ttl = 60_000, force = false, onStale } = {}) {
    const key = this._key(endpoint);
    if (!force) {
      const hit = await cacheGet(key);
      if (hit && Date.now() - hit.t < ttl) return hit.data;
      if (hit && onStale) onStale(hit.data);
    }
    const data = await this._queued(endpoint);
    cacheSet(key, { t: Date.now(), data });
    return data;
  }

  clearCache() { return cacheClear(this.baseURL + '|'); }
}

// Window cache rules: a window that ended before today never changes, today refreshes quickly.
export const ttlFor = (range) => (range.live ? 60_000 : 6 * 3600_000);

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
