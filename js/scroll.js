// Smooth wheel scrolling: the wheel sets a target, the page glides to it.
// Keyboard, scrollbar and touch keep their native behaviour.
import { clamp, damp } from './util.js';

const KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

export class SmoothScroll {
  constructor(app) {
    this.app = app;
    this.y = window.scrollY;
    this.target = this.y;
    this.last = this.y;
    this.active = false;
    this.speed = 1.15;
    this.ease = 9;
    if (app.capture) return;
    addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.defaultPrevented || app.reduced) return; // pinch-zoom, still mode
      e.preventDefault();
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 34; else if (e.deltaMode === 2) d *= innerHeight;
      d = clamp(d, -280, 280);
      if (!this.active) { this.y = window.scrollY; this.target = this.y; }
      this.target = clamp(this.target + d * this.speed, 0, this.max());
      this.ease = 9;
      this.active = true;
    }, { passive: false });
    // any scroll we did not cause (keys, scrollbar, touch) wins immediately
    addEventListener('scroll', () => {
      if (Math.abs(window.scrollY - this.last) > 2) { this.y = this.target = this.last = window.scrollY; this.active = false; }
    }, { passive: true });
    addEventListener('keydown', (e) => { if (KEYS.has(e.key)) this.active = false; });
    addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') this.active = false; }, { passive: true });
  }

  max() { return Math.max(0, document.documentElement.scrollHeight - innerHeight); }

  // glide to y (used by the scene buttons); long jumps travel a little slower
  to(y) {
    if (!this.active) this.y = window.scrollY;
    this.target = clamp(y, 0, this.max());
    this.ease = Math.abs(this.target - this.y) > innerHeight * 3 ? 3.2 : 5;
    this.active = true;
  }

  update(dt) {
    if (!this.active) { this.last = window.scrollY; return; }
    this.y = damp(this.y, this.target, this.ease, dt);
    if (Math.abs(this.y - this.target) < 0.5) { this.y = this.target; this.active = false; }
    window.scrollTo(0, this.y);
    this.last = window.scrollY;
  }
}
