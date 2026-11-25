// Loading screen: eight blocks sync while a hash is "mined" toward zeros.
import { HEX } from './util.js';

export class Loader {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.blocks = el ? [...el.querySelectorAll('.ld-chain i')] : [];
    this.hash = el ? el.querySelector('.ld-hash') : null;
    this.done = false;
  }

  paint(p) {
    const n = Math.min(this.blocks.length, Math.floor(p * (this.blocks.length + 0.001)));
    this.blocks.forEach((b, i) => b.classList.toggle('on', i < n));
    if (this.hash) {
      const zeros = Math.floor(p * 10);
      let s = '';
      for (let i = 0; i < 16; i++) s += i < zeros ? '0' : HEX[(Math.random() * 16) | 0];
      this.hash.innerHTML = '0x<b>' + s.slice(0, zeros) + '</b>' + s.slice(zeros);
    }
    if (this.el) this.el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }

  run(ms) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        // stutter like a real sync
        this.paint(Math.min(1, p * p * (3 - 2 * p) + (Math.random() < 0.1 ? 0.04 : 0)));
        if (p < 1) setTimeout(tick, 55);
        else { this.finish(); resolve(); }
      };
      tick();
    });
  }

  finish(instant = false) {
    if (this.done) return;
    this.done = true;
    this.blocks.forEach((b) => b.classList.add('on'));
    if (this.hash) this.hash.innerHTML = '0x<b>000000000019d668</b>';
    if (this.el) {
      this.el.setAttribute('aria-valuenow', '100');
      setTimeout(() => this.el && this.el.remove(), instant ? 0 : 900);
    }
  }
}
