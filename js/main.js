import { Renderer } from './renderer.js';
import { PixBuf } from './pixbuf.js';
import { Director, STORY, SCENES } from './director.js';
import { damp, clamp } from './util.js';
import { Title } from './scenes/title.js';
import { Strait } from './scenes/strait.js';
import { Core } from './scenes/core.js';
import { Ledger } from './scenes/ledger.js';
import { Crypto } from './scenes/crypto.js';
import { Signal } from './scenes/signal.js';
import { Closing } from './scenes/closing.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Loader } from './loader.js';
import { Sound } from './audio.js';
import { Egg } from './egg.js';
import { Scramble } from './scramble.js';
import { SmoothScroll } from './scroll.js';
import { Tentacle } from './tentacle.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const mq = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;

// `?still` = a sequence of stills. The OS "reduce motion" setting no longer
// freezes anything: it only removes flashes, shakes and tearing (`calm`).
const STILL = params.has('still');
const app = {
  reduced: STILL,
  calm: mq.matches || STILL,
  capture: CAPTURE,
  time: 0,
  boot: 0,
  booted: false,
  sTarget: 0,
  s: 0,
  unit: 1,
  w: 1, h: 1, pd: 4, dpr: 1,
};
if (app.reduced) root.classList.add('still');
if (app.calm) root.classList.add('calm');
Scramble.calm = app.reduced;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const stage = document.getElementById('stage');
const canvas = document.getElementById('world');
const director = new Director();
const W = new PixBuf();
const F = new PixBuf();
const W2 = new PixBuf(); // sprites standing in front of the 3D pass

let renderer = null;
try {
  renderer = new Renderer(canvas, { preserve: CAPTURE });
} catch (err) {
  root.classList.add('no-webgl');
}

const input = new Input(app);
const sound = new Sound(app);
const smoothScroll = new SmoothScroll(app);
const arm = new Tentacle({ app, input });
const ctx = { app, director, input, sound, W, F, W2, mesh: null, project: null };
const scenes = [new Strait(ctx), new Core(ctx), new Ledger(ctx), new Crypto(ctx), new Signal(ctx), new Closing(ctx), new Title(ctx)];
ctx.scenes = { strait: scenes[0], core: scenes[1], ledger: scenes[2], crypto: scenes[3], signal: scenes[4], closing: scenes[5], title: scenes[6] };
const hud = new Hud(ctx);
const egg = new Egg(ctx);
ctx.egg = egg;
ctx.hud = hud;

// ------------------------------------------------------------------ sizing
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = stage.clientWidth || window.innerWidth;
  const cssH = stage.clientHeight || window.innerHeight;
  const devW = Math.round(cssW * dpr);
  const devH = Math.round(cssH * dpr);
  // whole device pixels per world pixel, ~86k world pixels on any screen
  const pd = Math.max(2, Math.round(Math.sqrt((devW * devH) / 86000)));
  const w = Math.ceil(devW / pd);
  const h = Math.ceil(devH / pd);
  app.w = w; app.h = h; app.pd = pd; app.dpr = dpr;
  canvas.style.width = (w * pd) / dpr + 'px';
  canvas.style.height = (h * pd) / dpr + 'px';
  if (renderer) renderer.resize(w, h);
  W.resize(w, h);
  F.resize(w, h);
  W2.resize(w, h);
  const small = cssW < 760;
  const fpDev = Math.max(2, Math.round((small ? 1.6 : 2) * dpr));
  root.style.setProperty('--fp', fpDev / dpr + 'px');
  root.style.setProperty('--px', pd / dpr + 'px');
  app.unit = cssH;
  root.style.setProperty('--unit', cssH + 'px');
  app.aspect = w / h;
  for (const s of scenes) s.resize && s.resize(w, h);
  hud.resize();
  arm.resize();
}

let lastW = 0, lastH = 0;
function maybeResize() {
  const cw = stage.clientWidth, ch = stage.clientHeight;
  // ignore mobile toolbar jitter: only width changes or big height jumps
  if (cw !== lastW || Math.abs(ch - lastH) > 140) {
    lastW = cw; lastH = ch;
    resize();
  }
}
window.addEventListener('resize', maybeResize, { passive: true });

// ------------------------------------------------------------------ scroll
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
function readScroll() {
  app.sTarget = clamp(window.scrollY / app.unit, 0, STORY.end);
}
window.addEventListener('scroll', readScroll, { passive: true });

addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || /input|textarea/i.test(e.target.tagName)) return;
  const n = '123456'.indexOf(e.key);
  if (n >= 0) { jumpTo(SCENES[n].jump); sound.event('ui', n / 5); }
});

export function jumpTo(s, instant = false) {
  const y = Math.min(s * app.unit, maxScroll());
  if (instant || app.reduced || CAPTURE) window.scrollTo(0, y);
  else smoothScroll.to(y);
}
ctx.jumpTo = jumpTo;
ctx.SCENES = SCENES;

// -------------------------------------------------------------------- loop
const DEBUG = params.has('debug');
const perf = { n: 0, total: 0, max: 0, frames: [] };
if (DEBUG) window.__perf = perf;

function step(dt) {
  const t0 = DEBUG ? performance.now() : 0;
  app.time += dt;
  if (app.booted || CAPTURE) app.boot += dt;
  smoothScroll.update(dt);
  readScroll();
  app.s = app.reduced ? app.sTarget : damp(app.s, app.sTarget, 8, dt);
  if (Math.abs(app.s - app.sTarget) < 0.0005) app.s = app.sTarget;
  input.update(dt);
  const S = director.update(app.s, app.time, dt, app.reduced ? 99 : app.boot, app.aspect, input);
  if (app.calm) { S.glitch = 0; S.split = 0; S.shake = 0; S.red = 0; }
  ctx.S = S;
  W.clear();
  F.clear();
  W2.clear();
  F.used = true; // the fx layer is (almost) never empty
  for (const sc of scenes) sc.frame(S, dt);
  egg.frame(S, dt);
  if (renderer) renderer.render(S, W, F, W2, ctx.mesh);
  hud.update(S, app.reduced ? 1 / 30 : dt);
  arm.update(S, dt);
  sound.update(S, app.reduced ? 1 / 30 : dt);
  if (DEBUG) {
    const ms = performance.now() - t0;
    perf.n++; perf.total += ms; perf.max = Math.max(perf.max, ms);
    if (perf.frames.length < 2000) perf.frames.push(ms);
  }
}

let raf = 0;
let last = 0;
let stillKey = '';
app.invalidate = () => { stillKey = ''; };
function frame(now) {
  raf = requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.1) dt = 0.1;
  if (app.reduced) {
    // reduced motion: time stands still; a frame is drawn only when the
    // reader scrolls or the window changes - a calm sequence of stills
    readScroll();
    const key = app.sTarget.toFixed(3) + ':' + app.w + 'x' + app.h + ':' + sound.on;
    if (key === stillKey) return;
    stillKey = key;
    step(0);
    return;
  }
  step(dt);
}
function start() {
  if (raf || CAPTURE) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stop(); sound.suspend(); } else { start(); sound.resume(); }
});
mq.addEventListener && mq.addEventListener('change', (e) => {
  app.calm = e.matches || STILL;
  root.classList.toggle('calm', app.calm);
});

// -------------------------------------------------------------------- boot
function grain() {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random();
    const on = v > 0.5;
    img.data[i] = on ? 120 : 0;
    img.data[i + 1] = on ? 70 : 0;
    img.data[i + 2] = on ? 140 : 0;
    img.data[i + 3] = Math.abs(v - 0.5) > 0.36 ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  root.style.setProperty('--grain', `url(${c.toDataURL('image/png')})`);
}

async function boot() {
  lastW = stage.clientWidth; lastH = stage.clientHeight;
  resize();
  grain();
  window.scrollTo(0, 0);
  const loader = new Loader(document.getElementById('loader'), app);
  const fontReady = document.fonts && document.fonts.load ? document.fonts.load('16px "SC Pixel"', '₿').catch(() => {}) : Promise.resolve();
  if (CAPTURE) {
    await fontReady;
    loader.finish(true);
    root.classList.remove('is-loading');
    root.classList.add('is-loaded');
    app.booted = true;
    exposeCapture();
    return;
  }
  // first frame renders behind the loader so nothing pops later
  step(1 / 60);
  await Promise.all([fontReady, loader.run(app.reduced ? 250 : 1500)]);
  root.classList.remove('is-loading');
  root.classList.add('is-loaded');
  app.booted = true;
  hud.boot();
  start();
}

// deterministic stepping for screenshots / video capture
function exposeCapture() {
  window.__sc = {
    ready: true,
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); },
    scroll(s) { window.scrollTo(0, s * app.unit); readScroll(); },
    snap(s) { window.scrollTo(0, s * app.unit); readScroll(); app.s = app.sTarget; },
    pointer(x, y, down = false) { input.fake(x, y, down); },
    boot(t) { app.boot = t; },
    impulse(g, sh, r) { director.impulse(g, sh, r); },
    state: () => ({ s: app.s, w: app.w, h: app.h, pd: app.pd, scene: ctx.S && ctx.S.scene }),
    egg: () => egg.trigger(),
    strike: (x) => ctx.scenes.strait.strike(ctx.S, x),
    forceTitle: (on) => { ctx.forceTitle = !!on; },
    calm: () => { director.glitchImpulse = 0; director.shakeImpulse = 0; director.redImpulse = 0; },
    story: STORY,
  };
  hud.boot();
  step(1 / 60);
}

boot().catch((err) => {
  console.error(err);
  root.classList.remove('is-loading');
  root.classList.add('is-loaded', 'is-booted', 'no-webgl');
});
