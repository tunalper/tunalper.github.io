// Scene 2 - the strait. Cliffs and Scylla on the left, Charybdis on the
// right, a small ship between them, rain, fog, lightning. Everything is
// placed in world space and projected through the same camera as the sea.
import { C } from '../palette.js';
import { rng, clamp, lerp, range, smooth, TAU, hash1 } from '../util.js';
import { Camera } from '../camera.js';
import { STORY } from '../director.js';
import { Scylla3D } from './scylla3d.js';

const P = { x: 0, y: 0, k: 0, z: 0 };
const Q = { x: 0, y: 0, k: 0, z: 0 };

// jagged ridge through key points (world units) -> flat [x,y,...]
function ridge(r, keys, step, jag, spikes = 0.06) {
  const pts = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const [x0, y0] = keys[i];
    const [x1, y1] = keys[i + 1];
    const n = Math.max(1, Math.ceil(Math.abs(x1 - x0) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const x = lerp(x0, x1, t);
      const y = lerp(y0, y1, smooth(t));
      const j1 = (r() - 0.5) * jag * Math.min(1, y / 3);
      pts.push(x, Math.max(0.2, y + j1));
      if (r() < spikes && y > 2) pts.push(x + step * 0.35, y + 0.8 + r() * 2.2 * Math.min(1, y / 8));
    }
  }
  const last = keys[keys.length - 1];
  pts.push(last[0], last[1]);
  return pts;
}

// a 5x8 coin mark, stitched into the sail
const COIN = [0b01010, 0b11110, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110, 0b01010];
function drawCoinMark(W, x, y, c) { W.bits(x, y, COIN, 5, c); }

export class Strait {
  constructor(ctx) {
    this.ctx = ctx;
    this.cam = new Camera();
    ctx.camera = this.cam;
    this.L = -1;
    this.drops = [];
    this.dashes = [];
    this.spray = [];
    this.bolt = null;
    this.boltT = 0;
    this.nextBolt = 2.5;
    this.flash = 0;
    this.flashX = 0.5;
    this.scr = new Float32Array(512);
    this.targets = { scylla: { x: 0, y: 0, w: 0, h: 0, vis: 0 }, charybdis: { x: 0, y: 0, w: 0, h: 0, vis: 0 } };
    this.necks = [];
    this.shipPos = { x: 0, z: 0, vis: 1, roll: 0, scale: 1 };
    this.shipWorld = { x: 0, z: 0, vis: 0 };
    this.scylla = new Scylla3D(this);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    const n = Math.round(clamp((w * h) / 520, 80, 220));
    this.drops.length = 0;
    const r = rng(11);
    for (let i = 0; i < n; i++) this.drops.push({ x: r() * w, y: r() * h, z: 0.35 + r() * 0.65, life: r() });
    this.dashes.length = 0;
    const r2 = rng(5);
    for (let i = 0; i < 300; i++) this.dashes.push({ x: (r2() - 0.5) * 120, z: r2() * 140, len: 0.5 + r2() * 1.8, ph: r2() * 10, sp: 0.5 + r2() });
  }

  build(L) {
    this.L = L;
    const r = rng(1931);
    const X = (k) => k.map(([x, y]) => [x * L, y]);
    this.layers = [
      { // far massif, left
        z: 92, base: C.dusk, rim: C.plum, lit: C.plum2, litRim: C.violet2,
        pts: ridge(r, X([[-150, 8], [-96, 19], [-74, 13], [-52, 23], [-36, 12], [-22, 7], [-14, 0]]), 2.2, 2.2, 0.03),
      },
      { // far right, low teeth on the horizon
        z: 118, base: C.dusk, rim: C.plum, lit: C.plum2, litRim: C.violet,
        pts: ridge(r, X([[26, 0], [34, 4], [48, 2.5], [62, 6.5], [80, 3], [110, 5], [150, 0]]), 2.5, 1.8, 0.05),
      },
      { // a sea stack beyond the whirlpool
        z: 58, base: C.night, rim: C.plum, lit: C.plum2, litRim: C.violet2,
        pts: ridge(r, X([[24, 0], [25, 6], [26.4, 12.5], [27.8, 9], [29, 3.5], [30.5, 0]]), 0.7, 0.9, 0.0),
      },
      { // Scylla's cliff
        z: 34, base: C.ink, rim: C.plum2, lit: C.plum, litRim: C.violet2, main: true,
        pts: ridge(r, X([[-70, 14], [-50, 17], [-38, 14.5], [-28, 20.5], [-21, 15.5], [-15.5, 10.8], [-11.6, 9.8], [-8.6, 9.0], [-7.5, 5.5], [-6.8, 2.6], [-6.2, 0]]), 0.9, 1.3, 0.07),
      },
      { // near rocks, bottom left, pass by fast
        z: 7, base: C.void, rim: C.plum, lit: C.night, litRim: C.violet, front: true,
        pts: ridge(r, X([[-26, 0], [-20, 2.2], [-15, 1.4], [-11, 2.8], [-8.2, 1.2], [-6.6, 0]]), 0.6, 0.8, 0.12),
      },
    ];
    // close each ridge into a polygon standing on the waterline
    for (const l of this.layers) {
      const p = l.pts;
      l.poly = [p[0], -0.4, ...p, p[p.length - 2], -0.4];
      l.scr = new Float32Array(l.poly.length);
    }
    // cave mouth on the cliff face
    const cx = -9.7 * L, cy = 4.1;
    const cave = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const rr = 1 + (r() - 0.5) * 0.35;
      cave.push(cx + Math.cos(a) * 1.75 * rr * Math.max(L, 0.75), cy + Math.sin(a) * 2.2 * rr);
    }
    this.cave = { pts: cave, scr: new Float32Array(cave.length), x: cx, y: cy, z: 33.8 };

    this.scylla.build(L, cx, cy, 33.8);
  }

  // ------------------------------------------------------------ helpers
  projectPoly(src, z, dst) {
    const cam = this.cam;
    let ok = true;
    for (let i = 0; i < src.length; i += 2) {
      if (!cam.project(src[i], src[i + 1], z, P)) { ok = false; break; }
      dst[i] = P.x; dst[i + 1] = P.y;
    }
    return ok;
  }

  // -------------------------------------------------------------- frame
  frame(S, dt) {
    const { W, F, app, director, input } = this.ctx;
    const L = clamp(S.aspect / 1.6, 0.55, 1.15);
    if (Math.abs(L - this.L) > 0.01) this.build(L);
    this.cam.update(S, W.w, W.h);
    this.time = S.time;

    this.updateLightning(S, dt, input);
    const vis = S.world * (1 - range(S.s, STORY.core - 0.2, STORY.core + 0.4));
    this.ctx.mesh = null;
    if (vis <= 0.01) { this.targets.scylla.vis = this.targets.charybdis.vis = 0; this.drawRain(S, F, dt); return; }
    const W2 = this.ctx.W2;
    W2.used = true;

    const lit = this.flash > 0.35;
    W.used = true;
    this.drawDashes(S, W, dt);
    this.drawGlitter(S, W);
    for (const l of this.layers) {
      this.drawLayer(l, l.front ? W2 : W, lit);
      if (l.main) {
        this.drawCave(W, lit);
        // Scylla is real geometry now: built here, drawn by the mesh pass
        if (this.scylla.ready && this.cam.pitch < 1.2) { this.scylla.update(S, W2, dt); this.ctx.mesh = this.scylla.geo; }
        else this.targets.scylla.vis = 0;
      }
    }
    this.drawSpray(S, W, dt);
    this.drawShip(S, W2, lit);
    this.drawRain(S, F, dt);
    this.drawBolt(F);
    this.measureTargets(S);
  }

  // ----------------------------------------------------------- lightning
  updateLightning(S, dt, input) {
    const stormy = S.storm * S.world;
    this.flash = Math.max(0, this.flash - dt * 4.5);
    if (this.bolt) {
      this.boltT += dt;
      // double strike flicker
      const t = this.boltT;
      const on = t < 0.07 || (t > 0.12 && t < 0.2) || (t > 0.26 && t < 0.3);
      this.bolt.on = on;
      if (on) this.flash = Math.max(this.flash, t < 0.07 ? 1 : 0.75);
      if (t > 0.34) this.bolt = null;
    }
    // no strobing for people who asked the system for calm
    if (this.ctx.app.reduced || this.ctx.app.calm) { this.bolt = null; this.flash = 0; S.flash[1] = 0; return; }
    // a tap on the storm calls the lightning down
    for (const tp of input.taps) {
      if (stormy > 0.4 && S.w.strait > 0.3 && !this.bolt && (!tp.el || tp.el === document.documentElement || tp.el === document.body || tp.el.closest('#story'))) {
        this.strike(S, tp.x);
      }
    }
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      this.nextBolt = 3.2 + Math.random() * 5.5;
      // even before the reader scrolls, the storm shows the strait in flashes
      if (S.storm > 0.35 && S.world > 0.05) this.strike(S, Math.random() < 0.45 ? 0.2 + Math.random() * 0.15 : 0.1 + Math.random() * 0.8);
    }
    S.flash[0] = this.flashX;
    S.flash[1] = this.flash * S.storm * (S.world > 0.01 ? 1 : 0);
  }

  strike(S, xn) {
    const w = this.w, h = this.h;
    const hz = clamp(this.cam.horizon(), h * 0.2, h * 0.9);
    const x0 = xn * w + (Math.random() - 0.5) * 20;
    const y1 = hz + 2 + Math.random() * 8;
    const pts = [x0, -4];
    let x = x0, y = -4;
    const segs = 14 + ((Math.random() * 6) | 0);
    const branches = [];
    for (let i = 1; i <= segs; i++) {
      y = lerp(-4, y1, i / segs);
      x += (Math.random() - 0.5) * 14 + (Math.random() < 0.15 ? (Math.random() - 0.5) * 18 : 0);
      pts.push(x, y);
      if (Math.random() < 0.22 && i < segs - 2) {
        const b = [x, y];
        let bx = x, by = y;
        const n = 3 + ((Math.random() * 4) | 0);
        const dir = Math.random() < 0.5 ? -1 : 1;
        for (let j = 0; j < n; j++) { bx += dir * (3 + Math.random() * 7); by += 3 + Math.random() * 6; b.push(bx, by); }
        branches.push(b);
      }
    }
    this.bolt = { pts, branches, on: true };
    this.boltT = 0;
    this.flashX = clamp(x0 / w);
    this.ctx.director.impulse(0.22, 1.2, 0);
    this.ctx.hud && this.ctx.hud.zap();
    this.ctx.sound.event('thunder', clamp(x0 / w));
  }

  drawBolt(F) {
    const b = this.bolt;
    if (!b || !b.on) return;
    const line = (p, core, glow) => {
      for (let i = 0; i + 3 < p.length; i += 2) {
        F.line(p[i] - 1, p[i + 1], p[i + 2] - 1, p[i + 3], glow, 0.6);
        F.line(p[i] + 1, p[i + 1], p[i + 2] + 1, p[i + 3], glow, 0.6);
        F.line(p[i], p[i + 1], p[i + 2], p[i + 3], core);
      }
    };
    for (const br of b.branches) line(br, C.violet2, C.plum2);
    line(b.pts, C.uv2, C.violet);
  }

  // -------------------------------------------------------------- layers
  drawLayer(l, W, lit) {
    if (!this.projectPoly(l.poly, l.z, l.scr)) return;
    const s = l.scr;
    const base = lit ? l.lit : l.base, rim = lit ? l.litRim : l.rim;
    W.poly(s, rim);
    // shift the body down-left by one pixel: a 1px rim of moonlight remains
    for (let i = 0; i < s.length; i += 2) { s[i] -= 1; s[i + 1] += 1; }
    W.poly(s, base);
    if (l.main) {
      // strata: darker cracks clipped to the rock body
      const r = rng(77);
      for (let i = 0; i < 70; i++) {
        const wx = (-60 + r() * 54) * this.L, wy = 1 + r() * 16;
        if (!this.cam.project(wx, wy, l.z, P)) continue;
        const len = 2 + r() * 6 * (P.k / 4);
        const dx = r() < 0.5 ? 1 : -1;
        for (let j = 0; j < len; j++) W.over(P.x + j * dx * 0.7, P.y + j * 0.55, lit ? C.plum2 : C.night, base);
      }
      // surf where the cliff meets the sea
      const t = this.time;
      if (this.cam.project(-70 * this.L, 0, l.z, P) && this.cam.project(-6.2 * this.L, 0, l.z, Q)) {
        const y = Math.round(P.y) - 1;
        for (let x = Math.max(0, P.x | 0); x < Math.min(this.w, Q.x + 3); x++) {
          const n = hash1(x * 7 + ((t * 6) | 0));
          if (n > 0.55) W.set(x, y, n > 0.9 ? C.violet : C.plum2);
          if (n > 0.93) W.set(x, y - 1, C.plum);
        }
      }
    }
  }

  drawCave(W, lit) {
    const c = this.cave;
    if (!this.projectPoly(c.pts, c.z, c.scr)) return;
    W.poly(c.scr, lit ? C.ink : C.void);
    // embers deep inside the lair
    if (this.cam.project(c.x, c.y - 1.2, c.z, P)) {
      const t = this.time;
      for (let i = 0; i < 9; i++) {
        const x = P.x + Math.round((hash1(i * 13) - 0.5) * P.k * 2.2);
        const y = P.y + Math.round(hash1(i * 7 + 3) * P.k * 0.8);
        const on = hash1(i + ((t * (2 + i * 0.3)) | 0) * 17) > 0.35;
        if (on) W.set(x, y, i % 3 ? C.blood1 : C.blood2);
      }
    }
  }

  // -------------------------------------------------------------- the sea
  drawDashes(S, W, dt) {
    const cam = this.cam;
    if (cam.pitch > 1.45) return;
    const wx = S.whirl[0], wz = S.whirl[1], wr = S.whirl[2];
    const t = this.time;
    for (const d of this.dashes) {
      // recycle around the camera
      let rz = d.z - cam.z;
      if (rz < 2) { d.z += 140; d.x = cam.x + (Math.random() - 0.5) * 140; rz = d.z - cam.z; }
      if (rz > 142) { d.z -= 140; rz = d.z - cam.z; }
      // whirlpool drags the crests round and in
      const ex = d.x - wx, ez = d.z - wz;
      const rr = Math.hypot(ex, ez) / wr;
      let dirx = 1, dirz = 0;
      if (rr < 1.8) {
        const w = (0.6 + 1.2 / (rr + 0.25)) * S.spin * 0.55 * (1 - smooth(clamp((rr - 1) / 0.8)));
        const a = Math.atan2(ez, ex) + w * dt;
        const nr = Math.max(0.05, rr - dt * 0.05 * (1 / (rr + 0.3))) * wr;
        d.x = wx + Math.cos(a) * nr; d.z = wz + Math.sin(a) * nr;
        dirx = -Math.sin(a); dirz = Math.cos(a);
        if (rr < 0.15) { d.x = wx + (Math.random() - 0.5) * 60; d.z = wz + 30 + Math.random() * 40; }
      } else {
        d.x += dt * 0.6 * d.sp;
      }
      if (!cam.project(d.x, 0, d.z, P)) continue;
      if (P.x < -10 || P.x > this.w + 10 || P.y < 0 || P.y >= this.h) continue;
      const blink = Math.sin(t * 2.2 * d.sp + d.ph);
      if (blink < -0.2) continue;
      const half = d.len * 0.5;
      if (!cam.project(d.x - dirx * half, 0, d.z - dirz * half, Q)) continue;
      let qx = Q.x, qy = Q.y;
      const hl = Math.hypot(P.x - qx, P.y - qy);
      if (hl > 6) { qx = P.x + (qx - P.x) * 6 / hl; qy = P.y + (qy - P.y) * 6 / hl; }
      const x2 = 2 * P.x - qx, y2 = 2 * P.y - qy;
      const near = clamp(P.k / 14);
      const col = rr < 1.2 ? (blink > 0.7 ? C.violet2 : C.violet) : near > 0.6 ? C.violet : near > 0.25 ? C.plum2 : C.plum;
      W.line(Math.round(qx), Math.round(qy), Math.round(x2), Math.round(y2), col);
    }
  }

  // stacked dashes under the moon - the pixel artist's moonlight
  drawGlitter(S, W) {
    if (S.moon < 0.05) return;
    const cam = this.cam;
    if (!cam.vanish(S.moonDir[0], S.moonDir[1], S.moonDir[2], P)) return;
    const mx = P.x;
    const hz = cam.horizon();
    if (hz < 0 || hz > this.h) return;
    const t = this.time;
    const tick = (t * 7) | 0;
    for (let y = Math.ceil(hz) + 1; y < this.h; y += 2) {
      const d = (y - hz) / this.h;
      const spread = 1.5 + d * this.w * 0.12;
      const n = 1 + (d * 3) | 0;
      for (let i = 0; i < n; i++) {
        const h1 = hash1(y * 31 + i * 7 + tick * 131);
        if (h1 < 0.35) continue;
        const x = mx + (hash1(y * 17 + i * 3 + tick * 71) - 0.5) * 2 * spread;
        const len = 1 + ((hash1(y + i + tick) * (1 + d * 9)) | 0);
        const col = h1 > 0.88 ? C.neon2 : h1 > 0.6 ? C.neon : C.blood2;
        W.rect(Math.round(x - len / 2), y, len, 1, col);
      }
    }
  }

  drawSpray(S, W, dt) {
    const cam = this.cam;
    const wx = S.whirl[0], wz = S.whirl[1], wr = S.whirl[2];
    const rate = 40 * (1 - range(S.s, STORY.dive + 0.2, STORY.core));
    this.sprayAcc = (this.sprayAcc || 0) + dt * rate;
    while (this.sprayAcc > 1) {
      this.sprayAcc -= 1;
      const a = Math.random() * TAU;
      const rr = wr * (0.95 + Math.random() * 0.15);
      if (!cam.project(wx + Math.cos(a) * rr, 0.1, wz + Math.sin(a) * rr, P)) continue;
      const sc = P.k / 8;
      this.spray.push({ x: P.x, y: P.y, vx: -Math.sin(a) * 14 * sc * (Math.random() + 0.3), vy: -(10 + Math.random() * 26) * sc, life: 0.5 + Math.random() * 0.7 });
    }
    for (let i = this.spray.length - 1; i >= 0; i--) {
      const p = this.spray[i];
      p.life -= dt;
      if (p.life <= 0) { this.spray.splice(i, 1); continue; }
      p.vy += 55 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      W.set(Math.round(p.x), Math.round(p.y), p.life > 0.4 ? C.violet : C.plum2);
    }
  }

  // ----------------------------------------------------------- the ship
  drawShip(S, W, lit) {
    const cam = this.cam;
    const t = this.time;
    const s = S.s;
    const L = this.L;
    // follow the ship until the whirlpool takes it
    const u = range(s, STORY.dive - 0.55, STORY.dive + 0.55);
    this.shipWorld.vis = 0;
    if (u >= 0.999) return;
    let x = 0.15 * L + Math.sin(t * 0.21) * 0.35;
    let z = cam.z + 19;
    const wx = S.whirl[0], wz = S.whirl[1], wr = S.whirl[2];
    let roll = Math.sin(t * 1.25) * 0.07 + Math.sin(t * 2.7) * 0.025;
    let shrink = 1;
    if (u > 0) {
      const a0 = Math.atan2(z - wz, x - wx);
      const a = a0 - u * u * 9.5;
      const rad = wr * lerp(1.25, 0.0, smooth(u));
      const k = smooth(clamp(u * 3));
      x = lerp(x, wx + Math.cos(a) * rad, k);
      z = lerp(z, wz + Math.sin(a) * rad, k);
      roll += u * u * 2.4 * Math.sin(t * 5);
      shrink = 1 - smooth(clamp((u - 0.6) / 0.4));
    }
    const bob = Math.sin(t * 1.6) * 0.09;
    this.shipWorld.x = x; this.shipWorld.z = z; this.shipWorld.vis = shrink;
    if (!cam.project(x, bob, z, P)) return;
    const k = P.k * 0.9 * shrink;
    if (k < 0.6) return;
    const ox = P.x, oy = P.y;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const tf = (src) => {
      const out = new Float32Array(src.length);
      for (let i = 0; i < src.length; i += 2) {
        const lx = src[i], ly = -src[i + 1];
        out[i] = ox + (lx * cr - ly * sr) * k;
        out[i + 1] = oy + (lx * sr + ly * cr) * k;
      }
      return out;
    };
    const oarPh = t * 2.1;
    const hull = tf([-2.6, 1.15, -2.45, 1.3, -1.75, 0.62, 1.7, 0.66, 2.15, 1.1, 2.5, 1.25, 2.0, 0.4, 1.3, -0.12, -0.7, -0.15, -1.7, 0.08, -2.2, 0.85]);
    const keel = tf([-1.65, 0.12, 1.25, -0.08, 1.75, 0.32, -2.0, 0.66]);
    const bil = Math.sin(t * 0.9) * 0.08;
    const sail = tf([-0.82, 3.05, 0.78, 3.12, 0.92 + bil, 2.2, 0.86, 1.55, 0.35, 1.72, 0.05, 1.5, -0.4, 1.7, -0.88, 1.5, -0.92 + bil, 2.3]);
    const mast = tf([0, 0.5, 0, 3.55]);
    const yard = tf([-0.95, 3.1, 0.92, 3.18]);
    const rig = tf([0, 3.65, 2.2, 1.05, 0, 3.65, -2.3, 1.05]);
    const gun = tf([-1.75, 0.64, 1.7, 0.68]);
    const eye = tf([1.8, 0.42]);
    const lamp = tf([-2.5, 1.5]);
    const emb = tf([0.0, 2.38]);
    const hullC = lit ? C.plum : C.void, rimC = lit ? C.violet2 : C.plum2;
    // oars rowing in and out of the water
    for (let i = 0; i < 5; i++) {
      const ax = -1.2 + i * 0.6, ph = oarPh + i * 0.5;
      const o = tf([ax, 0.35, ax - 0.55 - Math.sin(ph) * 0.25, -0.35 + Math.cos(ph) * 0.12]);
      W.line(Math.round(o[0]), Math.round(o[1]), Math.round(o[2]), Math.round(o[3]), lit ? C.plum2 : C.night);
    }
    W.line(Math.round(rig[0]), Math.round(rig[1]), Math.round(rig[2]), Math.round(rig[3]), C.night);
    W.line(Math.round(rig[4]), Math.round(rig[5]), Math.round(rig[6]), Math.round(rig[7]), C.night);
    W.line(Math.round(mast[0]), Math.round(mast[1]), Math.round(mast[2]), Math.round(mast[3]), lit ? C.plum2 : C.ink);
    // sail: blood cloth, darker belly, a ghost of the coin stitched in
    W.poly(sail, lit ? C.blood3 : C.blood1);
    for (let i = 0; i < sail.length; i += 2) { sail[i] += (sail[i] - emb[0]) * -0.3; sail[i + 1] += (sail[i + 1] - emb[1]) * -0.3 + 1; }
    W.poly(sail, lit ? C.blood2 : C.blood0);
    if (k > 9) drawCoinMark(W, Math.round(emb[0]) - 2, Math.round(emb[1]) - 4, lit ? C.blood3 : C.blood1);
    W.line(Math.round(yard[0]), Math.round(yard[1]), Math.round(yard[2]), Math.round(yard[3]), lit ? C.plum2 : C.ink);
    W.poly(hull, rimC);
    for (let i = 0; i < hull.length; i += 2) hull[i + 1] += 1;
    W.poly(hull, hullC);
    W.poly(keel, lit ? C.dusk : C.ink);
    W.line(Math.round(gun[0]), Math.round(gun[1]) + 1, Math.round(gun[2]), Math.round(gun[3]) + 1, lit ? C.violet : C.night);
    // the painted eye on the prow (old sailors' ward against the deep)
    W.set(Math.round(eye[0]), Math.round(eye[1]), C.neon);
    // lantern
    const lx = Math.round(lamp[0]), ly = Math.round(lamp[1]);
    const fl = 0.75 + 0.25 * Math.sin(t * 13) * Math.sin(t * 7.3);
    W.set(lx, ly, fl > 0.6 ? C.neon2 : C.neon);
    W.dset(lx - 1, ly, C.blood2, 0.6); W.dset(lx + 1, ly, C.blood2, 0.6); W.dset(lx, ly - 1, C.blood1, 0.6); W.dset(lx, ly + 1, C.blood1, 0.6);
    // wake
    for (let i = 0; i < 9; i++) {
      const wxk = ox - (2.4 + i * 0.85) * k * cr;
      const wy = oy + 1 + ((i * 0.25) | 0);
      if (hash1(i * 11 + ((t * 5) | 0)) > 0.3) W.rect(Math.round(wxk), Math.round(wy), Math.max(1, Math.round(k * 0.6)), 1, i < 3 ? C.violet : C.plum2);
    }
    this.shipPos.x = ox; this.shipPos.y = oy; this.shipPos.k = k;
    // swallowed: a red wink from the throat
    if (u > 0.85 && u < 0.999) this.ctx.director.impulse(0.15 * (u - 0.85) * 6, 0, 0.0);
  }

  // ---------------------------------------------------------------- rain
  drawRain(S, F, dt) {
    const amt = S.storm * S.world;
    if (amt < 0.02 || this.ctx.app.reduced) return;
    const cam = this.cam;
    const w = this.w, h = this.h;
    // rain falls toward the "down" vanishing point: straight lines when we
    // look at the horizon, a radial warp when we look into the throat.
    let vx = w * 0.5 + w * 0.18, vy = h * 40;
    if (cam.vanish(0.3, -1, 0, P)) { vx = P.x; vy = P.y; }
    const lit = this.flash > 0.35;
    const count = Math.floor(this.drops.length * clamp(amt));
    for (let i = 0; i < count; i++) {
      const d = this.drops[i];
      let dx = vx - d.x, dy = vy - d.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist; dy /= dist;
      const sp = (140 + 260 * d.z) * (dist < h ? 0.55 + 0.45 * dist / h : 1);
      d.x += dx * sp * dt; d.y += dy * sp * dt;
      d.life += dt;
      if (d.y > h + 4 || d.x < -6 || d.x > w + 6 || dist < 3) {
        d.x = Math.random() * w;
        d.y = vy > h * 2 ? -Math.random() * 30 : Math.random() * h;
        d.life = 0;
        continue;
      }
      const len = 1 + d.z * 4 * Math.min(1, dist / (h * 0.5));
      const col = lit ? (d.z > 0.7 ? C.violet2 : C.violet) : d.z > 0.8 ? C.violet : d.z > 0.5 ? C.plum2 : C.plum;
      const a = Math.min(1, d.life * 6);
      F.line(Math.round(d.x), Math.round(d.y), Math.round(d.x - dx * len), Math.round(d.y - dy * len), col, a);
    }
  }

  measureTargets(S) {
    const cam = this.cam;
    const T = this.targets.charybdis;
    const wx = S.whirl[0], wz = S.whirl[1], wr = S.whirl[2];
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, ok = 0;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      if (!cam.project(wx + Math.cos(a) * wr, 0, wz + Math.sin(a) * wr, P)) continue;
      ok++;
      minX = Math.min(minX, P.x); maxX = Math.max(maxX, P.x);
      minY = Math.min(minY, P.y); maxY = Math.max(maxY, P.y);
    }
    T.vis = ok > 8 ? 1 : 0;
    T.x = minX; T.y = minY; T.w = maxX - minX; T.h = maxY - minY;
    if (cam.project(wx, 0, wz, P)) { T.cx = P.x; T.cy = P.y; T.dist = P.z; }
    const Sc = this.targets.scylla;
    if (cam.project(this.cave.x, this.cave.y, this.cave.z, P)) Sc.dist = P.z;
  }
}
