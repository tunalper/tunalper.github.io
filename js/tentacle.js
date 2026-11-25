// The cursor is one of Scylla's arms: a red-and-black claw on the real
// pointer (an OS cursor image, so it never lags or disappears) and a
// segmented tentacle that trails behind it with a little physics.
import { PixBuf } from './pixbuf.js';
import { C, HEXES } from './palette.js';
import { clamp, lerp, smooth } from './util.js';

// 11x11 talon, tip at (0,0). K outline, N neon, R blood, B dark blood
const CLAW = [
  'K..........',
  'KK.........',
  'KNK........',
  'KNNK.......',
  'KNRNK......',
  '.KNRRK.....',
  '.KNRRRK....',
  '..KRRRBK...',
  '..KKRRBBK..',
  '....KKBBBK.',
  '......KKKK.',
];
const CLAW_COL = { K: HEXES[0], N: HEXES[15], R: HEXES[13], B: HEXES[11] };
const CLAW_PX = { K: C.void, N: C.neon2, R: C.blood3, B: C.blood1 };

function clawImage(scale) {
  const c = document.createElement('canvas');
  c.width = c.height = 11 * scale;
  const g = c.getContext('2d');
  CLAW.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = CLAW_COL[ch];
    g.fillRect(x * scale, y * scale, scale, scale);
  }));
  return c.toDataURL('image/png');
}

export class Tentacle {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = document.documentElement;
    this.canvas = document.getElementById('arm');
    this.fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    this.on = !!this.canvas && (this.fine || ctx.app.capture);
    this.N = 32;
    this.L = 8.5;            // css px per segment
    this.x = new Float32Array(this.N); this.y = new Float32Array(this.N);
    this.ox = new Float32Array(this.N); this.oy = new Float32Array(this.N);
    this.inited = false;
    this.box = null;
    this.drawn = false;
    if (!this.on) return;
    if (this.fine && !ctx.app.capture) {
      // the claw is the real cursor: two literal declarations so browsers
      // without image-set keep the plain one
      const a = clawImage(3), b = clawImage(6);
      const st = document.createElement('style');
      st.textContent = `html.has-claw,html.has-claw *{cursor:url(${a}) 0 0,auto!important;cursor:-webkit-image-set(url(${a}) 1x,url(${b}) 2x) 0 0,auto!important}`;
      document.head.appendChild(st);
      this.root.classList.add('has-claw');
    }
  }

  resize() {
    if (!this.on) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cp = Math.max(1, Math.round(2 * dpr)) / dpr;  // css px per art pixel
    const w = Math.ceil(innerWidth / this.cp), h = Math.ceil(innerHeight / this.cp);
    this.canvas.width = w; this.canvas.height = h;
    this.canvas.style.width = w * this.cp + 'px';
    this.canvas.style.height = h * this.cp + 'px';
    this.pb = new PixBuf(w, h);
    this.g = this.canvas.getContext('2d');
    this.img = new ImageData(new Uint8ClampedArray(this.pb.data.buffer), w, h);
    this.box = null;
  }

  clearBox() {
    const b = this.box;
    if (!b) return;
    const pb = this.pb;
    for (let y = b.y0; y < b.y1; y++) pb.u32.fill(0, y * pb.w + b.x0, y * pb.w + b.x1);
  }

  update(S, dt) {
    if (!this.on || !this.pb) return;
    const input = this.ctx.input;
    const prev = this.box;
    if (!input.present) {
      if (this.drawn) { this.clearBox(); this.flush(prev, null); this.drawn = false; this.box = null; }
      this.inited = false;
      return;
    }
    const N = this.N, L = this.L;
    const X = this.x, Y = this.y, OX = this.ox, OY = this.oy;
    // the arm grows out of the claw's heel
    const hx = input.cx + 23, hy = input.cy + 23;
    if (!this.inited) {
      for (let i = 0; i < N; i++) { X[i] = OX[i] = hx - i * L * 0.45; Y[i] = OY[i] = hy + i * L * 0.85; }
      this.inited = true;
    }
    const k = clamp(dt * 60, 0.2, 3);
    const t = S.time;
    X[0] = hx; Y[0] = hy;
    for (let i = 1; i < N; i++) {
      const vx = (X[i] - OX[i]) * 0.86, vy = (Y[i] - OY[i]) * 0.86;
      OX[i] = X[i]; OY[i] = Y[i];
      // it hangs toward the deep (down and left), and never stops breathing
      const dx = X[i] - X[i - 1], dy = Y[i] - Y[i - 1];
      const d = Math.hypot(dx, dy) || 1;
      const wave = Math.sin(t * 3.1 - i * 0.55) * 0.55 * (i / N);
      X[i] += vx + (-0.05 + (-dy / d) * wave) * k;
      Y[i] += vy + (0.17 + (dx / d) * wave) * k;
    }
    // keep every segment its length (follow the leader)
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < N; i++) {
        const dx = X[i] - X[i - 1], dy = Y[i] - Y[i - 1];
        const d = Math.hypot(dx, dy) || 1;
        const f = (d - L) / d;
        X[i] -= dx * f; Y[i] -= dy * f;
        // flesh does not fold: two links apart must stay apart
        if (i > 1) {
          const ex = X[i] - X[i - 2], ey = Y[i] - Y[i - 2];
          const e = Math.hypot(ex, ey) || 1;
          if (e < L * 1.55) { const g = (L * 1.55 - e) / e * 0.5; X[i] += ex * g; Y[i] += ey * g; }
        }
      }
    }
    this.draw();
    this.flush(prev, this.box);
    this.drawn = true;
  }

  draw() {
    const pb = this.pb, cp = this.cp, N = this.N;
    this.clearBox();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const R = new Float32Array(N), A = new Float32Array(N), PX = new Float32Array(N), PY = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      R[i] = lerp(1.8, 6.4, smooth(clamp(u / 0.4))) * (1 - 0.55 * smooth(clamp((u - 0.7) / 0.3)));
      A[i] = 1 - smooth(clamp((u - 0.68) / 0.32));
      PX[i] = this.x[i] / cp; PY[i] = this.y[i] / cp;
      x0 = Math.min(x0, PX[i] - 11); x1 = Math.max(x1, PX[i] + 11);
      y0 = Math.min(y0, PY[i] - 11); y1 = Math.max(y1, PY[i] + 11);
    }
    // the claw also lives in the canvas when there is no OS cursor (capture)
    const cx = this.ctx.input.cx / cp, cy = this.ctx.input.cy / cp;
    x0 = Math.min(x0, cx - 2); y0 = Math.min(y0, cy - 2);
    // a dark halo, a red rim, then the banded black body, back to front
    for (let i = N - 1; i >= 0; i--) pb.disc(Math.round(PX[i]), Math.round(PY[i]), R[i] + 2, C.void, A[i] * 0.85);
    for (let i = N - 1; i >= 0; i--) pb.disc(Math.round(PX[i]), Math.round(PY[i]), R[i] + 1, i % 2 ? C.blood3 : C.blood2, A[i]);
    for (let i = N - 1; i >= 0; i--) pb.disc(Math.round(PX[i]), Math.round(PY[i]), R[i], i % 4 < 2 ? C.ink : C.blood0, A[i]);
    // a ridge of blood along the top, suckers along the belly
    for (let i = 1; i < N; i++) {
      const dx = PX[i] - PX[i - 1], dy = PY[i] - PY[i - 1];
      const d = Math.hypot(dx, dy) || 1;
      let nx = -dy / d, ny = dx / d;
      if (ny > 0) { nx = -nx; ny = -ny; }     // n points up: the lit side
      const r = R[i];
      if (r > 1.6) {
        pb.dset(Math.round(PX[i] + nx * r * 0.5), Math.round(PY[i] + ny * r * 0.5), i % 2 ? C.neon : C.blood3, A[i]);
        pb.dset(Math.round(PX[i] + nx * r * 0.25), Math.round(PY[i] + ny * r * 0.25), C.blood1, A[i]);
      }
      if (i % 3 === 0 && r > 2.2) {
        const sx = Math.round(PX[i] - nx * r * 0.55), sy = Math.round(PY[i] - ny * r * 0.55);
        pb.disc(sx, sy, r > 4 ? 1 : 0.6, C.blood2, A[i]);
        pb.dset(sx, sy, C.neon2, A[i]);
      }
      if (i % 6 === 3 && r > 2.4) {
        // a ring of red flesh around the arm
        for (let s = -1; s <= 1; s++) pb.dset(Math.round(PX[i] + nx * s * r * 0.8), Math.round(PY[i] + ny * s * r * 0.8), C.blood2, A[i]);
      }
    }
    if (this.ctx.app.capture) {
      // no OS cursor in captures: paint the claw at the same 3px scale
      const s = Math.max(1, Math.round(3 / cp));
      CLAW.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') pb.rect(Math.round(cx) + x * s, Math.round(cy) + y * s, s, s, CLAW_PX[ch]); }));
      x1 = Math.max(x1, cx + 11 * s); y1 = Math.max(y1, cy + 11 * s);
    }
    this.box = {
      x0: clamp(Math.floor(x0), 0, pb.w), y0: clamp(Math.floor(y0), 0, pb.h),
      x1: clamp(Math.ceil(x1 + 12), 0, pb.w), y1: clamp(Math.ceil(y1 + 12), 0, pb.h),
    };
  }

  // upload only the union of where the arm was and where it is
  flush(a, b) {
    const u = a && b ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : a || b;
    if (!u || u.x1 <= u.x0 || u.y1 <= u.y0) return;
    this.g.putImageData(this.img, 0, 0, u.x0, u.y0, u.x1 - u.x0, u.y1 - u.y0);
  }
}
