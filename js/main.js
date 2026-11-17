import { html, render } from './ui.js';
import { App } from './components/app.js';
import { installPointerFX } from './fx.js';

render(html`<${App} />`, document.getElementById('app'));
installPointerFX();
// the static splash in index.html only exists to give the browser something to paint while the modules load
requestAnimationFrame(() => { const b = document.getElementById('boot'); if (b) b.remove(); });

// Nova's living background loads once the first screen is up, so it never competes with it. It switches itself off in Classic.
const later = window.requestIdleCallback || ((f) => setTimeout(f, 600));
setTimeout(() => later(() => { import('./ambient.js').then((m) => m.ambient.start()).catch(() => {}); import('./stars.js').then((m) => m.stars.start()).catch(() => {}); }, { timeout: 3000 }), 900);
