// Scylla in three dimensions. Real geometry rebuilt every frame and drawn by
// the WebGL mesh pass: tube necks with spines and scuted bellies, lofted
// skulls with hinged jaws, horns, teeth and burning eyes, a breathing body
// in the lair and tentacle feet hanging into the sea. Behaviour as before:
// she watches the reader's light, lunges at it, roars, and goes for the ship.
import { C } from '../palette.js';
import { clamp, lerp, smooth, TAU, rng, hash1 } from '../util.js';

const P = { x: 0, y: 0, k: 0, z: 0 };
const HL = 3.3;                // head length, world units
const NECK_R = 34, NECK_S = 10;
const LEG_R = 14, LEG_S = 6;
const SPINES = 7;

const COL = {
  hide: [0.13, 0.08, 0.17], belly: [0.26, 0.045, 0.10], scute: [0.15, 0.03, 0.06],
  horn: [0.17, 0.11, 0.21], tip: [0.34, 0.17, 0.38], tooth: [0.66, 0.40, 0.74],
  mouth: [0.30, 0.035, 0.09], frill: [0.22, 0.04, 0.10], spine: [0.14, 0.085, 0.18],
  eye: [0.92, 0.13, 0.31], shut: [0.06, 0.03, 0.06], body: [0.09, 0.055, 0.12],
};

// head profile: [x, half-width, half-height, centre y] (x 0 = neck, 1 = snout)
const SKULL = [[-0.10, 0.22, 0.24, 0.04], [0.0, 0.27, 0.29, 0.08], [0.12, 0.29, 0.31, 0.11], [0.26, 0.28, 0.28, 0.12], [0.40, 0.22, 0.21, 0.09], [0.55, 0.18, 0.16, 0.06], [0.70, 0.15, 0.13, 0.04], [0.83, 0.12, 0.10, 0.02], [0.93, 0.08, 0.07, 0.01], [0.99, 0.03, 0.03, 0.0]];
const JAWS = [[0.06, 0.24, 0.12, -0.16], [0.25, 0.22, 0.11, -0.19], [0.45, 0.18, 0.09, -0.18], [0.65, 0.14, 0.07, -0.15], [0.80, 0.11, 0.05, -0.12], [0.91, 0.07, 0.04, -0.10], [0.97, 0.03, 0.02, -0.09]];
const HINGE = [0.10, -0.10];
const LOFT_S = 10;

// ---------------------------------------------------------------- geometry
class Geo {
  constructor(maxV, maxI) {
    this.verts = new Float32Array(maxV * 10);
    this.index = new Uint16Array(maxI);
    this.vcount = 0; this.icount = 0; this.indexKey = 0;
  }
  alloc(n) { const b = this.vcount; this.vcount += n; return b; }
  tri(a, b, c) { const i = this.icount; this.index[i] = a; this.index[i + 1] = b; this.index[i + 2] = c; this.icount += 3; }
  tube(R, S) {
    const b = this.alloc(R * S);
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < S; j++) {
      const a = b + i * S + j, c = b + i * S + (j + 1) % S;
      this.tri(a, c, a + S); this.tri(c, c + S, a + S);
    }
    return b;
  }
  loft(R, S) { // tube + two caps (cap centres are the last two vertices)
    const b = this.tube(R, S);
    const c0 = this.alloc(1), c1 = this.alloc(1);
    for (let j = 0; j < S; j++) { this.tri(c0, b + (j + 1) % S, b + j); this.tri(c1, b + (R - 1) * S + j, b + (R - 1) * S + (j + 1) % S); }
    return b;
  }
  pyramid() { const b = this.alloc(4); this.tri(b, b + 1, b + 3); this.tri(b + 1, b + 2, b + 3); this.tri(b + 2, b, b + 3); this.tri(b, b + 2, b + 1); return b; }
  octa() {
    const b = this.alloc(6);
    const F = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
    for (const f of F) this.tri(b + f[0], b + f[1], b + f[2]);
    return b;
  }
  strip(n) { const b = this.alloc(n * 2); for (let i = 0; i < n - 1; i++) { const a = b + i * 2; this.tri(a, a + 2, a + 1); this.tri(a + 1, a + 2, a + 3); } return b; }
  set(i, x, y, z, nx, ny, nz, c, e = 0) {
    const o = i * 10, v = this.verts;
    v[o] = x; v[o + 1] = y; v[o + 2] = z; v[o + 3] = nx; v[o + 4] = ny; v[o + 5] = nz;
    v[o + 6] = c[0]; v[o + 7] = c[1]; v[o + 8] = c[2]; v[o + 9] = e;
  }
}

// small vector helpers on plain arrays
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// a local head mesh: positions, normals, colours, and which parts hinge
function buildHeadLocal() {
  const L = { p: [], n: [], c: [], e: [], jaw: [], parts: {} };
  const push = (x, y, z, nx, ny, nz, c, e = 0, jaw = 0) => { L.p.push(x, y, z); L.n.push(nx, ny, nz); L.c.push(c); L.e.push(e); L.jaw.push(jaw); };
  const loft = (secs, col, jaw) => {
    const start = L.e.length;
    for (const [x, hw, hh, cy] of secs) for (let j = 0; j < LOFT_S; j++) {
      const a = (j / LOFT_S) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const nn = nrm([0, sa / hh, ca / hw]);
      push(x, cy + sa * hh, ca * hw, nn[0] * 0.8 + (x > 0.9 ? 0.4 : 0), nn[1], nn[2], col, 0, jaw);
    }
    const f = secs[0], l = secs[secs.length - 1];
    push(f[0], f[3], 0, -1, 0, 0, col, 0, jaw);
    push(l[0], l[3], 0, 1, 0, 0, col, 0, jaw);
    return start;
  };
  L.parts.skull = loft(SKULL, COL.hide, 0);
  L.parts.jaw = loft(JAWS, COL.hide, 1);
  // horns: two big, two small, sweeping back
  const horn = (path, r0, side) => {
    const start = L.e.length;
    let nPrev = [0, 0, 1];
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const t = nrm(sub(b, a));
      let n0 = nrm(sub(nPrev, t.map((v) => v * dot(nPrev, t))));
      const b0 = cross(t, n0);
      nPrev = n0;
      const r = r0 * (1 - i / (path.length - 1)) + 0.004;
      for (let j = 0; j < 5; j++) {
        const ang = (j / 5) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
        const d = [n0[0] * ca + b0[0] * sa, n0[1] * ca + b0[1] * sa, n0[2] * ca + b0[2] * sa];
        const p = path[i];
        push(p[0] + d[0] * r, p[1] + d[1] * r, (p[2] + d[2] * r) * side, d[0], d[1], d[2] * side, i >= path.length - 2 ? COL.tip : COL.horn);
      }
    }
    return start;
  };
  const big = [[0.18, 0.36, 0.14], [0.04, 0.52, 0.19], [-0.16, 0.64, 0.24], [-0.40, 0.70, 0.28], [-0.60, 0.66, 0.30]];
  const small = [[0.0, 0.28, 0.2], [-0.16, 0.36, 0.28], [-0.36, 0.37, 0.34]];
  L.parts.horns = [horn(big, 0.09, 1), horn(big, 0.09, -1), horn(small, 0.06, 1), horn(small, 0.06, -1)];
  // teeth: upper rows point down, lower rows (hinged) point up
  const tooth = (x, y, z, dy, jaw) => {
    const start = L.e.length;
    const s = 0.028;
    push(x - s, y, z - s * 0.6, 0, 1, 0, COL.tooth, 0, jaw);
    push(x + s, y, z - s * 0.6, 0, 1, 0, COL.tooth, 0, jaw);
    push(x, y, z + s, 0, 1, 0, COL.tooth, 0, jaw);
    push(x + 0.01, y + dy, z, 0, Math.sign(dy), 0, COL.tooth, 0.25, jaw);
    return start;
  };
  L.parts.teeth = [];
  for (let x = 0.32; x < 0.93; x += 0.085) {
    const hw = lerp(0.22, 0.09, (x - 0.3) / 0.65);
    const by = lerp(-0.12, -0.075, (x - 0.3) / 0.65);
    for (const side of [1, -1]) L.parts.teeth.push(tooth(x, by, hw * 0.8 * side, x > 0.85 ? -0.11 : -0.07, 0));
  }
  L.parts.lower = [];
  for (let x = 0.38; x < 0.9; x += 0.1) {
    const hw = lerp(0.2, 0.08, (x - 0.35) / 0.55);
    for (const side of [1, -1]) L.parts.lower.push(tooth(x, -0.06, hw * 0.8 * side, 0.07, 1));
  }
  // eyes
  L.parts.eyes = [];
  for (const side of [1, -1]) {
    const start = L.e.length;
    const cx = 0.30, cy = 0.17, cz = 0.25 * side, r = 0.055;
    for (const [dx, dy, dz] of [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r * side], [0, 0, -r * side]]) push(cx + dx, cy + dy, cz + dz, dx / r, dy / r, dz / r, COL.eye, 1);
    L.parts.eyes.push(start);
  }
  // frills behind the jaw, three blades a side
  L.parts.frill = [];
  for (const side of [1, -1]) for (const [tx, ty, tz] of [[-0.28, 0.12, 0.46], [-0.34, -0.04, 0.52], [-0.24, -0.18, 0.44]]) {
    const start = L.e.length;
    push(0.02, 0.04, 0.24 * side, 0, 0, side, COL.frill);
    push(-0.02, -0.14, 0.22 * side, 0, 0, side, COL.frill);
    push(tx, ty, tz * side, 0, 0.3, side, COL.frill);
    L.parts.frill.push(start);
  }
  L.count = L.e.length;
  L.p = Float32Array.from(L.p); L.n = Float32Array.from(L.n); L.e = Float32Array.from(L.e); L.jaw = Uint8Array.from(L.jaw);
  return L;
}

export class Scylla3D {
  constructor(strait) {
    this.st = strait;
    this.geo = new Geo(12000, 48000);
    this.local = buildHeadLocal();
    this.necks = [];
    this.legs = [];
    this.eyes = [];
    this.drips = [];
    this.roarT = 0;
    this.lastFlash = 0;
    this.ready = false;
  }

  build(L, cx, cy, cz) {
    const r = rng(77031);
    this.cx = cx; this.cy = cy; this.cz = cz;
    const A = [cx + 0.4, cy - 0.3, cz - 0.6];
    const heads = [
      [0.4, 12.2, -3.5], [-3.0, 9.8, -2.0], [4.4, 9.6, -5.0],
      [6.8, 5.6, -7.0], [7.8, 2.4, -9.0], [-5.0, 6.8, -1.4],
    ];
    const g = this.geo;
    g.vcount = 0; g.icount = 0; g.indexKey++;
    this.necks = heads.map((hd, i) => {
      const sx = Math.max(L, 0.7);
      const n = {
        i, A: [A[0] + (i - 2.5) * 0.22, A[1] + (r() - 0.5) * 0.5, A[2]],
        H: [A[0] + hd[0] * sx, A[1] + hd[1], A[2] + hd[2]],
        c1: [A[0] + hd[0] * 0.15 * L + (r() - 0.5) * 2.2, A[1] + 3 + r() * 2, A[2] - 0.5],
        c2: [A[0] + hd[0] * 0.8 * L - Math.sign(hd[0] || 1) * 1.5, A[1] + hd[1] * 0.55, A[2] + hd[2] * 0.5],
        Hc: [0, 0, 0], f1: 0.3 + r() * 0.3, f2: 0.45 + r() * 0.35, ph: r() * TAU,
        jaw: 0.1, jawGoal: 0.1, jawT: r() * 4, look: 0, lunge: 0, lungeT: 0, cool: r() * 2, lx: 0, ly: 0,
        thick: 0.9 + r() * 0.15,
        line: new Float32Array(NECK_R * 3), rad: new Float32Array(NECK_R),
      };
      n.vTube = g.tube(NECK_R, NECK_S);
      n.vSpines = [];
      for (let k = 0; k < SPINES; k++) n.vSpines.push(g.pyramid());
      // head topology mirrors the local mesh
      n.vHead = g.alloc(0);
      this.headTopology(g, n);
      n.vMouth = g.strip(9);
      return n;
    });
    this.legs = [];
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      this.legs.push({
        x: cx + (u - 0.5) * 5.2 * Math.max(L, 0.8), y: cy - 1.0 - Math.sin(u * Math.PI) * 0.4, z: cz - 0.7 - r() * 0.8,
        len: 3.4 + r() * 1.8, ph: r() * TAU, sp: 0.5 + r() * 0.5, curl: (u - 0.5) * 2.6 + (r() - 0.5),
        v: g.tube(LEG_R, LEG_S),
      });
    }
    // body: a lumpy ellipsoid filling the cave mouth
    this.bodyLat = 9; this.bodyLon = 14;
    this.vBody = g.alloc(this.bodyLat * this.bodyLon);
    for (let i = 0; i < this.bodyLat - 1; i++) for (let j = 0; j < this.bodyLon; j++) {
      const a = this.vBody + i * this.bodyLon + j, b = this.vBody + i * this.bodyLon + (j + 1) % this.bodyLon;
      g.tri(a, b, a + this.bodyLon); g.tri(b, b + this.bodyLon, a + this.bodyLon);
    }
    this.eyes = [];
    for (let i = 0; i < 6; i++) this.eyes.push({ u: (r() - 0.5) * 1.3, v: -0.15 - r() * 0.5, ph: r() * 10, sp: 0.2 + r() * 0.4, vtx: [g.octa(), g.octa()] });
    this.ready = true;
  }

  headTopology(g, n) {
    const L = this.local;
    const base = g.alloc(L.count);
    n.vHead = base;
    const loftIdx = (start, R) => {
      const b = base + start;
      for (let i = 0; i < R - 1; i++) for (let j = 0; j < LOFT_S; j++) {
        const a = b + i * LOFT_S + j, c = b + i * LOFT_S + (j + 1) % LOFT_S;
        g.tri(a, c, a + LOFT_S); g.tri(c, c + LOFT_S, a + LOFT_S);
      }
      const c0 = b + R * LOFT_S, c1 = c0 + 1;
      for (let j = 0; j < LOFT_S; j++) { g.tri(c0, b + (j + 1) % LOFT_S, b + j); g.tri(c1, b + (R - 1) * LOFT_S + j, b + (R - 1) * LOFT_S + (j + 1) % LOFT_S); }
    };
    loftIdx(L.parts.skull, SKULL.length);
    loftIdx(L.parts.jaw, JAWS.length);
    for (const h of L.parts.horns) {
      const b = base + h, R = h === L.parts.horns[0] || h === L.parts.horns[1] ? 5 : 3;
      for (let i = 0; i < R - 1; i++) for (let j = 0; j < 5; j++) {
        const a = b + i * 5 + j, c = b + i * 5 + (j + 1) % 5;
        g.tri(a, c, a + 5); g.tri(c, c + 5, a + 5);
      }
    }
    for (const t of [...L.parts.teeth, ...L.parts.lower]) {
      const b = base + t;
      g.tri(b, b + 1, b + 3); g.tri(b + 1, b + 2, b + 3); g.tri(b + 2, b, b + 3); g.tri(b, b + 2, b + 1);
    }
    const F = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
    for (const e of L.parts.eyes) for (const f of F) g.tri(base + e + f[0], base + e + f[1], base + e + f[2]);
    for (const f of L.parts.frill) g.tri(base + f, base + f + 1, base + f + 2);
  }

  roar(power = 1) {
    if (this.roarT > 0.3) return;
    this.roarT = 1.3 * power;
    this.st.ctx.sound.event('roar', 0.2);
    this.st.ctx.director.impulse(0.3, 1.6, 0.1);
  }

  bez(n, t, o) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    for (let k = 0; k < 3; k++) o[k] = a * n.A[k] + b * n.c1[k] + c * n.c2[k] + d * n.Hc[k];
  }

  // ----------------------------------------------------------------- frame
  update(S, W2, dt) {
    const st = this.st, cam = st.cam, t = st.time;
    const g = this.geo;
    const input = st.ctx.input;
    const w = st.w, h = st.h;
    const mx = input.sx * w, my = input.sy * h, ma = input.present || input.touch ? input.activity : 0;
    const flash = st.flash;
    if (flash > 0.8 && this.lastFlash <= 0.8) this.roar(0.8);
    this.lastFlash = flash;
    this.roarT = Math.max(0, this.roarT - dt);
    const roar = smooth(clamp(this.roarT / 0.6));
    for (const tp of input.taps) {
      const T = st.targets.scylla, x = tp.x * w, y = tp.y * h;
      if (T.vis && x > T.x - 10 && x < T.x + T.w + 10 && y > T.y - 10 && y < T.y + T.h + 30) this.roar(1);
    }
    const sw = st.shipWorld;
    const strike = sw && sw.vis ? Math.pow(clamp(Math.sin(clamp((S.s - 2.25) / 0.8) * Math.PI)), 1.5) : 0;
    const camPos = [cam.x, cam.y, cam.z];
    const o = [0, 0, 0];
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, seen = 0;

    for (const n of this.necks) {
      // behaviour (same temperament as before)
      n.jawT -= dt;
      if (n.jawT < 0) { n.jawT = 1.2 + Math.random() * 3.5; n.jawGoal = Math.random() < 0.45 ? 0.5 + Math.random() * 0.3 : 0.08; }
      n.cool = Math.max(0, n.cool - dt);
      n.Hc[0] = n.H[0] + Math.sin(t * n.f1 + n.ph) * 0.9 + Math.sin(t * 0.23 + n.ph * 2) * 0.5;
      n.Hc[1] = n.H[1] + Math.sin(t * n.f2 + n.ph * 1.7) * 0.6 + roar * (1.2 + n.i * 0.15);
      n.Hc[2] = n.H[2];
      n.Hc[0] -= roar * 0.8 * Math.sign(n.H[0] - n.A[0] || 1);
      if (n.i === 4 && strike > 0) {
        n.Hc[0] = lerp(n.Hc[0], sw.x, strike * 0.42);
        n.Hc[1] = lerp(n.Hc[1], 1.6, strike * 0.6);
        n.Hc[2] = lerp(n.Hc[2], sw.z + 3, strike * 0.42);
      }
      if (n.lunge > 0) { n.Hc[0] += n.lx * n.lunge; n.Hc[1] += n.ly * n.lunge; }

      // ---- neck centreline with a travelling wave, then a tube around it
      const line = n.line, rad = n.rad;
      for (let i = 0; i < NECK_R; i++) {
        const u = i / (NECK_R - 1);
        this.bez(n, u, o);
        const wv = Math.sin(u * 7 - t * 2.4 + n.ph) * 0.32 * Math.sin(Math.PI * u) * (1 - roar * 0.6);
        line[i * 3] = o[0] + wv; line[i * 3 + 1] = o[1]; line[i * 3 + 2] = o[2] + wv * 0.5;
        rad[i] = (lerp(0.8, 0.4, smooth(clamp(u / 0.75))) + 0.1 * Math.exp(-Math.pow((u - 0.9) * 10, 2))) * n.thick;
      }
      this.writeTube(n.vTube, line, rad, NECK_R, NECK_S, camPos, true, n);

      // ---- head frame: out over the strait, turning toward the light
      const e = NECK_R - 1;
      const O = [line[e * 3], line[e * 3 + 1], line[e * 3 + 2]];
      const back = [line[(e - 3) * 3], line[(e - 3) * 3 + 1], line[(e - 3) * 3 + 2]];
      let fwd = nrm(sub(O, back));
      const out = nrm([Math.sign(n.H[0] - n.A[0] || 1) * 0.8, -0.15, -0.6]);
      fwd = nrm([fwd[0] * 0.45 + out[0] * 0.55, fwd[1] * 0.45 + out[1] * 0.55, fwd[2] * 0.45 + out[2] * 0.55]);
      let hx = 0, hy = 0, k = 1;
      if (cam.project(O[0], O[1], O[2], P)) { hx = P.x; hy = P.y; k = P.k; }
      const dx = mx - hx, dy = my - hy, dist = Math.hypot(dx, dy);
      const want = ma > 0.15 && dist < w * 0.45 ? 1 : 0;
      n.look += ((want ? 0.65 : 0) - n.look) * (1 - Math.exp(-dt * 4));
      if (n.look > 0.01) {
        const target = nrm([dx / k, -dy / k, -1.2]);
        fwd = nrm([lerp(fwd[0], target[0], n.look), lerp(fwd[1], target[1], n.look), lerp(fwd[2], target[2], n.look)]);
      }
      const size = HL * k;
      if (!st.ctx.app.reduced && ma > 0.25 && dist < size * 2.2 && n.cool <= 0 && n.lunge <= 0) {
        n.lungeT = 0.55; n.cool = 1.6;
        n.lx = clamp(dx / k, -4, 4); n.ly = clamp(-dy / k, -4, 4);
        st.ctx.sound.event('snap', clamp(hx / w));
      }
      if (n.lungeT > 0) { n.lungeT -= dt; n.lunge = Math.sin(clamp(1 - n.lungeT / 0.55) * Math.PI); } else n.lunge = 0;
      const jawGoal = Math.max(n.jawGoal, roar * 0.95, n.lunge, n.i === 4 ? strike : 0, flash > 0.5 ? 0.8 : 0);
      n.jaw += (jawGoal - n.jaw) * (1 - Math.exp(-dt * (jawGoal > n.jaw ? 14 : 5)));
      this.writeHead(n, O, fwd, n.jaw, t, camPos, W2);

      minX = Math.min(minX, hx - size * 0.7); maxX = Math.max(maxX, hx + size * 0.7);
      minY = Math.min(minY, hy - size * 0.7); maxY = Math.max(maxY, hy + size * 0.7);
      seen++;
    }
    this.writeLegs(t, camPos);
    this.writeBody(t, camPos, W2);
    // drool falls in front
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      d.life -= dt; d.vy += 70 * dt; d.y += d.vy * dt;
      if (d.life <= 0 || d.y > h) { this.drips.splice(i, 1); continue; }
      W2.set(Math.round(d.x), Math.round(d.y), d.life > 1.1 ? C.neon : C.blood2);
    }
    const T = st.targets.scylla;
    T.vis = seen ? 1 : 0;
    T.x = minX; T.y = minY; T.w = maxX - minX; T.h = maxY - minY;
  }

  // ring vertices along a centreline, parallel-transported frames
  writeTube(base, line, rad, R, Sd, camPos, neck, n) {
    const g = this.geo;
    let N0 = null;
    for (let i = 0; i < R; i++) {
      const a = Math.max(0, i - 1), b = Math.min(R - 1, i + 1);
      const T = nrm([line[b * 3] - line[a * 3], line[b * 3 + 1] - line[a * 3 + 1], line[b * 3 + 2] - line[a * 3 + 2]]);
      if (!N0) { N0 = cross(T, [0, 0, 1]); if (Math.hypot(N0[0], N0[1], N0[2]) < 0.1) N0 = cross(T, [1, 0, 0]); }
      const d0 = dot(N0, T);
      N0 = nrm([N0[0] - T[0] * d0, N0[1] - T[1] * d0, N0[2] - T[2] * d0]);
      const B = cross(T, N0);
      const P0 = [line[i * 3], line[i * 3 + 1], line[i * 3 + 2]];
      // belly faces the reader and the sea; the back faces the sky
      const toCam = nrm(sub(camPos, P0));
      const bellyDir = nrm([toCam[0] * 0.7, toCam[1] * 0.7 - 0.7, toCam[2] * 0.7]);
      const r = rad[i];
      for (let j = 0; j < Sd; j++) {
        const ang = (j / Sd) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
        const d = [N0[0] * ca + B[0] * sa, N0[1] * ca + B[1] * sa, N0[2] * ca + B[2] * sa];
        let col = COL.hide;
        if (neck && dot(d, bellyDir) > 0.55) col = i % 3 === 0 ? COL.scute : COL.belly;
        g.set(base + i * Sd + j, P0[0] + d[0] * r, P0[1] + d[1] * r, P0[2] + d[2] * r, d[0], d[1], d[2], col);
      }
      // spines along the back
      if (neck && n) {
        const k = Math.floor((i - 3) / 4);
        if ((i - 3) % 4 === 0 && k >= 0 && k < SPINES) {
          const up = nrm([-bellyDir[0], -bellyDir[1], -bellyDir[2]]);
          const ud = dot(up, T);
          const dorsal = nrm([up[0] - T[0] * ud, up[1] - T[1] * ud, up[2] - T[2] * ud]);
          const side = cross(T, dorsal);
          const hgt = r * (1.1 - k * 0.08) + 0.15;
          const bx = P0[0] + dorsal[0] * r * 0.85, by = P0[1] + dorsal[1] * r * 0.85, bz = P0[2] + dorsal[2] * r * 0.85;
          const v = n.vSpines[k], s = r * 0.32;
          g.set(v, bx - T[0] * s - side[0] * s, by - T[1] * s - side[1] * s, bz - T[2] * s - side[2] * s, -T[0], -T[1], -T[2], COL.spine);
          g.set(v + 1, bx - T[0] * s + side[0] * s, by - T[1] * s + side[1] * s, bz - T[2] * s + side[2] * s, side[0], side[1], side[2], COL.spine);
          g.set(v + 2, bx + T[0] * s * 1.4, by + T[1] * s * 1.4, bz + T[2] * s * 1.4, T[0], T[1], T[2], COL.spine);
          g.set(v + 3, bx + dorsal[0] * hgt + T[0] * r * 0.5, by + dorsal[1] * hgt + T[1] * r * 0.5, bz + dorsal[2] * hgt + T[2] * r * 0.5, dorsal[0], dorsal[1], dorsal[2], COL.tip);
        }
      }
    }
  }

  writeHead(n, O, fwd, jaw, t, camPos, W2) {
    const g = this.geo, L = this.local;
    let up = [0, 1, 0];
    let right = cross(fwd, up);
    if (Math.hypot(right[0], right[1], right[2]) < 0.15) right = [0, 0, 1];
    right = nrm(right);
    up = cross(right, fwd);
    const a = jaw * 0.75, ca = Math.cos(a), sa = Math.sin(a);
    const blink = (t + n.ph) % 5.3 < 0.12;
    const base = n.vHead;
    const xf = (lx, ly, lz, isJaw, out) => {
      if (isJaw) { const ox = lx - HINGE[0], oy = ly - HINGE[1]; lx = HINGE[0] + ox * ca + oy * sa; ly = HINGE[1] - ox * sa + oy * ca; }
      out[0] = O[0] + (fwd[0] * lx + up[0] * ly + right[0] * lz) * HL;
      out[1] = O[1] + (fwd[1] * lx + up[1] * ly + right[1] * lz) * HL;
      out[2] = O[2] + (fwd[2] * lx + up[2] * ly + right[2] * lz) * HL;
      return out;
    };
    const q = [0, 0, 0], m = [0, 0, 0];
    for (let i = 0; i < L.count; i++) {
      const j = L.jaw[i];
      xf(L.p[i * 3], L.p[i * 3 + 1], L.p[i * 3 + 2], j, q);
      let nx = L.n[i * 3], ny = L.n[i * 3 + 1], nz = L.n[i * 3 + 2];
      if (j) { const t1 = nx * ca + ny * sa; ny = -nx * sa + ny * ca; nx = t1; }
      m[0] = fwd[0] * nx + up[0] * ny + right[0] * nz;
      m[1] = fwd[1] * nx + up[1] * ny + right[1] * nz;
      m[2] = fwd[2] * nx + up[2] * ny + right[2] * nz;
      let e = L.e[i], col = L.c[i];
      if (e >= 1 && blink) { col = COL.shut; e = 0; }
      g.set(base + i, q[0], q[1], q[2], m[0], m[1], m[2], col, e);
    }
    // the mouth: a red membrane between skull and jaw, a coal in the throat
    for (let s = 0; s < 9; s++) {
      const x = lerp(0.1, 0.95, s / 8);
      const yTop = lerp(-0.12, -0.07, s / 8), yBot = lerp(-0.05, -0.07, s / 8);
      xf(x, yTop, 0, 0, q); g.set(n.vMouth + s * 2, q[0], q[1], q[2], right[0], right[1], right[2], s < 3 && jaw > 0.3 ? [0.55, 0.06, 0.14] : COL.mouth, s < 2 && jaw > 0.3 ? 0.6 : 0);
      xf(x, yBot, 0, 1, q); g.set(n.vMouth + s * 2 + 1, q[0], q[1], q[2], right[0], right[1], right[2], COL.mouth);
    }
    // a pixel of glow around the eye that faces us, drool from open jaws
    const toCam = nrm(sub(camPos, O));
    const side = dot(right, toCam) > 0 ? 1 : -1;
    xf(0.30, 0.17, 0.28 * side, 0, q);
    if (!blink && this.st.cam.project(q[0], q[1], q[2], P)) {
      const ex = Math.round(P.x), ey = Math.round(P.y);
      W2.dset(ex - 1, ey, C.blood2, 0.55); W2.dset(ex + 1, ey, C.blood2, 0.55); W2.dset(ex, ey - 1, C.blood1, 0.55);
    }
    if (jaw > 0.45 && Math.random() < 0.04 && this.drips.length < 40) {
      xf(0.75, -0.18, 0, 1, q);
      if (this.st.cam.project(q[0], q[1], q[2], P)) this.drips.push({ x: P.x, y: P.y, vy: 6, life: 1.4 });
    }
  }

  writeLegs(t, camPos) {
    const line = new Float32Array(LEG_R * 3), rad = new Float32Array(LEG_R);
    for (const lg of this.legs) {
      for (let j = 0; j < LEG_R; j++) {
        const u = j / (LEG_R - 1);
        const sw = Math.sin(t * lg.sp + lg.ph + u * 3.6) * 0.7 * u + lg.curl * u * u * 0.8;
        line[j * 3] = lg.x + sw; line[j * 3 + 1] = Math.max(-0.6, lg.y - u * lg.len); line[j * 3 + 2] = lg.z - u * 0.4;
        rad[j] = lerp(0.42, 0.05, u);
      }
      this.writeTube(lg.v, line, rad, LEG_R, LEG_S, camPos, true, null);
    }
  }

  writeBody(t, camPos, W2) {
    const g = this.geo;
    const breathe = 1 + Math.sin(t * 0.8) * 0.035;
    const c = [this.cx, this.cy - 0.5, this.cz - 1.0];
    const rx = 2.5 * breathe, ry = 2.0 * breathe, rz = 1.3;
    for (let i = 0; i < this.bodyLat; i++) {
      const th = (i / (this.bodyLat - 1)) * Math.PI;
      for (let j = 0; j < this.bodyLon; j++) {
        const ph = (j / this.bodyLon) * TAU;
        const lump = 1 + 0.1 * Math.sin(ph * 3 + th * 2) * Math.sin(th * 3);
        const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
        const col = dy < -0.2 && dz < 0 ? COL.belly : COL.body;
        g.set(this.vBody + i * this.bodyLon + j, c[0] + dx * rx * lump, c[1] + dy * ry * lump, c[2] + dz * rz * lump, dx, dy, dz, col);
      }
    }
    // eyes in the dark of her waist
    for (const e of this.eyes) {
      const open = Math.sin(t * e.sp + e.ph) > -0.35 && (t * 1.7 + e.ph) % 4.1 > 0.15;
      const x0 = c[0] + e.u * rx, y0 = c[1] + e.v * ry, z0 = c[2] - rz * 0.92;
      const r = 0.07;
      e.vtx.forEach((v, s) => {
        const x = x0 + (s ? 0.22 : -0.22);
        const pts = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
        pts.forEach((p, q) => g.set(v + q, x + p[0], y0 + p[1], z0 + p[2], p[0] / r, p[1] / r, p[2] / r, open ? COL.eye : COL.shut, open ? 1 : 0));
      });
    }
  }
}
