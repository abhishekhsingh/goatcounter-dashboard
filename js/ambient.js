// Nova's living background: one fullscreen fragment shader (domain-warped noise) drawn small and upscaled by CSS.
// It runs at a low resolution and 30 fps, pauses when the tab is hidden, shows one still frame under reduced motion,
// and gives way to the CSS aurora blobs on weak devices, on context loss, or in the Classic design.
// The dashboard feeds it one number through the "gc:energy" event: how busy the traffic on screen is (0 to 1).
import { hexToRgb, cssVar } from './fx.js';

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes, uMouse;
uniform float uPhase, uEnergy, uK, uHour, uLight;
uniform vec3 uBg, uA, uB, uC;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p){ // three soft octaves: big, slow shapes, no fine detail
  float v = 0., a = .55;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 1.9 + vec2(1.7, 9.2); a *= .45; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - .5) * vec2(uRes.x / uRes.y, 1.) * .85 + (uMouse - .5) * vec2(.05, -.05);
  vec2 q = vec2(fbm(p + vec2(0., uPhase)), fbm(p + vec2(5.2, 1.3) - uPhase));
  float f = fbm(p + 1.5 * q + vec2(uPhase * .6, -uPhase * .5));
  float day = .5 + .5 * sin(6.2831 * (uHour - 9.) / 24.);
  float body = smoothstep(.22, .9, f);
  vec3 col = mix(uBg, uA, body * .8);
  col = mix(col, uB, smoothstep(.4, .95, q.x) * .55 * (.5 + .5 * day));
  col = mix(col, uC, smoothstep(.5, 1., q.y) * .38 * (.5 + .5 * (1. - day)));
  col = mix(uBg, col, uK * (.9 + .2 * uEnergy));
  col += (hash(gl_FragCoord.xy) - .5) * mix(.012, .008, uLight); // fixed grain, so nothing shimmers
  gl_FragColor = vec4(col, 1.);
}`;

const html = document.documentElement;
const isNova = () => html.getAttribute('data-look') === 'nova' && html.getAttribute('data-bg') !== 'off';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const weak = () => {
  const n = navigator, c = n.connection;
  return (c && c.saveData) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) || (n.deviceMemory && n.deviceMemory <= 2);
};

class Ambient {
  constructor() {
    this.energy = 0.5; this.shown = 0.5; this.mouse = [0.5, 0.5]; this.mouseTo = [0.5, 0.5];
    this.scale = 0.4; this.raf = 0; this.last = 0; this.phase = 7; this.on = false; this.gave = false; this.dts = [];
  }
  start() {
    if (this.started) return; this.started = true;
    if (weak()) return;
    addEventListener('gc:energy', (e) => { this.energy = Math.max(0, Math.min(1, e.detail)); this.kick(); });
    addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { this.mouseTo = [e.clientX / innerWidth, e.clientY / innerHeight]; this.kick(); } }, { passive: true });
    addEventListener('resize', () => { clearTimeout(this.rs); this.rs = setTimeout(() => this.size(), 150); });
    document.addEventListener('visibilitychange', () => (document.hidden ? this.halt() : this.kick()));
    new MutationObserver(() => this.sync()).observe(html, { attributes: true, attributeFilter: ['data-look', 'data-theme', 'data-bg'] });
    this.sync();
  }
  sync() { // look, theme or background setting changed, or first call
    const was = this.mode; this.mode = html.getAttribute('data-bg') === 'still' ? 'still' : 'flow';
    if (!isNova() || this.gave) return this.off();
    if (!this.on) this.mount();
    else { this.colors(); if (was !== this.mode) this.halt(); this.kick(); }
  }
  mount() {
    const host = document.querySelector('.aurora');
    if (!host) return;
    const cv = document.createElement('canvas');
    cv.id = 'flow'; cv.setAttribute('aria-hidden', 'true');
    const gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) { this.gave = true; return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS), pr = gl.createProgram();
    if (!vs || !fs) { this.gave = true; return; }
    gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { this.gave = true; return; }
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one triangle covers the screen
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {}; for (const n of ['uRes', 'uMouse', 'uPhase', 'uEnergy', 'uK', 'uHour', 'uLight', 'uBg', 'uA', 'uB', 'uC']) this.u[n] = gl.getUniformLocation(pr, n);
    this.gl = gl; this.cv = cv; this.pr = pr; this.on = true;
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.halt(); this.unmount(true); });
    host.prepend(cv);
    this.colors(); this.size(); // size() draws the first frame before the fade, so nothing flashes
    requestAnimationFrame(() => html.classList.add('gl'));
    this.kick();
  }
  unmount(lost) {
    this.on = false; if (this.cv) this.cv.remove(); this.cv = this.gl = null; html.classList.remove('gl');
    if (lost) this.gave = true; // after a lost context the CSS blobs carry on
  }
  off() { this.halt(); if (this.on) this.unmount(false); }
  size() {
    if (!this.cv) return;
    const w = Math.max(64, Math.round(innerWidth * this.scale)), h = Math.max(64, Math.round(innerHeight * this.scale));
    const k = Math.min(1, 960 / Math.max(w, h));
    this.cv.width = Math.round(w * k); this.cv.height = Math.round(h * k);
    this.gl.viewport(0, 0, this.cv.width, this.cv.height);
    this.statics(); this.draw(performance.now()); this.kick();
  }
  colors() {
    const light = html.getAttribute('data-theme') === 'light';
    this.pal = { bg: hexToRgb(cssVar('--bg')), a: hexToRgb(cssVar('--accent')), b: hexToRgb(cssVar('--accent-2')), c: hexToRgb(cssVar('--hot')), light, k: light ? 0.66 : 0.72 };
    this.statics(); this.hourAt = 0;
  }
  statics() { // uniforms that only change with the size or the palette
    const { gl, u, pal } = this; if (!gl || !pal) return;
    gl.uniform2f(u.uRes, this.cv.width, this.cv.height); gl.uniform1f(u.uK, pal.k); gl.uniform1f(u.uLight, pal.light ? 1 : 0);
    gl.uniform3fv(u.uBg, pal.bg); gl.uniform3fv(u.uA, pal.a); gl.uniform3fv(u.uB, pal.b); gl.uniform3fv(u.uC, pal.c);
  }
  draw(now, dt = 0) {
    const { gl, u } = this; if (!gl) return;
    const still = reduced() || this.mode === 'still';
    // Time is a running total that only grows while frames are drawn, so a pause (a scroll, a hidden tab) never makes the picture jump,
    // and a change of energy only changes the speed from now on, not where the pattern is.
    this.phase += still ? 0 : Math.min(0.1, dt / 1000) * (0.009 + 0.005 * this.shown);
    this.shown += (this.energy - this.shown) * 0.04;
    this.mouse[0] += (this.mouseTo[0] - this.mouse[0]) * 0.04; this.mouse[1] += (this.mouseTo[1] - this.mouse[1]) * 0.04;
    if (now - (this.hourAt || -1e9) > 30000) { const d = new Date(); this.hour = d.getHours() + d.getMinutes() / 60; this.hourAt = now; gl.uniform1f(u.uHour, this.hour); }
    gl.uniform2f(u.uMouse, still ? 0.5 : this.mouse[0], still ? 0.5 : this.mouse[1]);
    gl.uniform1f(u.uPhase, this.phase); gl.uniform1f(u.uEnergy, this.shown);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  kick() {
    if (!this.on || this.raf || document.hidden) return;
    if (reduced() || this.mode === 'still') { this.raf = requestAnimationFrame((t) => { this.raf = 0; this.draw(t); }); return; } // one still frame
    this.last = 0; this.raf = requestAnimationFrame((t) => this.loop(t));
  }
  halt() { cancelAnimationFrame(this.raf); this.raf = 0; }
  loop(now) {
    this.raf = requestAnimationFrame((t) => this.loop(t));
    if (now - this.last < 45) return; // 20 fps: the motion is slow enough that more would only cost power
    if (this.last && now - this.last > 400) this.last = 0; // do not time a pause as a slow frame
    const dt = this.last ? now - this.last : 0;
    if (dt) this.probe(dt);
    this.last = now; this.draw(now, dt);
  }
  // If the first frames arrive slowly, draw smaller; if that is not enough, step aside for the CSS blobs.
  probe(dt) {
    if (this.tuned) return;
    this.dts.push(dt); if (this.dts.length < 45) return;
    const avg = this.dts.reduce((a, b) => a + b, 0) / this.dts.length; this.dts = [];
    if (avg <= 68) { this.tuned = true; return; }
    if (this.scale > 0.25) { this.scale *= 0.7; this.size(); } else { this.tuned = true; this.gave = true; this.halt(); this.unmount(true); }
  }
}

export const ambient = new Ambient();
