/* Shared helpers for the s4digital media tools (GIF, image, video).
   Everything runs in the browser. Files are never uploaded anywhere. */
(function () {
  'use strict';

  var LIBS = {
    jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    pako: 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
    upng: 'https://cdnjs.cloudflare.com/ajax/libs/upng-js/2.1.0/UPNG.min.js',
    heic2any: 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
    mp4muxer: 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.min.js',
    gifenc: 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js',
    gifuct: 'https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/+esm'
  };

  var scriptCache = {};
  function loadScript(url) {
    if (scriptCache[url]) return scriptCache[url];
    scriptCache[url] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(); };
      s.onerror = function () { delete scriptCache[url]; reject(new Error('Couldn’t load a helper library. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return scriptCache[url];
  }
  var moduleCache = {};
  function loadModule(url) {
    if (!moduleCache[url]) {
      moduleCache[url] = import(url).catch(function () {
        delete moduleCache[url];
        throw new Error('Couldn’t load a helper library. Check your connection and try again.');
      });
    }
    return moduleCache[url];
  }

  var lib = {
    jszip: function () { return loadScript(LIBS.jszip).then(function () { return window.JSZip; }); },
    upng: function () { return loadScript(LIBS.pako).then(function () { return loadScript(LIBS.upng); }).then(function () { return window.UPNG; }); },
    heic2any: function () { return loadScript(LIBS.heic2any).then(function () { return window.heic2any; }); },
    mp4muxer: function () { return loadScript(LIBS.mp4muxer).then(function () { return window.Mp4Muxer; }); },
    gifenc: function () { return loadModule(LIBS.gifenc); },
    gifuct: function () { return loadModule(LIBS.gifuct); }
  };

  // ---------- small helpers ----------
  function $(id) { return document.getElementById(id); }
  function bytes(n) {
    if (!isFinite(n)) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1048576).toFixed(n < 104857600 ? 1 : 0) + ' MB';
  }
  function saving(before, after) {
    var p = Math.round((1 - after / before) * 100);
    return p > 0 ? p + '% smaller' : (p < 0 ? Math.abs(p) + '% bigger' : 'same size');
  }
  function baseName(name) {
    return (name || 'file').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'file';
  }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function fmtTime(t) {
    if (!isFinite(t)) t = 0;
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function status(el, msg, isErr) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isErr);
  }
  function progress(wrap, bar, frac) {
    if (!wrap) return;
    if (frac == null) { wrap.hidden = true; return; }
    wrap.hidden = false;
    bar.style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
  }

  // ---------- dropzone ----------
  function bindDrop(drop, input, onFiles) {
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (files.length) onFiles(files);
    });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      var files = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
      if (!input.multiple) files = files.slice(0, 1);
      if (files.length) onFiles(files);
    });
  }

  // ---------- downloads ----------
  var urls = new WeakMap();
  function setDownload(a, blob, name) {
    var old = urls.get(a);
    if (old) URL.revokeObjectURL(old);
    var u = URL.createObjectURL(blob);
    urls.set(a, u);
    a.href = u;
    a.download = name;
    a.dataset.size = blob.size;
    a.dataset.type = blob.type;
    return u;
  }
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function zip(files) {
    return lib.jszip().then(function (JSZip) {
      var z = new JSZip(), used = {};
      files.forEach(function (f) {
        var n = f.name, i = 1;
        while (used[n]) { n = f.name.replace(/(\.[^.]+)?$/, '-' + (++i) + '$1'); }
        used[n] = 1;
        z.file(n, f.blob);
      });
      return z.generateAsync({ type: 'blob', compression: 'STORE' });
    });
  }

  // ---------- images ----------
  function isHeic(file) {
    return /image\/hei[cf]/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
  }
  function blobToImage(blob) {
    return new Promise(function (resolve, reject) {
      var u = URL.createObjectURL(blob), img = new Image();
      img.onload = function () { resolve(img); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); };
      img.onerror = function () { URL.revokeObjectURL(u); reject(new Error('This browser can’t open that image.')); };
      img.src = u;
    });
  }
  // Returns an <img> ready to draw. HEIC/HEIF goes through heic2any first.
  function loadImage(file) {
    if (isHeic(file)) {
      return lib.heic2any().then(function (h2a) {
        return h2a({ blob: file, toType: 'image/png' });
      }).then(function (out) {
        return blobToImage(Array.isArray(out) ? out[0] : out);
      }).catch(function (err) {
        throw new Error(err && err.message && err.message.indexOf('load') > -1 ? err.message : 'Couldn’t read that HEIC file. It may use a variant this converter doesn’t support.');
      });
    }
    return blobToImage(file);
  }
  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (!b) reject(new Error('The browser couldn’t create the image. It may be too large.'));
        else resolve(b);
      }, type, quality);
    });
  }
  // Good quality downscale: halve in steps, then one final pass.
  function drawScaled(src, sw, sh, w, h, opts) {
    opts = opts || {};
    var cur = src, cw = sw, ch = sh;
    while (cw / 2 >= w && ch / 2 >= h && cw > 2) {
      var half = document.createElement('canvas');
      half.width = Math.max(1, Math.round(cw / 2)); half.height = Math.max(1, Math.round(ch / 2));
      var hc = half.getContext('2d');
      hc.imageSmoothingEnabled = true; hc.imageSmoothingQuality = 'high';
      hc.drawImage(cur, 0, 0, cw, ch, 0, 0, half.width, half.height);
      cur = half; cw = half.width; ch = half.height;
    }
    var out = document.createElement('canvas');
    out.width = w; out.height = h;
    var oc = out.getContext('2d');
    if (opts.background) { oc.fillStyle = opts.background; oc.fillRect(0, 0, w, h); }
    oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
    oc.drawImage(cur, 0, 0, cw, ch, 0, 0, w, h);
    return out;
  }
  var MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  function typeFor(file) {
    var t = (file.type || '').toLowerCase();
    if (t === 'image/jpeg' || t === 'image/png' || t === 'image/webp') return t;
    return MIME[ext(file.name)] || 'image/png';
  }
  function extFor(type) { return type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png'; }
  var webpOk = (function () {
    try { var c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { return false; }
  })();

  // ---------- cropper ----------
  // new Cropper(host, sourceCanvasOrImage, { onChange(rect) })
  function Cropper(host, source, opts) {
    var self = this;
    opts = opts || {};
    this.iw = source.naturalWidth || source.width;
    this.ih = source.naturalHeight || source.height;
    this.ratio = 0;
    this.onChange = opts.onChange || function () {};
    host.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'fm-crop';
    var view;
    if (source.tagName === 'IMG') { view = document.createElement('img'); view.src = source.src; view.alt = 'Image to crop'; }
    else { view = document.createElement('canvas'); view.width = this.iw; view.height = this.ih; view.getContext('2d').drawImage(source, 0, 0); }
    view.className = 'fm-crop__img';
    view.draggable = false;
    var box = document.createElement('div');
    box.className = 'fm-crop__box';
    box.setAttribute('aria-label', 'Crop area. Drag to move, drag a corner to resize.');
    ['nw', 'ne', 'sw', 'se'].forEach(function (c) {
      var h = document.createElement('span');
      h.className = 'fm-crop__h fm-crop__h--' + c;
      h.dataset.corner = c;
      box.appendChild(h);
    });
    var grid = document.createElement('i'); grid.className = 'fm-crop__grid'; box.appendChild(grid);
    wrap.appendChild(view); wrap.appendChild(box);
    host.appendChild(wrap);
    this.wrap = wrap; this.box = box;
    this.rect = { x: 0, y: 0, w: this.iw, h: this.ih };
    this.render();

    var drag = null;
    function toSrc(e) {
      var r = wrap.getBoundingClientRect();
      return { x: (e.clientX - r.left) * self.iw / r.width, y: (e.clientY - r.top) * self.ih / r.height };
    }
    box.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var p = toSrc(e), c = e.target.dataset && e.target.dataset.corner;
      var R = self.rect;
      if (c) {
        drag = { mode: 'resize', ax: c.indexOf('w') > -1 ? R.x + R.w : R.x, ay: c.indexOf('n') > -1 ? R.y + R.h : R.y };
      } else {
        drag = { mode: 'move', px: p.x, py: p.y, x: R.x, y: R.y };
      }
      box.setPointerCapture(e.pointerId);
      wrap.classList.add('is-dragging');
    });
    box.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var p = toSrc(e), R = self.rect;
      if (drag.mode === 'move') {
        R.x = Math.round(Math.min(self.iw - R.w, Math.max(0, drag.x + p.x - drag.px)));
        R.y = Math.round(Math.min(self.ih - R.h, Math.max(0, drag.y + p.y - drag.py)));
      } else {
        var dx = p.x - drag.ax, dy = p.y - drag.ay, sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
        var w = Math.max(8, Math.abs(dx)), h = Math.max(8, Math.abs(dy));
        var availW = sx > 0 ? self.iw - drag.ax : drag.ax, availH = sy > 0 ? self.ih - drag.ay : drag.ay;
        if (self.ratio) { if (w / h > self.ratio) w = h * self.ratio; else h = w / self.ratio; }
        if (w > availW) { w = availW; if (self.ratio) h = w / self.ratio; }
        if (h > availH) { h = availH; if (self.ratio) w = h * self.ratio; }
        R.w = Math.round(w); R.h = Math.round(h);
        R.x = Math.round(sx > 0 ? drag.ax : drag.ax - w);
        R.y = Math.round(sy > 0 ? drag.ay : drag.ay - h);
      }
      self.render(); self.onChange(self.get());
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      box.addEventListener(ev, function () { drag = null; wrap.classList.remove('is-dragging'); });
    });
  }
  Cropper.prototype.render = function () {
    var R = this.rect, s = this.box.style;
    s.left = (R.x / this.iw * 100) + '%';
    s.top = (R.y / this.ih * 100) + '%';
    s.width = (R.w / this.iw * 100) + '%';
    s.height = (R.h / this.ih * 100) + '%';
  };
  Cropper.prototype.get = function () { var R = this.rect; return { x: R.x, y: R.y, w: R.w, h: R.h }; };
  Cropper.prototype.set = function (r) {
    var x = Math.max(0, Math.min(this.iw - 1, Math.round(r.x))), y = Math.max(0, Math.min(this.ih - 1, Math.round(r.y)));
    var w = Math.max(1, Math.min(this.iw - x, Math.round(r.w))), h = Math.max(1, Math.min(this.ih - y, Math.round(r.h)));
    this.rect = { x: x, y: y, w: w, h: h };
    this.render();
    this.onChange(this.get());
  };
  // ratio = width / height, 0 for free. Fits the biggest centred box of that shape.
  Cropper.prototype.setRatio = function (ratio) {
    this.ratio = ratio || 0;
    if (!this.ratio) return;
    var w = this.iw, h = Math.round(w / this.ratio);
    if (h > this.ih) { h = this.ih; w = Math.round(h * this.ratio); }
    this.set({ x: (this.iw - w) / 2, y: (this.ih - h) / 2, w: w, h: h });
  };

  window.FTM = {
    lib: lib, $: $, bytes: bytes, saving: saving, baseName: baseName, ext: ext, tick: tick, fmtTime: fmtTime,
    status: status, progress: progress, bindDrop: bindDrop, setDownload: setDownload, download: download, zip: zip,
    isHeic: isHeic, loadImage: loadImage, blobToImage: blobToImage, canvasToBlob: canvasToBlob, drawScaled: drawScaled,
    typeFor: typeFor, extFor: extFor, webpOk: webpOk, Cropper: Cropper
  };
})();
