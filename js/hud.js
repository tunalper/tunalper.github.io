// The DOM layer: everything you can almost read.
import { Scramble, POOL } from './scramble.js';
import { clamp, range, band, hexString, damp } from './util.js';
import { STORY, SCENES } from './director.js';
import { Cursor } from './cursor.js';
import { ShaStepper, K as SHA_K, hex8 } from './sha.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = (n, l) => String(Math.max(0, Math.floor(n))).padStart(l, '0');
const steps = (a, n = 6) => Math.round(clamp(a) * n) / n;
const redact = (n) => '█'.repeat(n);
const mix = (n) => { let s = ''; for (let i = 0; i < n; i++) s += Math.random() < 0.25 ? '▓' : '█'; return s; };

export class Hud {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = document.documentElement;
    this.groups = {};
    $$('[data-g]').forEach((el) => { this.groups[el.dataset.g] = { el, op: -1, vis: null }; });
    this.scr = {};
    $$('[data-scr]').forEach((el) => { this.scr[el.dataset.scr] = new Scramble(el, { rate: 0.003 }); });
    this.heightEl = $('[data-height]');
    this.meter = $$('[data-meter] i');
    this.bootList = $('[data-boot]');
    this.targets = { scylla: $('[data-target="scylla"]'), charybdis: $('[data-target="charybdis"]') };
    this.tbox = { scylla: { x: 0, y: 0, w: 0, h: 0, init: false }, charybdis: { x: 0, y: 0, w: 0, h: 0, init: false } };
    this.dist = { scylla: $('[data-dist="scylla"]'), charybdis: $('[data-dist="charybdis"]') };
    this.bars = $$('[data-bars] i');
    this.pips = $('[data-pips]');
    this.pipEls = $$('[data-pips] i');
    this.ledgerEl = $('[data-ledger]');
    this.rows = [];
    this.tc = $('[data-tc]');
    this.band = $('[data-band]');
    this.needle = $('[data-needle]');
    this.freq = $('[data-freq]');
    this.vault = $('.vault');
    this.pct = $('[data-pct]');
    this.cd = $('[data-cd]');
    this.nonceEl = $('[data-nonce]');
    this.hashEls = $$('[data-hashes] li');
    this.navBtns = $$('#nav [data-jump]');
    this.rail = $('[data-rail]');
    this.snd = $('#snd');
    this.again = $('.again');
    this.cursor = new Cursor(ctx);
    // the hash function, round by round
    this.sha = new ShaStepper();
    this.shaAcc = 0; this.shaHold = 0;
    const regs = $('[data-sha-regs]');
    this.shaRegs = [];
    'abcdefgh'.split('').forEach((n) => {
      const sp = document.createElement('span'); sp.textContent = n;
      const b = document.createElement('b'); b.textContent = '00000000';
      regs.appendChild(sp); regs.appendChild(b);
      this.shaRegs.push(b);
    });
    this.shaEl = { st: $('[data-sha-st]'), t: $('[data-sha-t]'), k: $('[data-sha-k]'), w: $('[data-sha-w]'), t1: $('[data-sha-t1]'), bar: $('[data-sha-bar]'), out: $('[data-sha-out]'), ok: $('[data-sha-ok]') };
    this.addr = $$('[data-a]');
    this.addrT = 0; this.addrN = -1;

    this.acc = 0;
    this.time = 0;
    this.bootT = -1;
    this.ledgerH = 839988;
    this.rowT = 0;
    this.decT = 0;
    this.tcF = 0;
    this.needleX = 0.2;
    this.lockT = 0;
    this.nextLock = 3;
    this.attempts = 0;
    this.pctV = 87.0;
    this.nonce = 0;
    this.lastScene = -1;
    this.wired = false;
  }

  resize() {
    this.cursor.resize();
    this.bandW = 0;
    // narrow screens keep one coordinate so the corners never collide
    const narrow = innerWidth < 560;
    if (this.scr.coords && narrow !== this.narrow) {
      this.narrow = narrow;
      this.scr.coords.set(narrow ? '38°14′48″' : '38°14′48″ · 15°41′28″', 0.4);
    }
  }

  boot() {
    this.bootT = 0;
    this.buildBoot();
    this.buildLedger();
    if (!this.wired) this.wire();
  }

  wire() {
    this.wired = true;
    const { ctx } = this;
    this.navBtns.forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.jump;
      ctx.jumpTo(SCENES[i].jump);
      ctx.sound.event('ui', i / 5);
    }));
    this.snd.addEventListener('click', () => {
      const on = ctx.sound.toggle();
      this.snd.setAttribute('aria-pressed', String(on));
      this.snd.setAttribute('aria-label', on ? 'Sesi kapat' : 'Sesi aç');
    });
    this.vault.addEventListener('click', () => this.deny());
    this.again.addEventListener('click', () => {
      ctx.director.impulse(0.9, 3, 0.2);
      ctx.sound.event('rewind', 0);
      this.root.classList.add('zap');
      setTimeout(() => this.root.classList.remove('zap'), 340);
      ctx.jumpTo(0);
    });
  }

  // ------------------------------------------------------------ builders
  buildBoot() {
    const lines = [
      [['k', '░▒▓'], ['', ' 0x00000000 '], ['', mix(8)], ['', ' ▒▒▒▒']],
      [['k', '[██]'], ['', ' ' + mix(6) + ' ··· '], ['', '38.2466 15.6912']],
      [['k', '⌬'], ['', ' ' + mix(6) + ' '], ['', '▓▓▓▓▓▓▓▓▓▓ '], ['', '21000000']],
      [['k', 'Σ'], ['', ' 9f2c e81a 0b77 '], ['', mix(3)], ['ok', ' ··· ◆']],
      [['k', 'Ψ'], ['', ' ' + mix(4) + ' ' + mix(4) + ' ▒▒ ··· '], ['ok', '✕']],
      [['k', ''], ['', ' ' + mix(8) + ' ▓▓▓ ··· '], ['ok', '◆']],
      [['k', '▶'], ['', ' ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ '], ['ok', '100%']],
    ];
    this.bootList.innerHTML = '';
    this.bootLines = lines.map((parts, i) => {
      const li = document.createElement('li');
      const spans = parts.map(([cls, txt]) => {
        const sp = document.createElement('span');
        if (cls) sp.className = cls;
        sp.textContent = txt.replace(/[^ ]/g, ' ');
        li.appendChild(sp);
        return { sc: new Scramble(sp), txt };
      });
      this.bootList.appendChild(li);
      return { li, spans, at: 0.25 + i * 0.3, started: false };
    });
  }

  ledgerRow(h) {
    const row = document.createElement('div');
    row.className = 'lg-row new';
    const lock = Math.random() < 0.18;
    if (lock) row.classList.add('lock');
    const cells = [
      ['h', '#' + pad(h, 6)],
      ['x', hexString(4) + '··' + hexString(4) + '··' + hexString(3)],
      ['r', mix(6 + ((Math.random() * 6) | 0)).padEnd(14, ' ')],
      ['a', mix(2) + '.' + mix(5) + ' ₿'],
      ['s', lock ? '' : Math.random() < 0.5 ? '◆' : '⌬'],
    ];
    const sc = {};
    for (const [cls, txt] of cells) {
      const sp = document.createElement('span');
      sp.className = cls;
      sp.textContent = txt;
      row.appendChild(sp);
      sc[cls] = new Scramble(sp, { rate: cls === 'x' ? 0.01 : 0.002 });
    }
    return { row, sc, dec: 0 };
  }

  buildLedger() {
    this.ledgerEl.innerHTML = '';
    this.rows = [];
    for (let i = 0; i < 16; i++) {
      const r = this.ledgerRow(this.ledgerH - i);
      r.row.classList.remove('new');
      this.ledgerEl.appendChild(r.row);
      this.rows.push(r);
    }
  }

  // ---------------------------------------------------------- reactions
  zap() {
    if (this.ctx.app.calm) return;
    this.root.classList.remove('zap');
    void this.root.offsetWidth;
    this.root.classList.add('zap');
    clearTimeout(this.zapT);
    this.zapT = setTimeout(() => this.root.classList.remove('zap'), 340);
  }

  deny() {
    const { ctx } = this;
    this.attempts++;
    this.vault.classList.remove('denied');
    void this.vault.offsetWidth;
    this.vault.classList.add('denied');
    clearTimeout(this.denyT);
    this.denyT = setTimeout(() => this.vault.classList.remove('denied'), 460);
    ctx.director.impulse(0.55, 2, 0.35);
    ctx.sound.event('deny', 0);
    if (this.scr['v-title']) this.scr['v-title'].burst(0.6);
    if (this.scr['v-key']) this.scr['v-key'].burst(0.8);
    // it creeps, but never opens
    this.pctV = Math.min(99.9, this.pctV + 0.1 + Math.random() * 0.3);
  }

  show(name, a) {
    const g = this.groups[name];
    if (!g) return;
    const op = steps(a, 8);
    if (op === g.op) return;
    g.op = op;
    g.el.style.opacity = op;
    const vis = op > 0;
    if (vis !== g.vis) {
      g.vis = vis;
      g.el.style.visibility = vis ? 'visible' : 'hidden';
    }
  }

  // ------------------------------------------------------------- update
  update(S, dt) {
    const { ctx } = this;
    const app = ctx.app;
    this.time += dt;
    const s = S.s;
    const boot = S.boot;
    const scale = app.pd / app.dpr;

    // the frame (corners, nav, sound) arrives once the name has locked
    if (!this.framed && (boot > 3.4 || app.reduced)) { this.framed = true; this.root.classList.add('is-booted'); }
    // visibility of every scene group
    const booted = range(boot, 3.4, 4.4);
    this.show('boot', boot < 0 ? 0 : (boot > 0.15 ? 1 : 0) * (1 - range(boot, 3.0, 3.6)) * (1 - range(s, 0.05, 0.3)));
    this.show('hint', range(boot, 4.2, 5.0) * (1 - range(s, 0.04, 0.2)));
    this.show('strait', booted * S.w.strait * (1 - range(s, STORY.dive - 0.6, STORY.dive)));
    this.show('core', S.w.core * range(s, STORY.core + 0.25, STORY.core + 0.7));
    this.show('ledger', S.w.ledger);
    this.show('signal', S.w.signal);
    this.show('vault', S.w.signal * range(s, STORY.signal + 0.1, STORY.signal + 0.5));
    this.show('closing', S.w.closing * (1 - range(s, STORY.end - 1.3, STORY.end - 0.95)));
    this.show('again', range(s, STORY.end - 0.16, STORY.end - 0.03));

    // boot terminal
    if (this.bootLines && this.groups.boot.op > 0) {
      for (const L of this.bootLines) {
        if (!L.started && boot >= L.at) {
          L.started = true;
          L.spans.forEach((p) => p.sc.set(p.txt, 0.35, 0.7));
        }
      }
    }

    this.cursor.update(S, dt);
    this.ctx.input.flush();

    // text effects run at ~30 Hz: plenty for glyph flicker, cheap on layout
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    const tdt = this.acc;
    this.acc = 0;

    if (this.bootLines && this.groups.boot.op > 0) for (const L of this.bootLines) L.spans.forEach((p) => L.started && p.sc.tick(tdt));

    // block height = progress through the story (ends on the 4th halving)
    const h = Math.round((s / STORY.end) * 840000);
    if (h !== this.lastH) { this.lastH = h; this.heightEl.textContent = '#' + pad(h, 6); }

    // persistent scramblers tick only while visible
    const live = (k) => this.scr[k] && this.scr[k].tick(tdt);
    live('coords');
    if (Math.random() < 0.004) this.scr.coords.burst(0.5);

    // level meter: the sound if it is on, otherwise the scene's pulse
    const lv = ctx.sound.on ? ctx.sound.levels : null;
    for (let i = 0; i < this.meter.length; i++) {
      const v = lv ? lv[i * 3] : (0.3 + 0.35 * Math.sin(this.time * (2 + i) + i) * Math.sin(this.time * 0.7 + i * 2)) * (0.5 + S.w.signal);
      this.meter[i].className = v > 0.62 ? 'pk' : v > 0.3 ? 'on' : '';
      this.meter[i].style.height = `calc(var(--fp) * ${1 + Math.round(clamp(v) * 7)})`;
    }

    // nav
    const sc = S.scene;
    if (sc !== this.lastScene) {
      this.lastScene = sc;
      this.navBtns.forEach((b, i) => {
        b.classList.toggle('on', i === sc);
        b.classList.toggle('past', i < sc);
        if (i === sc) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
    }
    this.rail.style.transform = `scaleY(${(s / STORY.end).toFixed(4)})`;

    if (this.groups.strait.op > 0) this.updateStrait(S, scale, tdt);
    if (this.groups.core.op > 0) this.updateCore(S, tdt);
    if (this.groups.ledger.op > 0) this.updateLedger(S, tdt);
    if (this.groups.signal.op > 0 || this.groups.vault.op > 0) this.updateSignal(S, tdt);
    if (this.groups.closing.op > 0) this.updateClosing(S, tdt);
  }

  updateStrait(S, scale, dt) {
    const st = this.ctx.scenes.strait;
    for (const k of ['scylla', 'charybdis']) {
      const T = st.targets[k];
      const el = this.targets[k];
      const B = this.tbox[k];
      if (!T.vis) { el.style.visibility = 'hidden'; continue; }
      el.style.visibility = 'visible';
      const m = 6;
      const x = (T.x - m) * scale, y = (T.y - m) * scale, w = (T.w + m * 2) * scale, h = (T.h + m * 2) * scale;
      if (!B.init) { B.x = x; B.y = y; B.w = w; B.h = h; B.init = true; }
      const k2 = 1 - Math.exp(-dt * 6);
      B.x += (x - B.x) * k2; B.y += (y - B.y) * k2; B.w += (w - B.w) * k2; B.h += (h - B.h) * k2;
      const vw = innerWidth, vh = innerHeight;
      const cx = clamp(B.x, 8, vw - B.w - 8), cy = clamp(B.y, 40, vh - B.h - 40);
      el.style.transform = `translate3d(${Math.round(cx)}px, ${Math.round(cy)}px, 0)`;
      const rw = Math.round(B.w), rh = Math.round(B.h);
      if (rw !== B.lw) { B.lw = rw; el.style.width = rw + 'px'; }
      if (rh !== B.lh) { B.lh = rh; el.style.height = rh + 'px'; }
      const d = (T.dist || 0) * 7.3;
      if (Math.random() < 0.3) this.dist[k].textContent = (Math.random() < 0.15 ? '▓' : '') + pad(d, 4) + '.' + ((d * 10) % 10 | 0);
    }
    this.scr['tag-a'].tick(dt); this.scr['tag-b'].tick(dt); this.scr.warn.tick(dt);
    if (Math.random() < 0.02) this.scr[Math.random() < 0.5 ? 'tag-a' : 'tag-b'].burst(0.4);
  }

  updateCore(S, dt) {
    for (const k of ['supply', 'sig', 'nodes', 'rate', 'diff', 'pulse']) this.scr[k].tick(dt);
    if (Math.random() < 0.05) {
      const keys = ['sig', 'nodes', 'rate', 'diff'];
      const k = keys[(Math.random() * keys.length) | 0];
      const next = {
        sig: '0x' + mix(4) + ' ' + hexString(4),
        nodes: mix(3) + ' ' + hexString(2),
        rate: mix(2) + '.' + mix(1) + ' ░░/s',
        diff: '░▒ ' + '0000000' + hexString(5),
      }[k];
      this.scr[k].set(next, 0.6);
    }
    const beat = this.ctx.scenes.core.beat || 0;
    this.bars.forEach((b, i) => {
      const v = clamp(0.15 + beat * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + this.time * 3))) + Math.random() * 0.15);
      b.style.height = `calc(var(--fp) * ${1 + Math.round(v * 13)})`;
    });
    const p = ['◆ ◇ ◇ ◇', '◇ ◆ ◇ ◇', '◇ ◇ ◆ ◇', '◇ ◇ ◇ ◆'][Math.floor(this.time * 2) % 4];
    if (this.scr.pulse.target.join('') !== p) this.scr.pulse.set(p, 0.15);
    const clicks = this.ctx.egg ? this.ctx.egg.count : 0;
    this.pips.classList.toggle('on', clicks > 0);
    this.pipEls.forEach((el, i) => el.classList.toggle('on', i < clicks));
  }

  updateLedger(S, dt) {
    this.rowT -= dt;
    if (this.rowT <= 0) {
      this.rowT = 0.42 + Math.random() * 0.5;
      this.ledgerH++;
      const r = this.ledgerRow(this.ledgerH);
      this.ledgerEl.insertBefore(r.row, this.ledgerEl.firstChild);
      this.rows.unshift(r);
      const old = this.rows.pop();
      old.row.remove();
      setTimeout(() => r.row.classList.remove('new'), 520);
    }
    // one row at a time almost gives up its secret
    this.decT -= dt;
    if (this.decT <= 0) {
      this.decT = 0.6 + Math.random() * 0.9;
      const r = this.rows[1 + ((Math.random() * Math.min(10, this.rows.length - 1)) | 0)];
      if (r && !r.dec) {
        r.dec = 1;
        r.row.classList.add('dec');
        r.sc.r.el.classList.add('x');
        r.sc.r.set(hexString(10 + ((Math.random() * 4) | 0)).padEnd(14, ' '), 0.5);
        setTimeout(() => {
          r.sc.r.set(mix(6 + ((Math.random() * 6) | 0)).padEnd(14, ' '), 0.35);
          r.row.classList.remove('dec');
          r.sc.r.el.classList.remove('x');
          r.dec = 0;
        }, 700 + Math.random() * 500);
      }
    }
    for (const r of this.rows) { r.sc.x.tick(dt); r.sc.r.tick(dt); r.sc.a.tick(dt); }
    this.updateSha(dt);
    // the key pipeline lights up stage by stage, then starts over
    this.addrT -= dt;
    if (this.addrT <= 0) {
      this.addrN = (this.addrN + 1) % 7;
      this.addrT = this.addrN === 6 ? 2.2 : 0.85;
      this.addr.forEach((el, i) => {
        const on = i <= this.addrN && this.addrN < 6;
        if (on && !el.classList.contains('on')) { el.classList.add('hud-glitch'); setTimeout(() => el.classList.toggle('hud-glitch', false), 400); }
        el.classList.toggle('on', on || this.addrN === 6);
      });
      if (this.addrN === 6) this.ctx.sound.event('lockon', 0.8);
    }
  }

  updateSha(dt) {
    const sha = this.sha, E = this.shaEl;
    if (sha.done) {
      this.shaHold -= dt;
      if (this.shaHold <= 0) { sha.reset(); E.out.classList.toggle('done', false); E.out.textContent = '\u2593'.repeat(32); E.ok.textContent = ''; }
      return;
    }
    this.shaAcc += dt * 22;
    let n = Math.floor(this.shaAcc);
    if (!n) return;
    this.shaAcc -= n;
    const before = sha.r.slice();
    while (n-- > 0 && !sha.done) sha.step();
    const t = Math.min(sha.t, 63);
    E.st.textContent = sha.stage + '/3';
    E.t.textContent = 't=' + String(t).padStart(2, '0');
    E.k.textContent = hex8(SHA_K[t]);
    E.w.textContent = hex8(sha.W[t]);
    E.t1.textContent = hex8((sha.r[4] - (before[3] || 0)) >>> 0);
    sha.r.forEach((v, i) => {
      const s = hex8(v);
      const b = this.shaRegs[i];
      if (b.textContent !== s) b.textContent = s;
      b.classList.toggle('ch', i === 0 || i === 4);
    });
    const done = ((sha.stage - 1) * 64 + sha.t) / 192;
    E.bar.style.width = (sha.done ? 100 : done * 100).toFixed(1) + '%';
    if (sha.done) {
      // 000000000019d668...: the zeros are the work
      const d = sha.digest, z = d.match(/^0*/)[0].length;
      E.out.innerHTML = '<em>' + d.slice(0, z) + '</em>' + d.slice(z, 32) + '\u2026';
      E.out.classList.toggle('done', true);
      E.ok.textContent = '\u2713';
      this.shaHold = 3.5;
      this.ctx.sound.event('lockon', 0.4);
    } else if (Math.random() < 0.3) {
      let s = '';
      for (let i = 0; i < 32; i++) s += POOL[(Math.random() * 16) | 0];
      E.out.textContent = s;
    }
  }

  updateSignal(S, dt) {
    // timecode at 24 fps
    this.tcF += dt * 24;
    const f = Math.floor(this.tcF);
    const fr = f % 24, sec = Math.floor(f / 24) % 60, min = Math.floor(f / 1440) % 60, hr = Math.floor(f / 86400);
    this.tc.textContent = `${pad(hr, 2)}:${pad(min, 2)}:${pad(sec, 2)}:${pad(fr, 2)}`;
    // searching... and briefly catching something
    const bw = this.bandW || (this.bandW = this.band.clientWidth) || 1;
    this.lockT -= dt;
    this.nextLock -= dt;
    if (this.nextLock <= 0 && this.lockT <= 0) {
      this.lockT = 1.1 + Math.random() * 0.8;
      this.nextLock = 3 + Math.random() * 3;
      this.lockX = 0.62 + Math.random() * 0.1;
      this.ctx.sound.event('lockon', this.lockX);
    }
    const locking = this.lockT > 0;
    const target = locking ? this.lockX : 0.5 + 0.42 * Math.sin(this.time * 0.37) * Math.cos(this.time * 0.13) + (Math.random() - 0.5) * 0.02;
    this.needleX += (target - this.needleX) * (locking ? 0.35 : 0.12);
    this.needle.style.transform = `translate3d(${Math.round(this.needleX * bw)}px,0,0)`;
    this.band.classList.toggle('lock', locking);
    if (Math.random() < (locking ? 0.05 : 0.6)) {
      const fq = 76 + this.needleX * 32;
      this.freq.textContent = (locking ? '' : Math.random() < 0.3 ? '▓' : '') + pad(fq, 3) + '.' + ((fq * 10) % 10 | 0);
    }
    // the vault
    this.scr['v-title'].tick(dt); this.scr['v-key'].tick(dt);
    if (Math.random() < 0.015) this.scr['v-key'].burst(0.5);
    this.pctV = Math.min(99.9, this.pctV + dt * 0.002);
    this.pct.textContent = this.pctV.toFixed(1) + '%';
    let cd = '';
    for (const ch of '??:??:??') cd += ch === ':' ? ':' : Math.random() < 0.06 ? POOL[(Math.random() * 10) | 0] : '?';
    this.cd.textContent = cd;
  }

  updateClosing(S, dt) {
    const s = S.s;
    if (!this.mEl) this.mEl = { h: $('[data-m-height]'), st: $('[data-m-state]'), conf: $('[data-m-conf]'), fin: $('[data-m-final]'), root: $('[data-m-root]') };
    const M = this.mEl;
    const mining = range(s, STORY.closing + 0.2, STORY.mined);
    const found = s >= STORY.mined;
    if (!found) {
      this.nonce = (this.nonce + Math.floor(1000 + Math.random() * 90000)) >>> 0;
      this.nonceEl.textContent = '0x' + this.nonce.toString(16).padStart(8, '0');
      // the transactions are still arriving: the root keeps changing
      if (Math.random() < 0.25) M.root.textContent = hexString(12) + '…';
      const zeros = Math.floor(mining * 12);
      this.hashEls.forEach((li) => {
        li.classList.toggle('win', false);
        li.textContent = '0'.repeat(Math.max(0, zeros - ((Math.random() * 4) | 0))) + hexString(26 - zeros) + ' ✕';
      });
      if (this.won !== false) { M.st.textContent = 'mining'; M.conf.textContent = '◇◇◇◇◇◇'; M.fin.textContent = ''; M.h.textContent = '#840000'; }
      this.won = false;
    } else if (!this.won) {
      this.won = true;
      this.hashEls[0].classList.toggle('win', true);
      this.hashEls[0].textContent = '0000000000000000000' + hexString(7) + ' ✓';
      for (let i = 1; i < this.hashEls.length; i++) this.hashEls[i].textContent = '';
      M.st.textContent = 'sealed ✓';
      M.conf.textContent = '◆◇◇◇◇◇';
      M.fin.textContent = '#839995 final';
    }
  }

}
