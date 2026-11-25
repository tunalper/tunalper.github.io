// Pointer state shared by every scene: a lantern position, taps, activity.
import { damp, clamp } from './util.js';

export class Input {
  constructor(app) {
    this.app = app;
    this.x = 0.5; this.y = 0.42;        // normalised viewport position (y down)
    this.sx = 0.5; this.sy = 0.42;      // smoothed
    this.cx = innerWidth / 2; this.cy = innerHeight / 2; // css px
    this.activity = 0;                  // 0..1, lantern brightness
    this.present = false;
    this.down = false;
    this.touch = false;
    this.taps = [];                     // [{x,y}] consumed each frame
    this.vx = 0; this.vy = 0;
    this.fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (app.capture) return;
    const move = (e) => {
      const nx = e.clientX / innerWidth, ny = e.clientY / innerHeight;
      this.vx = nx - this.x; this.vy = ny - this.y;
      this.x = nx; this.y = ny;
      this.cx = e.clientX; this.cy = e.clientY;
      this.present = true;
      this.touch = e.pointerType === 'touch';
      this.activity = Math.min(1, this.activity + 0.25);
    };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerdown', (e) => {
      move(e);
      this.down = true;
      this.activity = 1;
      this.taps.push({ x: this.x, y: this.y, el: e.target });
      app.invalidate && app.invalidate();
    }, { passive: true });
    addEventListener('pointerup', () => { this.down = false; }, { passive: true });
    addEventListener('pointercancel', () => { this.down = false; }, { passive: true });
    document.addEventListener('pointerleave', () => { this.present = false; });
    addEventListener('blur', () => { this.present = false; this.down = false; });
  }

  fake(x, y, down = false) {
    this.x = x; this.y = y;
    this.cx = x * innerWidth; this.cy = y * innerHeight;
    this.present = true;
    this.activity = 1;
    if (down) this.taps.push({ x, y, el: null });
  }

  update(dt) {
    this.sx = damp(this.sx, this.x, 9, dt);
    this.sy = damp(this.sy, this.y, 9, dt);
    // the lantern dims when the hand rests, never fully out on desktop
    const floor = this.present && !this.touch ? 0.35 : 0;
    this.activity = Math.max(floor, damp(this.activity, 0, this.touch ? 1.2 : 0.7, dt));
    this.activity = clamp(this.activity);
  }

  // called by main after scenes consumed taps
  flush() { this.taps.length = 0; }
}
