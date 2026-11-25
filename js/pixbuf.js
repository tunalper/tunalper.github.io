// A tiny software rasteriser. Every sprite in the experience is drawn here
// pixel by pixel, then uploaded as a texture: crisp by construction.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

export class PixBuf {
  constructor(w = 1, h = 1) { this.resize(w, h); }

  resize(w, h) {
    this.w = w; this.h = h;
    this.data = new Uint8Array(w * h * 4);
    this.u32 = new Uint32Array(this.data.buffer);
    this.dirty = true;
  }

  clear() {
    // skip the fill (and later the upload) when nothing was drawn last frame
    if (this.used || this.dirty) this.u32.fill(0);
    this.dirty = this.used;
    this.used = false;
  }

  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.u32[y * this.w + x] = c;
  }

  get(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.u32[y * this.w + x];
  }

  // paint only over pixels that already hold colour `only` (cheap clipping)
  over(x, y, c, only) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (this.u32[i] === only) this.u32[i] = c;
  }

  // dithered transparency: keeps the 1-bit pixel-art look while fading
  dset(x, y, c, a) {
    x |= 0; y |= 0;
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (a < 1 && BAYER[((y & 3) << 2) | (x & 3)] > a) return;
    this.u32[y * this.w + x] = c;
  }

  // true alpha blend (used sparingly: glows, fog-free fades)
  mix(x, y, c, a) {
    x |= 0; y |= 0;
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (a >= 1) { this.u32[y * this.w + x] = c; return; }
    const i = (y * this.w + x) << 2, d = this.data;
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    const k = da * (1 - a);
    d[i] = ((c & 255) * a + d[i] * k) / oa;
    d[i + 1] = (((c >>> 8) & 255) * a + d[i + 1] * k) / oa;
    d[i + 2] = (((c >>> 16) & 255) * a + d[i + 2] * k) / oa;
    d[i + 3] = oa * 255;
  }

  rect(x, y, w, h, c) {
    let x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0);
    for (; y0 < y1; y0++) this.u32.fill(c, y0 * this.w + x0, y0 * this.w + x1);
  }

  drect(x, y, w, h, c, a) {
    const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0);
    for (let yy = Math.max(0, y | 0); yy < y1; yy++)
      for (let xx = Math.max(0, x | 0); xx < x1; xx++) this.dset(xx, yy, c, a);
  }

  frame(x, y, w, h, c) {
    this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c);
  }

  line(x0, y0, x1, y1, c, a = 1) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, n = 0;
    for (;;) {
      if (a >= 1) this.set(x0, y0, c); else this.dset(x0, y0, c, a);
      if ((x0 === x1 && y0 === y1) || ++n > 4096) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // dashed line where a moving phase lights up a packet
  disc(cx, cy, r, c, a = 1) {
    const rr = r * r + r * 0.8;
    const R = Math.ceil(r);
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++)
        if (x * x + y * y <= rr) {
          if (a >= 1) this.set(cx + x, cy + y, c); else this.dset(cx + x, cy + y, c, a);
        }
  }

  ring(cx, cy, r, c, a = 1) {
    cx |= 0; cy |= 0; r = Math.round(r);
    if (r <= 0) { this.dset(cx, cy, c, a); return; }
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      const pts = [x, y, y, x, -y, x, -x, y, -x, -y, -y, -x, y, -x, x, -y];
      for (let i = 0; i < 16; i += 2) this.dset(cx + pts[i], cy + pts[i + 1], c, a);
      y++;
      if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
    }
  }

  // even-odd scanline polygon fill; pts = [x0,y0,x1,y1,...]
  poly(pts, c, a = 1) {
    const n = pts.length >> 1;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < pts.length; i += 2) { if (pts[i] < minY) minY = pts[i]; if (pts[i] > maxY) maxY = pts[i]; }
    minY = Math.max(0, Math.floor(minY)); maxY = Math.min(this.h - 1, Math.ceil(maxY));
    const xs = [];
    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = pts[i * 2 + 1], yj = pts[j * 2 + 1];
        if ((yi > sy) !== (yj > sy)) {
          const xi = pts[i * 2], xj = pts[j * 2];
          xs.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.round(xs[k])), x1 = Math.min(this.w, Math.round(xs[k + 1]));
        if (a >= 1) { if (x1 > x0) this.u32.fill(c, y * this.w + x0, y * this.w + x1); }
        else for (let x = x0; x < x1; x++) this.dset(x, y, c, a);
      }
    }
  }

  // blit a bitmask glyph. rows: array of ints, msb = leftmost of width w
  bits(x, y, rows, w, c, a = 1, scale = 1) {
    for (let r = 0; r < rows.length; r++) {
      const v = rows[r];
      if (!v) continue;
      for (let i = 0; i < w; i++) {
        if (v & (1 << (w - 1 - i))) {
          if (scale === 1) this.dset(x + i, y + r, c, a);
          else this.drect(x + i * scale, y + r * scale, scale, scale, c, a);
        }
      }
    }
  }
}
