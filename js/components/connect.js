import { html, useState, useEffect } from '../ui.js';

export function ConnectScreen({ onConnect, onDemo, initialError }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  // fetch the demo generator in the background so "Try demo" starts instantly
  useEffect(() => { const go = () => import('../demo.js').catch(() => {}); ('requestIdleCallback' in window ? requestIdleCallback(go) : setTimeout(go, 800)); }, []);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    let base = url.trim();
    if (!base) return setError('Enter your GoatCounter URL.');
    if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
    try { const u = new URL(base); base = u.protocol + '//' + u.host; } catch { return setError("That doesn't look like a valid URL. Try https://yoursite.goatcounter.com"); }
    if (!key.trim()) return setError('Paste your API key.');
    setBusy(true);
    try { await onConnect(base, key.trim()); } catch (err) { setError(err.message || 'Could not connect.'); } finally { setBusy(false); }
  };
  return html`<main class="connect">
    <div class="card">
      <div class="mark" aria-hidden="true">🐐</div>
      <h1>Your traffic, <span class="ital">beautifully</span> clear.</h1>
      <p>A fast dashboard for your GoatCounter stats. Your key stays in this browser and only ever goes to your own GoatCounter site.</p>
      <form onSubmit=${submit} novalidate>
        <label class="field"><span>GoatCounter URL</span><input type="url" inputmode="url" autocomplete="url" placeholder="https://yoursite.goatcounter.com" value=${url} onInput=${(e) => setUrl(e.target.value)} /></label>
        <label class="field"><span>API key</span><input type="password" autocomplete="off" placeholder="Read statistics key" value=${key} onInput=${(e) => setKey(e.target.value)} /></label>
        ${error ? html`<div class="err" role="alert">${error}</div>` : null}
        <div class="btns"><button class="btn primary" type="submit" disabled=${busy}>${busy ? 'Connecting...' : 'Connect'}</button><button class="btn" type="button" onClick=${onDemo}>Try demo</button></div>
      </form>
      <details class="help"><summary>How do I get an API key?</summary><ol>
        <li>Log in to your GoatCounter site.</li><li>Click your username in the top menu, then <b>API</b>.</li>
        <li>Add a token with <b>Read statistics</b> ticked. Also tick <b>Read sites</b> if you want to switch between your sites.</li><li>Copy the key and paste it above.</li></ol></details>
    </div>
    <p class="foot">Open source. No tracking. No server.</p>
  </main>`;
}
