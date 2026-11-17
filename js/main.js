import { html, render } from './ui.js';
import { App } from './components/app.js';

render(html`<${App} />`, document.getElementById('app'));
// the static splash in index.html only exists to give the browser something to paint while the modules load
requestAnimationFrame(() => { const b = document.getElementById('boot'); if (b) b.remove(); });
