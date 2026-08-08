/*!
 * sketch-draw.js -- v1.0
 * Plays a traced SVG back as though a pen were drawing it: constant hand speed
 * along each line, and a short lift between lines that takes longer the
 * further the pen has to travel.
 *
 * Expects an SVG from the tracer, where every stroke carries pathLength="1"
 * and a data-len, so nothing needs measuring at runtime.
 *
 *   <svg data-sketch-draw> ... </svg>
 *   <script src="sketch-draw.js"></script>
 *
 * or:
 *
 *   SketchDraw.create('#drawing', { duration: 9000, boil: true })
 *     .then(function (d) { ... });
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SketchDraw = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    speed: 1800,        // pen speed while drawing, in viewBox units per second
    duration: null,     // ms for the whole drawing; overrides speed if set
    hopSpeed: 3,        // how much faster the pen moves through the air
    maxLift: 90,        // ms ceiling on any one pen lift
    startDelay: 250,    // ms of blank paper before the first mark
    order: 'natural',   // 'natural' (top to bottom) | 'random' | 'reverse'
    startOn: 'view',    // 'view' | 'load' | 'manual'
    loop: false,
    loopDelay: 2500,
    boil: false,        // once finished, let the lines breathe
    boilAmplitude: 1.6,
    boilFps: 7,
    respectReducedMotion: true,
    onProgress: null,   // fn(0..1)
    onDone: null
  };

  var seq = 0;

  function num(el, attr) {
    var v = parseFloat(el.getAttribute(attr));
    return isNaN(v) ? 0 : v;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ------------------------------------------------------------------ class

  function Drawing(svg, options) {
    this.opts = {};
    for (var k in DEFAULTS) this.opts[k] = DEFAULTS[k];
    for (var j in (options || {})) this.opts[j] = options[j];

    this.svg = svg;
    this.uid = 'sd' + (++seq);
    this.art = svg.querySelector('.sd-art');
    this.strokes = Array.prototype.slice.call(svg.querySelectorAll('.sd-pen'));
    this.rafId = null;
    this.destroyed = false;

    if (!this.art || !this.strokes.length) {
      throw new Error('SketchDraw: expected an .sd-art layer and .sd-pen strokes');
    }
    this.maskRef = this.art.getAttribute('mask');

    this._plan();
    this.reset();

    this.reducedMotion = this.opts.respectReducedMotion &&
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (this.reducedMotion) { this.finish(); return; }

    var self = this;
    if (this.opts.startOn === 'load') {
      this.start();
    } else if (this.opts.startOn === 'view') {
      if ('IntersectionObserver' in window) {
        this.io = new IntersectionObserver(function (entries) {
          for (var n = 0; n < entries.length; n++) {
            if (entries[n].isIntersecting) {
              self.io.disconnect(); self.io = null; self.start();
            }
          }
        }, { threshold: 0.15 });
        this.io.observe(svg);
      } else {
        this.start();
      }
    }
  }

  /**
   * Work out when every stroke starts and finishes. Doing this once up front
   * means a frame only has to compare the clock against a couple of numbers,
   * and a dropped frame can never desync the sequence.
   */
  Drawing.prototype._plan = function () {
    var o = this.opts;

    // Chunks without data-cont begin a new line. Group them so reordering
    // can never split a continuous line into pieces.
    var lines = [], cur = null;
    for (var i = 0; i < this.strokes.length; i++) {
      if (!this.strokes[i].hasAttribute('data-cont') || !cur) {
        cur = [];
        lines.push(cur);
      }
      cur.push(i);
    }
    if (o.order === 'random') shuffle(lines);
    else if (o.order === 'reverse') lines.reverse();

    var speed = o.speed / 1000;               // units per ms
    var hop = Math.max(0.01, speed * o.hopSpeed);
    var t = o.startDelay;
    var prev = null;

    this.plan = [];
    for (var L = 0; L < lines.length; L++) {
      for (var c = 0; c < lines[L].length; c++) {
        var idx = lines[L][c];
        var el = this.strokes[idx];
        var isStart = c === 0;

        if (prev && isStart) {
          var dx = num(el, 'data-sx') - prev[0];
          var dy = num(el, 'data-sy') - prev[1];
          t += Math.min(o.maxLift, Math.sqrt(dx * dx + dy * dy) / hop);
        }

        var dur = Math.max(num(el, 'data-len'), 0.3) / speed;
        this.plan.push({ i: idx, t0: t, t1: t + dur });
        t += dur;
        prev = [num(el, 'data-ex'), num(el, 'data-ey')];
      }
    }

    this.totalMs = t;

    if (o.duration) {
      // Stretch or squash the whole schedule to hit the requested runtime.
      var scale = Math.max(0, o.duration - o.startDelay) /
                  Math.max(1, t - o.startDelay);
      for (var p = 0; p < this.plan.length; p++) {
        this.plan[p].t0 = o.startDelay + (this.plan[p].t0 - o.startDelay) * scale;
        this.plan[p].t1 = o.startDelay + (this.plan[p].t1 - o.startDelay) * scale;
      }
      this.totalMs = o.duration;
    }
  };

  /** Back to blank paper. */
  Drawing.prototype.reset = function () {
    for (var i = 0; i < this.strokes.length; i++) {
      this.strokes[i].style.strokeDashoffset = '1';
    }
    if (this.maskRef) this.art.setAttribute('mask', this.maskRef);
    this.cursor = 0;
    this.done = false;
    this.originMs = null;
    return this;
  };

  /** Jump to the finished drawing. */
  Drawing.prototype.finish = function () {
    this._stop();
    for (var i = 0; i < this.strokes.length; i++) {
      this.strokes[i].style.strokeDashoffset = '0';
    }
    // The pen covers ~99.8% of the artwork. Dropping the mask at the end makes
    // the finished drawing exact, and costs nothing to render from then on.
    this.art.removeAttribute('mask');
    this.cursor = this.plan.length;
    this.done = true;
    if (this.opts.onProgress) this.opts.onProgress(1);
    if (this.opts.boil && !this.reducedMotion) this._startBoil();
    if (this.opts.onDone) this.opts.onDone(this);
    return this;
  };

  Drawing.prototype.start = function () {
    if (this.destroyed || this.rafId !== null || this.done) return this;
    var self = this;
    this.originMs = performance.now();
    this.rafId = requestAnimationFrame(function (t) { self._frame(t); });
    return this;
  };

  Drawing.prototype._stop = function () {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  };

  Drawing.prototype.pause = function () {
    if (this.rafId === null) return this;
    this._stop();
    this.pausedAt = performance.now();
    return this;
  };

  Drawing.prototype.resume = function () {
    if (this.destroyed || this.done || this.rafId !== null || this.originMs === null) return this;
    if (this.pausedAt) this.originMs += performance.now() - this.pausedAt;
    var self = this;
    this.rafId = requestAnimationFrame(function (t) { self._frame(t); });
    return this;
  };

  Drawing.prototype.replay = function () {
    this._stop();
    this._stopBoil();
    this.reset();
    return this.start();
  };

  /** Show the drawing frozen partway through, 0..1. */
  Drawing.prototype.seek = function (p) {
    this._stop();
    this._stopBoil();
    if (this.maskRef) this.art.setAttribute('mask', this.maskRef);
    var at = Math.max(0, Math.min(1, p)) * this.totalMs;
    for (var i = 0; i < this.plan.length; i++) {
      var s = this.plan[i];
      var f = at >= s.t1 ? 1 : at <= s.t0 ? 0 : (at - s.t0) / (s.t1 - s.t0);
      this.strokes[s.i].style.strokeDashoffset = String(1 - f);
    }
    this.cursor = 0;
    this.done = false;
    this.originMs = performance.now() - at;
    if (this.opts.onProgress) this.opts.onProgress(p);
    return this;
  };

  Drawing.prototype._frame = function (now) {
    if (this.destroyed) return;
    var self = this;
    var at = now - this.originMs;

    // Finish everything whose time has passed, then partially draw the one
    // stroke that is currently under the pen.
    while (this.cursor < this.plan.length && at >= this.plan[this.cursor].t1) {
      this.strokes[this.plan[this.cursor].i].style.strokeDashoffset = '0';
      this.cursor++;
    }
    if (this.cursor < this.plan.length) {
      var s = this.plan[this.cursor];
      if (at > s.t0) {
        this.strokes[s.i].style.strokeDashoffset =
          String(1 - (at - s.t0) / (s.t1 - s.t0));
      }
    }

    if (this.opts.onProgress) {
      this.opts.onProgress(Math.max(0, Math.min(1, at / this.totalMs)));
    }

    if (this.cursor >= this.plan.length) {
      this.rafId = null;
      this.finish();
      if (this.opts.loop) {
        this.loopTimer = setTimeout(function () { self.replay(); }, this.opts.loopDelay);
      }
      return;
    }
    this.rafId = requestAnimationFrame(function (t) { self._frame(t); });
  };

  // ------------------------------------------- optional: settle into a boil

  Drawing.prototype._startBoil = function () {
    if (this.boilTimer || this.destroyed) return;
    var NS = 'http://www.w3.org/2000/svg';
    var defs = this.svg.querySelector('defs');
    if (!defs) defs = this.svg.insertBefore(document.createElementNS(NS, 'defs'), this.svg.firstChild);

    var vb = (this.svg.getAttribute('viewBox') || '0 0 1000 1000').split(/[\s,]+/);
    var w = parseFloat(vb[2]) || 1000;

    this.boilFilters = [];
    for (var i = 0; i < 3; i++) {
      var f = document.createElementNS(NS, 'filter');
      f.setAttribute('id', this.uid + '-boil-' + i);
      f.setAttribute('x', '-5%'); f.setAttribute('y', '-5%');
      f.setAttribute('width', '110%'); f.setAttribute('height', '110%');
      f.setAttribute('color-interpolation-filters', 'sRGB');

      var t = document.createElementNS(NS, 'feTurbulence');
      t.setAttribute('type', 'fractalNoise');
      t.setAttribute('baseFrequency', (9 / w).toFixed(5));
      t.setAttribute('numOctaves', '2');
      t.setAttribute('seed', String(i * 41 + 7));
      t.setAttribute('result', 'n');

      var d = document.createElementNS(NS, 'feDisplacementMap');
      d.setAttribute('in', 'SourceGraphic');
      d.setAttribute('in2', 'n');
      d.setAttribute('scale', String(this.opts.boilAmplitude * 2));
      d.setAttribute('xChannelSelector', 'R');
      d.setAttribute('yChannelSelector', 'G');

      f.appendChild(t); f.appendChild(d); defs.appendChild(f);
      this.boilFilters.push(f);
    }

    var self = this, last = -1;
    (function tick() {
      if (self.destroyed || !self.boilFilters) return;
      var n = last;
      while (n === last) n = (Math.random() * 3) | 0;
      last = n;
      self.art.setAttribute('filter', 'url(#' + self.uid + '-boil-' + n + ')');
      self.boilTimer = setTimeout(tick, 1000 / self.opts.boilFps);
    })();
  };

  Drawing.prototype._stopBoil = function () {
    if (this.boilTimer) { clearTimeout(this.boilTimer); this.boilTimer = null; }
    if (this.boilFilters) {
      this.art.removeAttribute('filter');
      for (var i = 0; i < this.boilFilters.length; i++) {
        if (this.boilFilters[i].parentNode) {
          this.boilFilters[i].parentNode.removeChild(this.boilFilters[i]);
        }
      }
      this.boilFilters = null;
    }
  };

  Drawing.prototype.destroy = function () {
    this.destroyed = true;
    this._stop();
    this._stopBoil();
    if (this.loopTimer) clearTimeout(this.loopTimer);
    if (this.io) this.io.disconnect();
    return this;
  };

  // ------------------------------------------------------------ public API

  function inline(el) {
    // An <img> or <object> pointing at an SVG has to be inlined before its
    // paths can be animated.
    var url = el.getAttribute('src') || el.getAttribute('data');
    if (!url) return Promise.reject(new Error('SketchDraw: no src to load'));
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('SketchDraw: could not load ' + url + ' (' + r.status + ')');
      return r.text();
    }).then(function (text) {
      var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      var svg = doc.querySelector('svg');
      if (!svg || doc.querySelector('parsererror')) {
        throw new Error('SketchDraw: ' + url + ' is not a usable SVG');
      }
      svg = document.importNode(svg, true);
      if (el.className && typeof el.className === 'string') svg.setAttribute('class', el.className);
      if (el.id) svg.id = el.id;
      el.parentNode.replaceChild(svg, el);
      return svg;
    });
  }

  function create(target, options) {
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return Promise.reject(new Error('SketchDraw: nothing matched ' + target));
    var ready = el.tagName.toLowerCase() === 'svg' ? Promise.resolve(el) : inline(el);
    return ready.then(function (svg) { return new Drawing(svg, options); });
  }

  function auto() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-sketch-draw]'), function (el) {
      var opts = {};
      var raw = el.getAttribute('data-sketch-draw');
      if (raw) { try { opts = JSON.parse(raw); } catch (e) { /* bare flag */ } }
      create(el, opts).catch(function (e) { console.warn(e.message); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();

  return { create: create, auto: auto, defaults: DEFAULTS };
}));
