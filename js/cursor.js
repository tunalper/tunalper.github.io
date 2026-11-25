// Buttons lean toward the hand; a bracket closes around what it touches.
// (The pointer itself is Scylla's claw - see tentacle.js.)
export class Cursor {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.getElementById('cursor');
    this.ring = this.el.querySelector('.cur-ring');
    this.root = document.documentElement;
    this.fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    this.rx = innerWidth / 2; this.ry = innerHeight / 2;
    this.rw = 28; this.rh = 28;
    this.mags = [];
    this.hoverEl = null;
    this.rectT = 0;
    if (this.fine && !ctx.app.capture) this.root.classList.add('has-cursor');
    addEventListener('pointerdown', () => this.root.classList.add('cur-down'), { passive: true });
    addEventListener('pointerup', () => this.root.classList.remove('cur-down'), { passive: true });
  }

  resize() {
    this.fp = parseFloat(getComputedStyle(this.root).getPropertyValue('--fp')) || 2;
    this.mags = [...document.querySelectorAll('[data-magnet]')].map((el) => ({ el, x: 0, y: 0, tx: 0, ty: 0, r: null }));
    this.rectT = 0;
  }

  measure() {
    // no getComputedStyle here: visibility is known from the hud groups
    const groups = this.ctx.hud ? this.ctx.hud.groups : {};
    for (const m of this.mags) {
      const g = m.el.dataset.g && groups[m.el.dataset.g];
      if (g && !(g.op > 0)) { m.r = null; continue; }
      const r = m.el.getBoundingClientRect();
      m.r = r.width === 0 ? null : { cx: r.left + r.width / 2 - m.x, cy: r.top + r.height / 2 - m.y, w: r.width, h: r.height };
    }
  }

  update(S, dt) {
    const input = this.ctx.input;
    if (this.ctx.app.capture && input.present) this.root.classList.add('has-cursor');
    if (!this.root.classList.contains('has-cursor')) return;
    const x = input.cx, y = input.cy;
    this.rectT -= dt;
    if (this.rectT <= 0) { this.rectT = 0.5; this.measure(); }

    // magnetism: the nearest control leans toward the pointer
    let hover = null;
    for (const m of this.mags) {
      if (!m.r || !input.present) { m.tx = 0; m.ty = 0; }
      else {
        const dx = x - m.r.cx, dy = y - m.r.cy;
        const reach = Math.max(m.r.w, m.r.h) * 0.5 + 70;
        const d = Math.hypot(dx, dy);
        if (d < reach) {
          const f = 1 - d / reach;
          m.tx = dx * 0.28 * f; m.ty = dy * 0.28 * f;
          if (Math.abs(dx) < m.r.w / 2 + 6 && Math.abs(dy) < m.r.h / 2 + 6) hover = m;
        } else { m.tx = 0; m.ty = 0; }
      }
      const k = 1 - Math.exp(-dt * 14);
      m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k;
      const rx = Math.round(m.x), ry = Math.round(m.y);
      if (rx !== m.lx || ry !== m.ly) { m.lx = rx; m.ly = ry; m.el.style.translate = rx || ry ? `${rx}px ${ry}px` : ''; }
    }

    this.root.classList.toggle('cur-hover', !!hover);
    // the ring brackets whatever you are about to touch
    let tx = x, ty = y, tw = 26, th = 26;
    if (hover) { tx = hover.r.cx + hover.x; ty = hover.r.cy + hover.y; tw = hover.r.w + 12; th = hover.r.h + 12; }
    const k = 1 - Math.exp(-dt * (hover ? 18 : 10));
    this.rx += (tx - this.rx) * k; this.ry += (ty - this.ry) * k;
    this.rw += (tw - this.rw) * k; this.rh += (th - this.rh) * k;
    const fp = this.fp || 2;
    const snap = (v) => Math.round(v / fp) * fp;
    this.ring.style.width = snap(this.rw) + 'px';
    this.ring.style.height = snap(this.rh) + 'px';
    this.ring.style.transform = `translate3d(${snap(this.rx - this.rw / 2)}px, ${snap(this.ry - this.rh / 2)}px, 0)`;
  }
}
