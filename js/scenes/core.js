// Scene 3 - the core. A voxel coin rises out of the throat, beating like a
// heart; a chain of blocks orbits it, fed by packets of light.
import { C } from '../palette.js';
import { clamp, range, band, lerp, rng, TAU, hash1, smooth, easeOut, easeIn } from '../util.js';
import { STORY } from '../director.js';
import { drawText } from '../text.js';

const COIN = [
  '.....##..##.....',
  '.....##..##.....',
  '.##########.....',
  '.###########....',
  '..###....####...',
  '..###.....###...',
  '..###.....###...',
  '..###....####...',
  '..##########....',
  '..###########...',
  '..###.....####..',
  '..###......###..',
  '..###......###..',
  '..###......###..',
  '..###.....####..',
  '.############...',
  '.###########....',
  '.....##..##.....',
  '.....##..##.....',
];
const CW = COIN[0].length, CH = COIN.length;
const CELLS = [];
for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (COIN[y][x] === '#') CELLS.push(x, y);
const lit = (x, y) => x >= 0 && y >= 0 && x < CW && y < CH && COIN[y][x] === '#';

// heartbeat: lub-dub every 1.15s
export function heartbeat(t) {
  const p = (t % 1.15) / 1.15;
  const g = (c, w) => Math.exp(-((p - c) * (p - c)) / (w * w));
  return clamp(g(0.04, 0.035) + 0.65 * g(0.2, 0.045));
}

export class Core {
  constructor(ctx) {
    this.ctx = ctx;
    this.beat = 0;
    this.spin = 0;
    this.spinV = 1.1;
    this.rings = [];
    this.lastBeatPhase = 0;
    this.flow = [];
    this.packets = [];
    this.bbox = { x: 0, y: 0, w: 0, h: 0, vis: 0 };
    this.build();
  }

  build() {
    const r = rng(2009);
    // nodes on three tilted orbits - the chain around the coin
    this.nodes = [];
    for (let i = 0; i < 30; i++) {
      const orbit = i % 3;
      const a = (i / 30) * TAU * 3 + r() * 0.5;
      const rad = 1.0 + orbit * 0.22 + r() * 0.08;
      const tilt = [0.35, -0.55, 0.9][orbit];
      this.nodes.push({
        a, rad, tilt, orbit, y0: (r() - 0.5) * 0.25, size: r() < 0.25 ? 3 : 2,
        sx: 0, sy: 0, sz: 0, ox: 0, oy: 0, hot: 0, id: hash1(i * 31) * 0xffffff | 0,
      });
    }
    // links: each node to its two nearest neighbours on the same orbit + a few cross links
    this.links = [];
    const n = this.nodes.length;
    for (let i = 0; i < n; i++) this.links.push([i, (i + 3) % n]);   // the chain along each orbit
    for (let i = 0; i < n; i += 5) this.links.push([i, (i + 1) % n]); // a few bridges between orbits
    for (const k of [0, 7, 14, 22]) this.links.push([-1, k]);         // spokes from the coin
    for (let i = 0; i < 120; i++) this.flow.push({ a: r() * TAU, r: r(), v: 0.4 + r() * 0.8, s: r() });
  }

  resize(w, h) { this.w = w; this.h = h; }

  frame(S, dt) {
    const { F, app, input } = this.ctx;
    const s = S.s;
    const vis = S.w.core;
    this.bbox.vis = 0;
    if (vis <= 0.01) return;
    const w = this.w, h = this.h;
    const t = S.time;
    const rise = range(s, STORY.core - 0.35, STORY.core + 0.8);
    const net = range(s, STORY.core + 0.3, STORY.core + 1.25);
    const leave = range(s, STORY.ledger - 0.7, STORY.ledger + 0.2);

    // heart
    this.beat = app.reduced ? 0.3 : heartbeat(t);
    const phase = (t % 1.15) / 1.15;
    if (phase < this.lastBeatPhase && rise > 0.5 && !app.reduced) {
      this.rings.push({ r: 0, life: 1 });
      this.ctx.sound.event('beat', 0);
    }
    if (phase > 0.18 && this.lastBeatPhase <= 0.18 && rise > 0.5 && !app.reduced) this.rings.push({ r: 0, life: 0.7 });
    this.lastBeatPhase = phase;

    const egg = this.ctx.egg;
    const target = 1.1 + (egg ? egg.count * 0.9 : 0) + (egg && egg.active ? 14 : 0);
    this.spinV += (target - this.spinV) * (1 - Math.exp(-dt * 2));
    this.spin += dt * this.spinV * (app.reduced ? 0.15 : 1);

    const cx = w / 2;
    const cy = h * (S.portrait ? 0.43 : 0.47) - leave * h * 0.18;
    const unit = Math.max(2, Math.floor((Math.min(h * 0.44, w * 0.62) / CH) * lerp(0.25, 1, easeOut(rise)) * (1 + this.beat * 0.035) * (1 - leave * 0.55)));
    S.core[0] = cx / w;
    S.core[1] = 1 - cy / h;
    S.core[2] = (unit * CH) / h * 0.55;
    S.core[3] = S.core[3] * (0.75 + this.beat * 0.5);

    this.drawRings(F, cx, cy, unit, dt, vis);
    this.drawFlow(F, cx, cy, unit, dt, vis * rise, t);
    if (net > 0) this.drawNetwork(F, S, cx, cy, unit, net, leave, dt, input);
    this.drawCoin(F, cx, cy, unit, vis * clamp(rise * 1.5), leave);

    // hit box for the easter egg
    this.bbox = { x: cx - (CW * unit) / 2, y: cy - (CH * unit) / 2, w: CW * unit, h: CH * unit, vis: rise > 0.8 && leave < 0.3 ? 1 : 0 };
  }

  // --------------------------------------------------------------- coin
  drawCoin(F, cx, cy, u, alpha, leave) {
    if (alpha <= 0) return;
    const ang = this.spin;
    const c = Math.cos(ang), sn = Math.sin(ang);
    const depth = u * 3;
    const slices = Math.max(2, Math.ceil(Math.abs(sn) * depth) + 1);
    const front = c >= 0 ? 1 : -1;
    const fw = Math.max(1, Math.round(Math.abs(c) * u));
    const beat = this.beat;
    const glow = beat > 0.55;
    // a void outline so the coin cuts out of the glow
    for (let k = 0; k < slices; k += Math.max(1, slices - 1)) {
      const zf = slices === 1 ? 0 : k / (slices - 1);
      const z = (zf - 0.5) * depth * -front;
      for (let i = 0; i < CELLS.length; i += 2) {
        const lx = (CELLS[i] - CW / 2) * u;
        const x = Math.round(cx + lx * c + z * sn);
        const y = Math.round(cy + (CELLS[i + 1] - CH / 2) * u);
        F.drect(x - 1, y - 1, fw + 2, u + 2, C.void, alpha);
      }
    }
    // sides: back slices first
    for (let k = 0; k < slices; k++) {
      const zf = slices === 1 ? 0 : k / (slices - 1);
      const z = (zf - 0.5) * depth * -front;
      const isFront = k === slices - 1;
      for (let i = 0; i < CELLS.length; i += 2) {
        const gx = CELLS[i], gy = CELLS[i + 1];
        const lx = (gx - CW / 2) * u;
        const x = Math.round(cx + lx * c + z * sn);
        const y = Math.round(cy + (gy - CH / 2) * u);
        let col;
        if (isFront) {
          const top = !lit(gx, gy - 1);
          const edge = !lit(gx - 1, gy) || !lit(gx + 1, gy) || !lit(gx, gy + 1);
          col = top ? C.neon2 : edge ? (glow ? C.neon2 : C.neon) : Math.abs(c) > 0.55 ? (glow ? C.neon : C.blood3) : C.blood2;
          if (!top && !edge && ((gx + gy) & 3) === 0 && Math.abs(c) > 0.4) col = glow ? C.neon2 : C.neon;
        } else {
          // side walls: lit by the throat below and the beat
          col = sn * front > 0 ? (k > slices * 0.5 ? C.blood1 : C.bruise) : (k > slices * 0.5 ? C.bruise2 : C.blood1);
        }
        if (alpha < 1) F.drect(x, y, fw, u, col, alpha); else F.rect(x, y, fw, u, col);
      }
    }
    // a halo of pixels around the coin on the beat
    if (beat > 0.3 && alpha > 0.5) {
      const R = (CH * u) / 2 + 4 + beat * 4;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU + this.spin * 0.2;
        if (hash1(i + ((this.spin * 3) | 0) * 17) < 0.5) continue;
        F.dset(Math.round(cx + Math.cos(a) * R * 0.8), Math.round(cy + Math.sin(a) * R), C.neon, beat);
      }
    }
  }

  drawRings(F, cx, cy, u, dt, vis) {
    const maxR = Math.hypot(this.w, this.h) * 0.6;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += dt * (90 + r.r * 0.9);
      const a = (1 - r.r / maxR) * r.life * vis;
      if (a <= 0.02) { this.rings.splice(i, 1); continue; }
      const R = (CH * u) / 2 + r.r;
      F.ring(cx, cy, R, r.life > 0.8 ? C.neon : C.bruise2, a);
      F.ring(cx, cy, R - 1, C.blood1, a * 0.6);
    }
  }

  // energy pouring out of the coin along the vortex
  drawFlow(F, cx, cy, u, dt, a, t) {
    if (a <= 0.02) return;
    const R0 = (CH * u) / 2;
    const maxR = Math.hypot(this.w, this.h) * 0.55;
    for (const p of this.flow) {
      p.r += dt * p.v * (0.35 + this.beat * 0.9);
      if (p.r > 1) { p.r = 0; p.a = Math.random() * TAU; }
      const rr = R0 + p.r * (maxR - R0);
      const ang = p.a + p.r * 1.6 + t * 0.15;
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr * 0.92;
      const x2 = cx + Math.cos(ang - 0.05) * (rr - 5), y2 = cy + Math.sin(ang - 0.05) * (rr - 5) * 0.92;
      const col = p.r < 0.2 ? C.neon2 : p.r < 0.45 ? C.neon : p.s < 0.5 ? C.bruise2 : C.violet;
      F.line(Math.round(x2), Math.round(y2), Math.round(x), Math.round(y), col, a * (1 - p.r * 0.85));
    }
  }

  // ------------------------------------------------------------ network
  drawNetwork(F, S, cx, cy, u, net, leave, dt, input) {
    const w = this.w, h = this.h;
    const t = S.time;
    const R = Math.min(w, h) * (S.portrait ? 0.36 : 0.34);
    const D = 2.6;
    const mx = input.sx * w, my = input.sy * h;
    const ma = input.activity;
    const rot = t * 0.12;
    const grow = easeOut(net);
    // project nodes
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      const a = nd.a + rot * (1 + nd.orbit * 0.25);
      let x = Math.cos(a) * nd.rad, z = Math.sin(a) * nd.rad, y = nd.y0;
      // tilt the orbit
      const ct = Math.cos(nd.tilt), st = Math.sin(nd.tilt);
      const y2 = y * ct - z * st, z2 = y * st + z * ct;
      const k = D / (D + z2);
      let sx = cx + x * R * k * grow;
      let sy = cy + y2 * R * k * 0.62 * grow;
      // the ledger is coming: nodes fall into columns
      if (leave > 0) {
        const col = (i % 15) / 14;
        const tx = w * (0.08 + col * 0.84), ty = h * (0.1 + (i / this.nodes.length) * 0.3);
        sx = lerp(sx, tx, smooth(leave)); sy = lerp(sy, ty, smooth(leave));
      }
      // the hand pulls nearby blocks
      const dx = mx - sx, dy = my - sy;
      const d2 = dx * dx + dy * dy;
      const pull = ma > 0.05 ? Math.exp(-d2 / (R * R * 0.08)) * ma : 0;
      nd.ox += (dx * pull * 0.35 - nd.ox) * (1 - Math.exp(-dt * 5));
      nd.oy += (dy * pull * 0.35 - nd.oy) * (1 - Math.exp(-dt * 5));
      nd.sx = sx + nd.ox; nd.sy = sy + nd.oy; nd.sz = z2; nd.k = k;
      nd.hot = Math.max(nd.hot - dt * 1.5, pull > 0.4 ? 1 : 0);
    }
    const alpha = net * (1 - leave * 0.6);
    // links
    for (const [i, j] of this.links) {
      const a = i < 0 ? { sx: cx, sy: cy, sz: 0 } : this.nodes[i];
      const b = this.nodes[j];
      const far = (a.sz + b.sz) * 0.5 > 0.2;
      const hot = (i >= 0 && a.hot > 0.3) || b.hot > 0.3;
      F.line(Math.round(a.sx), Math.round(a.sy), Math.round(b.sx), Math.round(b.sy), hot ? C.bruise2 : far ? C.night : C.plum, alpha * (far ? 0.6 : 1));
    }
    // the cursor joins the chain while it is close
    if (ma > 0.2) {
      let best = 0;
      for (const nd of this.nodes) {
        const d = Math.hypot(nd.sx - mx, nd.sy - my);
        if (d < R * 0.45 && best < 3) { best++; F.line(Math.round(mx), Math.round(my), Math.round(nd.sx), Math.round(nd.sy), C.blood2, alpha * ma * 0.8); }
      }
    }
    // packets riding the links outward
    if (Math.random() < dt * 14 * net) {
      const L = this.links[(Math.random() * this.links.length) | 0];
      this.packets.push({ L, p: 0, v: 0.6 + Math.random() * 0.9 });
    }
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const pk = this.packets[i];
      pk.p += dt * pk.v;
      if (pk.p >= 1) {
        const n = this.nodes[pk.L[1]];
        n.hot = Math.max(n.hot, 0.6);
        this.packets.splice(i, 1);
        continue;
      }
      const a = pk.L[0] < 0 ? { sx: cx, sy: cy } : this.nodes[pk.L[0]];
      const b = this.nodes[pk.L[1]];
      const x = lerp(a.sx, b.sx, pk.p), y = lerp(a.sy, b.sy, pk.p);
      F.drect(Math.round(x), Math.round(y), 2, 2, C.neon2, alpha);
      F.dset(Math.round(lerp(a.sx, b.sx, pk.p - 0.04)), Math.round(lerp(a.sy, b.sy, pk.p - 0.04)), C.neon, alpha);
    }
    // the blocks themselves, far ones first
    const order = this.nodes.slice().sort((p, q) => q.sz - p.sz);
    for (const nd of order) {
      const sz = Math.max(3, Math.round((nd.size * 2 + 1) * nd.k));
      const x = Math.round(nd.sx - sz / 2), y = Math.round(nd.sy - sz / 2);
      const far = nd.sz > 0.2;
      const body = nd.hot > 0.5 ? C.blood2 : far ? C.night : C.dusk;
      const edge = nd.hot > 0.5 ? C.neon2 : far ? C.plum : C.violet;
      F.drect(x, y, sz, sz, body, alpha);
      if (alpha >= 0.99) { F.frame(x, y, sz, sz, edge); F.set(x + 1, y + 1, nd.hot > 0.5 ? C.neon2 : C.violet2); }
      if (nd.hot > 0.8 && sz >= 5 && alpha > 0.9) drawText(F, (nd.id & 0xfff).toString(16).padStart(3, '0'), x + sz + 2, y, C.blood3);
    }
  }
}
