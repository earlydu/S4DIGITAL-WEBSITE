/* s4digital PDF suite: shared helpers for every tool page. Everything runs in the browser, nothing is uploaded.
   Exposes window.S4T. Needs pdf-lib and/or PDF.js loaded first on pages that use them. */
(function () {
  'use strict';
  var T = window.S4T = {};
  var pdfjsLib = window.pdfjsLib;
  if (pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  T.$ = function (id) { return document.getElementById(id); };

  T.ICON = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    rotL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>',
    rotR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
    grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'
  };

  // ---------- small helpers ----------
  T.status = function (el, msg, isErr) { if (!el) return; el.textContent = msg || ''; el.classList.toggle('is-error', !!isErr); };
  T.mb = function (n) { return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; };
  T.plural = function (n, w, ws) { return n + ' ' + (n === 1 ? w : (ws || w + 's')); };
  T.baseName = function (name) { return (name || 'document').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'document'; };
  T.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  T.iconBtn = function (icon, label) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ft-btn ft-btn--icon'; b.innerHTML = T.ICON[icon]; b.setAttribute('aria-label', label); b.title = label;
    return b;
  };
  T.readBytes = async function (file) { return new Uint8Array(await file.arrayBuffer()); };
  T.tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
  T.isPdf = function (f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; };

  T.need = function (statusEl, globals) {
    var missing = globals.filter(function (g) { return !window[g]; });
    if (!missing.length) return true;
    T.status(statusEl, 'A library this tool needs didn’t load. Check your connection and refresh the page.', true);
    return false;
  };

  T.loadPdfLib = async function (bytes) {
    try { return await window.PDFLib.PDFDocument.load(bytes); }
    catch (err) {
      if (/encrypt/i.test(err && err.message)) throw new Error('it’s password-protected or encrypted. Unlock it first');
      throw new Error('it doesn’t look like a valid PDF');
    }
  };
  T.loadPdfJs = function (bytes) {
    return pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise.catch(function (err) {
      if (err && err.name === 'PasswordException') throw new Error('it’s password-protected. Unlock it first');
      throw new Error('it doesn’t look like a valid PDF');
    });
  };

  T.renderThumb = async function (doc, pageNum, maxDim) {
    var page = await doc.getPage(pageNum);
    var vp1 = page.getViewport({ scale: 1 });
    var ratio = Math.min(2, window.devicePixelRatio || 1);
    var scale = (maxDim / Math.max(vp1.width, vp1.height)) * ratio;
    var vp = page.getViewport({ scale: scale });
    var c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    c.style.width = (vp.width / ratio) + 'px';
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    page.cleanup();
    return c;
  };
  // Render a page onto a white canvas at a given scale (1 = 72 dpi).
  T.renderPage = async function (doc, pageNum, scale) {
    var page = await doc.getPage(pageNum);
    var vp = page.getViewport({ scale: scale });
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    page.cleanup();
    return c;
  };
  T.canvasBlob = function (canvas, type, quality) {
    return new Promise(function (res, rej) { canvas.toBlob(function (b) { b ? res(b) : rej(new Error('the browser couldn’t make the image')); }, type, quality); });
  };
  T.blobBytes = async function (blob) { return new Uint8Array(await blob.arrayBuffer()); };

  // ---------- downloads ----------
  var urls = {};
  T.offer = function (resultEl, data, filename, message, mime) {
    var key = resultEl.id || 'r';
    if (urls[key]) URL.revokeObjectURL(urls[key]);
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/pdf' });
    var url = urls[key] = URL.createObjectURL(blob);
    var a = resultEl.querySelector('a');
    a.href = url; a.download = filename;
    a.querySelector('span').textContent = 'Download ' + filename;
    resultEl.querySelector('p').textContent = message;
    resultEl.hidden = false;
    return blob;
  };
  T.zip = async function (files) {
    var z = new window.JSZip();
    files.forEach(function (f) { z.file(f.name, f.data); });
    return z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  };
  T.pad = function (n, total) { var s = String(n), w = String(total).length; while (s.length < w) s = '0' + s; return s; };

  // ---------- dropzones ----------
  T.wireDrop = function (input, onFiles) {
    var zone = input.closest('[data-drop]');
    input.addEventListener('change', function () { if (input.files.length) onFiles(Array.prototype.slice.call(input.files)); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function () { zone.classList.remove('is-over'); }); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files.length) onFiles(Array.prototype.slice.call(e.dataTransfer.files)); });
  };

  // One-PDF loader used by most tools. opts: input, nameEl, statusEl, onLoad({file, bytes, doc, n}), onReset()
  T.onePdf = function (opts) {
    var token = 0;
    T.wireDrop(opts.input, async function (files) {
      if (!T.need(opts.statusEl, ['PDFLib'])) return;
      var f = files[0], my = ++token;
      if (opts.onReset) opts.onReset();
      if (!T.isPdf(f)) { T.status(opts.statusEl, f.name + ' isn’t a PDF.', true); return; }
      T.status(opts.statusEl, 'Reading ' + f.name + '…');
      try {
        var bytes = await T.readBytes(f);
        var doc = await T.loadPdfLib(bytes);
        if (my !== token) return;
        var n = doc.getPageCount();
        if (opts.nameEl) opts.nameEl.textContent = f.name + ', ' + T.plural(n, 'page') + ', ' + T.mb(f.size);
        T.status(opts.statusEl, '');
        await opts.onLoad({ file: f, bytes: bytes, doc: doc, n: n, isCurrent: function () { return my === token; } });
      } catch (err) {
        if (my === token) T.status(opts.statusEl, 'Couldn’t open ' + f.name + ': ' + (err.message || err) + '.', true);
      }
    });
  };

  // ---------- ordering ----------
  T.move = function (list, from, to) {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
  };
  T.sortable = function (container, getList, onChange) {
    var from = -1;
    container.addEventListener('dragstart', function (e) {
      var el = e.target.closest('[data-key]'); if (!el) return;
      from = Array.prototype.indexOf.call(container.children, el);
      el.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(from)); } catch (err) {}
    });
    container.addEventListener('dragover', function (e) {
      if (from < 0) return;
      var el = e.target.closest('[data-key]'); if (!el) return;
      e.preventDefault();
      container.querySelectorAll('.is-target').forEach(function (n) { if (n !== el) n.classList.remove('is-target'); });
      el.classList.add('is-target');
    });
    container.addEventListener('drop', function (e) {
      if (from < 0) return;
      var el = e.target.closest('[data-key]'); if (!el) return;
      e.preventDefault();
      var to = Array.prototype.indexOf.call(container.children, el);
      T.move(getList(), from, to); onChange();
    });
    container.addEventListener('dragend', function () {
      from = -1;
      container.querySelectorAll('.is-dragging,.is-target').forEach(function (n) { n.classList.remove('is-dragging', 'is-target'); });
    });
  };
  T.keySeq = 0;

  // ---------- page ranges ----------
  T.toRanges = function (nums) {
    var out = [], s = null, p = null;
    nums.forEach(function (n) {
      if (s === null) { s = p = n; return; }
      if (n === p + 1) { p = n; return; }
      out.push(s === p ? '' + s : s + '-' + p); s = p = n;
    });
    if (s !== null) out.push(s === p ? '' + s : s + '-' + p);
    return out.join(', ');
  };
  // "1-3, 5, 8-" -> Set of page numbers
  T.parseRanges = function (text, max) {
    var set = new Set(), errors = [];
    text.split(/[,;\s]+/).filter(Boolean).forEach(function (tok) {
      var m = tok.match(/^(\d+)(?:-(\d*))?$/);
      if (!m) { errors.push(tok); return; }
      var a = parseInt(m[1], 10), b = m[2] === undefined ? a : (m[2] === '' ? max : parseInt(m[2], 10));
      if (a > b) { var t = a; a = b; b = t; }
      if (a < 1 || b > max) errors.push(tok);
      for (var i = Math.max(1, a); i <= Math.min(max, b); i++) set.add(i);
    });
    return { set: set, errors: errors };
  };
  // "1-3, 4-6, 7" -> [[1,2,3],[4,5,6],[7]] keeping each group separate (for split)
  T.parseGroups = function (text, max) {
    var groups = [], errors = [];
    text.split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (tok) {
      var m = tok.replace(/\s+/g, '').match(/^(\d+)(?:-(\d*))?$/);
      if (!m) { errors.push(tok); return; }
      var a = parseInt(m[1], 10), b = m[2] === undefined ? a : (m[2] === '' ? max : parseInt(m[2], 10));
      if (a > b) { var t = a; a = b; b = t; }
      if (a < 1 || b > max) { errors.push(tok); return; }
      var g = []; for (var i = a; i <= b; i++) g.push(i);
      groups.push(g);
    });
    return { groups: groups, errors: errors };
  };

  // ---------- page grid (thumbnails) ----------
  // mode 'select': click to toggle (opts.mark = 'tick' | 'cross'). mode 'arrange': per page tools (opts.move, opts.rotate, opts.remove).
  T.PageGrid = function (container, opts) {
    var self = this;
    this.container = container; this.opts = opts || {}; this.items = []; this.all = []; this.sel = new Set(); this.token = 0; this.n = 0;
    if (this.opts.mode === 'arrange' && this.opts.move !== false) {
      T.sortable(container, function () { return self.items; }, function () { self.render(); self.changed(); });
    }
  };
  T.PageGrid.prototype.changed = function () { if (this.opts.onChange) this.opts.onChange(this); };
  T.PageGrid.prototype.clear = function () { this.token++; this.container.innerHTML = ''; this.items = []; this.all = []; this.sel = new Set(); this.n = 0; };
  T.PageGrid.prototype.load = async function (bytes, n) {
    var self = this, o = this.opts, token = ++this.token;
    this.container.innerHTML = ''; this.items = []; this.sel = new Set(); this.n = n;
    for (var i = 0; i < n; i++) {
      var it = { key: ++T.keySeq, src: i, rot: 0 };
      var el;
      if (o.mode === 'select') {
        el = document.createElement('button');
        el.type = 'button'; el.className = 'pt-page'; el.dataset.page = i + 1; el.setAttribute('aria-pressed', 'false');
        el.innerHTML = '<span class="pt-tick" aria-hidden="true">' + T.ICON[o.mark === 'cross' ? 'cross' : 'tick'] + '</span><span class="pt-page__thumb"></span><span class="pt-page__num">Page ' + (i + 1) + '</span>';
        (function (p) { el.addEventListener('click', function () { if (self.sel.has(p)) self.sel.delete(p); else self.sel.add(p); self.sync(); self.changed(); }); })(i + 1);
      } else {
        el = document.createElement('div');
        el.className = 'pt-page'; el.dataset.key = it.key;
        if (o.move !== false) el.draggable = true;
        el.innerHTML = '<span class="pt-page__thumb"></span><span class="pt-page__num"></span><span class="pt-page__tools"></span>';
        var tools = el.querySelector('.pt-page__tools');
        (function (it) {
          if (o.move !== false) {
            var bl = T.iconBtn('left', 'Move earlier'); bl.dataset.l = '';
            bl.addEventListener('click', function () { var k = self.items.indexOf(it); T.move(self.items, k, k - 1); self.render(); self.changed(); });
            tools.appendChild(bl);
          }
          if (o.rotate !== false) {
            var rl = T.iconBtn('rotL', 'Rotate left'), rr = T.iconBtn('rotR', 'Rotate right');
            rl.addEventListener('click', function () { it.rot = (it.rot + 270) % 360; self.render(); self.changed(); });
            rr.addEventListener('click', function () { it.rot = (it.rot + 90) % 360; self.render(); self.changed(); });
            tools.append(rl, rr);
          }
          if (o.remove !== false) {
            var del = T.iconBtn('x', 'Remove page');
            del.addEventListener('click', function () { self.items.splice(self.items.indexOf(it), 1); self.render(); self.changed(); });
            tools.appendChild(del);
          }
          if (o.move !== false) {
            var br = T.iconBtn('right', 'Move later'); br.dataset.r = '';
            br.addEventListener('click', function () { var k = self.items.indexOf(it); T.move(self.items, k, k + 1); self.render(); self.changed(); });
            tools.appendChild(br);
          }
        })(it);
      }
      it.el = el;
      this.items.push(it);
      this.container.appendChild(el);
    }
    this.all = this.items.slice();
    this.render();
    if (o.mode === 'select') this.sync();
    try {
      var pd = await T.loadPdfJs(bytes);
      for (var k = 0; k < n; k++) {
        if (token !== this.token) break;
        var c = await T.renderThumb(pd, k + 1, 150);
        if (token !== this.token) break;
        this.all[k].el.querySelector('.pt-page__thumb').appendChild(c);
        this.all[k].canvas = c;
        this.styleThumb(this.all[k]);
      }
      pd.destroy();
    } catch (e) { /* thumbnails are a nicety */ }
  };
  T.PageGrid.prototype.styleThumb = function (it) {
    if (!it.canvas) return;
    it.canvas.style.transform = 'rotate(' + it.rot + 'deg)' + (it.rot % 180 ? ' scale(.74)' : '');
  };
  T.PageGrid.prototype.render = function () {
    var self = this;
    if (this.opts.mode === 'select') return;
    this.container.innerHTML = '';
    this.items.forEach(function (it, i) {
      self.container.appendChild(it.el);
      var label = 'Page ' + (i + 1);
      if (self.opts.move !== false && it.src !== i) label = (i + 1) + ' (was ' + (it.src + 1) + ')';
      if (it.rot) label += ', ' + it.rot + '°';
      it.el.querySelector('.pt-page__num').textContent = label;
      var l = it.el.querySelector('[data-l]'), r = it.el.querySelector('[data-r]');
      if (l) l.disabled = i === 0;
      if (r) r.disabled = i === self.items.length - 1;
      self.styleThumb(it);
    });
  };
  T.PageGrid.prototype.sync = function () {
    var self = this;
    this.container.querySelectorAll('.pt-page').forEach(function (b) { b.setAttribute('aria-pressed', self.sel.has(+b.dataset.page) ? 'true' : 'false'); });
  };
  T.PageGrid.prototype.selected = function () { return Array.from(this.sel).sort(function (a, b) { return a - b; }); };
  T.PageGrid.prototype.setSelected = function (set) { this.sel = new Set(set); this.sync(); };
  T.PageGrid.prototype.rotateAll = function (d) { this.items.forEach(function (it) { it.rot = (it.rot + d + 360) % 360; }); this.render(); this.changed(); };
  T.PageGrid.prototype.reset = function () { this.all.forEach(function (it) { it.rot = 0; }); this.items = this.all.slice(); this.render(); this.changed(); };
  T.PageGrid.prototype.isChanged = function () {
    var self = this;
    return this.items.length !== this.all.length || this.items.some(function (it, i) { return it.rot || it.src !== self.all.indexOf(it); });
  };

  // Link a text range box ("1-3, 5") to a select-mode grid, both ways.
  T.linkRange = function (input, grid, onChange) {
    input.addEventListener('input', function () {
      if (!grid.n) return;
      var r = T.parseRanges(input.value, grid.n);
      grid.setSelected(r.set);
      onChange(r.errors);
    });
    input.addEventListener('blur', function () { if (grid.n) input.value = T.toRanges(grid.selected()); });
    return function () { input.value = T.toRanges(grid.selected()); };
  };

  // Copy chosen pages (with optional extra rotation) into a new document.
  T.copyPages = async function (srcBytes, list) {
    var L = window.PDFLib;
    var src = await L.PDFDocument.load(srcBytes);
    var out = await L.PDFDocument.create();
    var copied = await out.copyPages(src, list.map(function (x) { return typeof x === 'number' ? x : x.src; }));
    copied.forEach(function (p, i) {
      var extra = typeof list[i] === 'number' ? 0 : (list[i].rot || 0);
      if (extra) p.setRotation(L.degrees(((p.getRotation().angle || 0) + extra) % 360));
      out.addPage(p);
    });
    return out;
  };

  // ---------- rotation-aware page geometry ----------
  // Visual coordinates: origin bottom-left of the page as it's shown (after /Rotate), in points.
  T.visualBox = function (page) {
    var box = page.getCropBox ? page.getCropBox() : page.getMediaBox();
    var r = (((page.getRotation().angle || 0) % 360) + 360) % 360;
    var x0 = box.x, y0 = box.y, W = box.width, H = box.height;
    var odd = r === 90 || r === 270;
    return {
      w: odd ? H : W, h: odd ? W : H, rot: r,
      toUser: function (vx, vy) {
        if (r === 90) return { x: x0 + W - vy, y: y0 + vx };
        if (r === 180) return { x: x0 + W - vx, y: y0 + H - vy };
        if (r === 270) return { x: x0 + vy, y: y0 + H - vx };
        return { x: x0 + vx, y: y0 + vy };
      }
    };
  };

  // WinAnsi check for the standard 14 fonts.
  var WIN_EXTRA = [0x152, 0x153, 0x160, 0x161, 0x178, 0x17D, 0x17E, 0x192, 0x2C6, 0x2DC, 0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203A, 0x20AC, 0x2122];
  T.isWinAnsi = function (ch) {
    var c = ch.codePointAt(0);
    return (c >= 0x20 && c <= 0x7E) || (c >= 0xA0 && c <= 0xFF) || WIN_EXTRA.indexOf(c) >= 0;
  };
  T.winAnsi = function (s) {
    return Array.from(String(s).replace(/\t/g, '    ').replace(/[­​-‍﻿]/g, '')).map(function (ch) {
      if (ch === '\n' || T.isWinAnsi(ch)) return ch;
      if (/[‐-‒―−]/.test(ch)) return '-';
      if (/[  -  ]/.test(ch)) return ' ';
      return '?';
    }).join('');
  };
  T.hexRgb = function (hex) {
    var m = String(hex || '').replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return window.PDFLib.rgb(0, 0, 0);
    return window.PDFLib.rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
  };

  // ---------- text from a PDF page (PDF.js) ----------
  // Returns lines top to bottom: { y, size, x, items:[{str,x,w,size,bold}], text }
  T.pageLines = async function (page, wantBold) {
    var tc = await page.getTextContent();
    var vp = page.getViewport({ scale: 1 });
    var boldOf = {};
    if (wantBold) {
      try {
        await page.getOperatorList();
        tc.items.forEach(function (it) {
          if (it.fontName && !(it.fontName in boldOf)) {
            var name = '';
            try { var f = page.commonObjs.get(it.fontName); name = (f && (f.name || f.loadedName)) || ''; } catch (e) {}
            boldOf[it.fontName] = /bold|black|heavy|semibold/i.test(name);
          }
        });
      } catch (e) {}
    }
    var items = [];
    tc.items.forEach(function (it) {
      if (!it.str || !it.str.trim() && !it.str.length) return;
      var tr = window.pdfjsLib.Util.transform(vp.transform, it.transform);
      var size = Math.hypot(tr[2], tr[3]) || Math.abs(it.transform[3]) || 10;
      items.push({ str: it.str, x: tr[4], y: tr[5], w: it.width * (vp.scale || 1), size: size, bold: !!boldOf[it.fontName] });
    });
    items.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var lines = [];
    items.forEach(function (it) {
      var line = null;
      for (var i = lines.length - 1; i >= 0 && i >= lines.length - 3; i--) {
        if (Math.abs(lines[i].y - it.y) < Math.max(2, Math.min(lines[i].size, it.size) * 0.45)) { line = lines[i]; break; }
      }
      if (!line) { line = { y: it.y, size: it.size, items: [] }; lines.push(line); }
      line.items.push(it);
      line.size = Math.max(line.size, it.size);
    });
    lines.forEach(function (l) {
      l.items.sort(function (a, b) { return a.x - b.x; });
      var text = '', prevEnd = null;
      l.items.forEach(function (it) {
        if (prevEnd !== null) {
          var gap = it.x - prevEnd;
          if (gap > it.size * 0.18 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' ';
        }
        text += it.str;
        prevEnd = it.x + it.w;
      });
      l.text = text.replace(/\s+$/, '');
      l.x = l.items.length ? l.items[0].x : 0;
      l.bold = l.items.length > 0 && l.items.every(function (it) { return it.bold || !it.str.trim(); });
    });
    lines.sort(function (a, b) { return a.y - b.y; });
    return lines.filter(function (l) { return l.text.trim(); });
  };

  // Year in footer etc. is handled by site.js. Make in-page "Copy" buttons work.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var el = document.getElementById(b.getAttribute('data-copy')); if (!el) return;
    var done = function () { var t = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = t; }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(el.value || el.textContent).then(done, function () { el.select && el.select(); });
    else { el.select && el.select(); }
  });
})();
