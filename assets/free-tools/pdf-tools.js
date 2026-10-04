/* PDF tools: merge, extract, rotate & reorder, images to PDF. pdf-lib builds files, PDF.js draws thumbnails. All local. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PDFLib = window.PDFLib, pdfjsLib = window.pdfjsLib;

  if (pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var ICON = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    rotL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>',
    rotR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
    grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  // ---------- shared helpers ----------
  function libsReady(statusEl) {
    if (PDFLib && pdfjsLib) return true;
    status(statusEl, 'The PDF library didn’t load. Check your connection and refresh the page.', true);
    return false;
  }
  function status(el, msg, isErr) { el.textContent = msg || ''; el.classList.toggle('is-error', !!isErr); }
  function mb(n) { return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function baseName(name) { return (name || 'document').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'document'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function iconBtn(icon, label) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ft-btn ft-btn--icon'; b.innerHTML = ICON[icon]; b.setAttribute('aria-label', label); b.title = label;
    return b;
  }
  async function readBytes(file) { return new Uint8Array(await file.arrayBuffer()); }

  async function loadPdfLib(bytes) {
    try { return await PDFLib.PDFDocument.load(bytes); }
    catch (err) {
      if (/encrypt/i.test(err && err.message)) throw new Error('it’s password-protected or encrypted. Unlock it first');
      throw new Error('it doesn’t look like a valid PDF');
    }
  }
  function loadPdfJs(bytes) { return pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise; }

  async function renderThumb(doc, pageNum, maxDim) {
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
  }

  var urls = {};
  function offer(resultEl, bytes, filename, message, key) {
    if (urls[key]) URL.revokeObjectURL(urls[key]);
    var url = urls[key] = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    var a = resultEl.querySelector('a');
    a.href = url; a.download = filename;
    a.querySelector('span').textContent = 'Download ' + filename;
    resultEl.querySelector('p').textContent = message;
    resultEl.hidden = false;
  }

  function wireDrop(input, onFiles) {
    var zone = input.closest('[data-drop]');
    input.addEventListener('change', function () { if (input.files.length) onFiles(Array.prototype.slice.call(input.files)); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function () { zone.classList.remove('is-over'); }); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files.length) onFiles(Array.prototype.slice.call(e.dataTransfer.files)); });
  }

  // Drag to reorder: items are DOM nodes with data-key; list holds the state array.
  function sortable(container, getList, onChange) {
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
      move(getList(), from, to); onChange();
    });
    container.addEventListener('dragend', function () {
      from = -1;
      container.querySelectorAll('.is-dragging,.is-target').forEach(function (n) { n.classList.remove('is-dragging', 'is-target'); });
    });
  }
  function move(list, from, to) {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
  }
  var keySeq = 0;

  // ---------- tabs ----------
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.ft-tabs [role="tab"]'));
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
    try { history.replaceState(null, '', '#' + tab.id.replace('tab-', '')); } catch (e) {}
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') selectTab(tabs[(i + 1) % tabs.length], true);
      if (e.key === 'ArrowLeft') selectTab(tabs[(i - 1 + tabs.length) % tabs.length], true);
    });
  });
  var hashTab = $('tab-' + location.hash.slice(1));
  if (hashTab) selectTab(hashTab);

  // =========================================================
  // MERGE
  // =========================================================
  var merge = [], thumbQueue = Promise.resolve();
  var mergeList = $('mergeList'), mergeStatus = $('mergeStatus'), mergeGo = $('mergeGo'), mergeClear = $('mergeClear'), mergeResult = $('mergeResult');

  function mergeRender() {
    merge.forEach(function (m, i) {
      mergeList.appendChild(m.el);
      m.el.querySelector('[data-up]').disabled = i === 0;
      m.el.querySelector('[data-down]').disabled = i === merge.length - 1;
    });
    var ready = merge.filter(function (m) { return m.pages; });
    var pages = ready.reduce(function (n, m) { return n + m.pages; }, 0);
    mergeGo.disabled = ready.length < 2;
    mergeClear.hidden = !merge.length;
    if (!merge.length) status(mergeStatus, '');
    else if (ready.length < 2) status(mergeStatus, 'Add at least two PDFs to merge.');
    else status(mergeStatus, plural(ready.length, 'file') + ', ' + plural(pages, 'page') + ' in total. Drag or use the arrows to change the order.');
  }

  async function mergeAdd(files) {
    if (!libsReady(mergeStatus)) return;
    mergeResult.hidden = true;
    var bad = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { bad.push(f.name + ' isn’t a PDF'); continue; }
      var item = { key: ++keySeq, file: f, bytes: null, pages: 0 };
      var li = document.createElement('li');
      li.className = 'pt-item'; li.draggable = true; li.dataset.key = item.key;
      li.innerHTML = '<span class="pt-handle" aria-hidden="true">' + ICON.grip + '</span><span class="pt-mini"></span>' +
        '<span class="pt-meta"><strong>' + esc(f.name) + '</strong><span>Reading…</span></span><span class="pt-actions"></span>';
      var acts = li.querySelector('.pt-actions');
      var up = iconBtn('up', 'Move up'), down = iconBtn('down', 'Move down'), del = iconBtn('x', 'Remove');
      up.dataset.up = ''; down.dataset.down = '';
      acts.append(up, down, del);
      (function (item) {
        up.addEventListener('click', function () { var k = merge.indexOf(item); move(merge, k, k - 1); mergeRender(); });
        down.addEventListener('click', function () { var k = merge.indexOf(item); move(merge, k, k + 1); mergeRender(); });
        del.addEventListener('click', function () { merge.splice(merge.indexOf(item), 1); item.el.remove(); mergeResult.hidden = true; mergeRender(); });
      })(item);
      item.el = li;
      merge.push(item);
      mergeRender();
      try {
        item.bytes = await readBytes(f);
        var doc = await loadPdfLib(item.bytes);
        item.pages = doc.getPageCount();
        li.querySelector('.pt-meta span').textContent = plural(item.pages, 'page') + ', ' + mb(f.size);
        (function (bytes, li) {
          thumbQueue = thumbQueue.then(function () {
            return loadPdfJs(bytes).then(function (pd) { return renderThumb(pd, 1, 60).then(function (c) { li.querySelector('.pt-mini').appendChild(c); pd.destroy(); }); });
          }).catch(function () {});
        })(item.bytes, li);
      } catch (err) {
        merge.splice(merge.indexOf(item), 1); li.remove();
        bad.push(f.name + ' was skipped: ' + err.message);
      }
      mergeRender();
    }
    if (bad.length) status(mergeStatus, bad.join('. ') + '.', true);
  }

  async function mergeRun() {
    var ready = merge.filter(function (m) { return m.pages; });
    if (ready.length < 2) return;
    mergeGo.disabled = true;
    status(mergeStatus, 'Merging…');
    try {
      var out = await PDFLib.PDFDocument.create();
      for (var i = 0; i < ready.length; i++) {
        status(mergeStatus, 'Adding ' + ready[i].file.name + ' (' + (i + 1) + ' of ' + ready.length + ')…');
        var src = await PDFLib.PDFDocument.load(ready[i].bytes);
        var copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach(function (p) { out.addPage(p); });
      }
      var bytes = await out.save();
      var n = out.getPageCount();
      offer(mergeResult, bytes, 'merged.pdf', 'Merged ' + plural(ready.length, 'file') + ' into one PDF: ' + plural(n, 'page') + ', ' + mb(bytes.length) + '.', 'merge');
      status(mergeStatus, 'Done.');
    } catch (err) {
      status(mergeStatus, 'Merging didn’t work: ' + (err.message || err) + '.', true);
    }
    mergeGo.disabled = false;
  }

  wireDrop($('mergeFiles'), mergeAdd);
  sortable(mergeList, function () { return merge; }, function () { mergeResult.hidden = true; mergeRender(); });
  mergeGo.addEventListener('click', mergeRun);
  mergeClear.addEventListener('click', function () { merge.forEach(function (m) { m.el.remove(); }); merge = []; mergeResult.hidden = true; mergeRender(); });

  // =========================================================
  // EXTRACT
  // =========================================================
  var ex = { file: null, bytes: null, n: 0, sel: new Set(), token: 0 };
  var exPages = $('extractPages'), exRange = $('extractRange'), exStatus = $('extractStatus'), exGo = $('extractGo'), exResult = $('extractResult');

  function toRanges(nums) {
    var out = [], s = null, p = null;
    nums.forEach(function (n) {
      if (s === null) { s = p = n; return; }
      if (n === p + 1) { p = n; return; }
      out.push(s === p ? '' + s : s + '-' + p); s = p = n;
    });
    if (s !== null) out.push(s === p ? '' + s : s + '-' + p);
    return out.join(', ');
  }
  function parseRanges(text, max) {
    var set = new Set(), errors = [];
    text.split(/[,;\s]+/).filter(Boolean).forEach(function (tok) {
      var m = tok.match(/^(\d+)(?:-(\d*))?$/);
      if (!m) { errors.push(tok); return; }
      var a = parseInt(m[1], 10), b = m[2] === undefined ? a : (m[2] === '' ? max : parseInt(m[2], 10));
      if (a > b) { var t = a; a = b; b = t; }
      if (a < 1 || b > max) { errors.push(tok); }
      for (var i = Math.max(1, a); i <= Math.min(max, b); i++) set.add(i);
    });
    return { set: set, errors: errors };
  }
  function sortedSel() { return Array.from(ex.sel).sort(function (a, b) { return a - b; }); }
  function exSync(fromInput) {
    var list = sortedSel();
    exPages.querySelectorAll('.pt-page').forEach(function (b) { b.setAttribute('aria-pressed', ex.sel.has(+b.dataset.page) ? 'true' : 'false'); });
    if (!fromInput) exRange.value = toRanges(list);
    exGo.disabled = !list.length;
    if (ex.n) status(exStatus, list.length ? plural(list.length, 'page') + ' of ' + ex.n + ' selected.' : 'No pages selected yet.');
  }

  async function exLoad(files) {
    if (!libsReady(exStatus)) return;
    var f = files[0];
    var token = ++ex.token;
    exResult.hidden = true; exPages.innerHTML = ''; $('extractOpts').hidden = true; exGo.disabled = true;
    status(exStatus, 'Reading ' + f.name + '…');
    try {
      var bytes = await readBytes(f);
      var doc = await loadPdfLib(bytes);
      ex.file = f; ex.bytes = bytes; ex.n = doc.getPageCount(); ex.sel = new Set();
      $('extractName').textContent = f.name + ', ' + plural(ex.n, 'page');
      $('extractOpts').hidden = false;
      for (var i = 1; i <= ex.n; i++) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'pt-page'; b.dataset.page = i; b.setAttribute('aria-pressed', 'false');
        b.innerHTML = '<span class="pt-tick" aria-hidden="true">' + ICON.tick + '</span><span class="pt-page__thumb"></span><span class="pt-page__num">Page ' + i + '</span>';
        b.addEventListener('click', function () { var p = +this.dataset.page; if (ex.sel.has(p)) ex.sel.delete(p); else ex.sel.add(p); exResult.hidden = true; exSync(); });
        exPages.appendChild(b);
      }
      exSync();
      var pd = await loadPdfJs(bytes);
      for (var k = 1; k <= ex.n; k++) {
        if (token !== ex.token) break;
        var c = await renderThumb(pd, k, 150);
        var slot = exPages.querySelector('[data-page="' + k + '"] .pt-page__thumb');
        if (slot) slot.appendChild(c);
      }
      pd.destroy();
    } catch (err) {
      if (token === ex.token) { ex.n = 0; status(exStatus, 'Couldn’t open ' + f.name + ': ' + (err.message || err) + '.', true); }
    }
  }
  exRange.addEventListener('input', function () {
    if (!ex.n) return;
    var r = parseRanges(exRange.value, ex.n);
    ex.sel = r.set; exResult.hidden = true;
    exSync(true);
    if (r.errors.length) status(exStatus, 'Not sure about “' + r.errors.join(', ') + '”. This PDF has ' + plural(ex.n, 'page') + '.', true);
  });
  exRange.addEventListener('blur', function () { if (ex.n) exSync(); });
  function exPick(fn) { if (!ex.n) return; ex.sel = new Set(); for (var i = 1; i <= ex.n; i++) if (fn(i)) ex.sel.add(i); exResult.hidden = true; exSync(); }
  $('extractAll').addEventListener('click', function () { exPick(function () { return true; }); });
  $('extractOdd').addEventListener('click', function () { exPick(function (i) { return i % 2 === 1; }); });
  $('extractEven').addEventListener('click', function () { exPick(function (i) { return i % 2 === 0; }); });
  $('extractNone').addEventListener('click', function () { exPick(function () { return false; }); });

  exGo.addEventListener('click', async function () {
    var list = sortedSel(); if (!list.length) return;
    exGo.disabled = true; status(exStatus, 'Building your PDF…');
    try {
      var src = await PDFLib.PDFDocument.load(ex.bytes);
      var out = await PDFLib.PDFDocument.create();
      var copied = await out.copyPages(src, list.map(function (n) { return n - 1; }));
      copied.forEach(function (p) { out.addPage(p); });
      var bytes = await out.save();
      var label = toRanges(list).replace(/, /g, '_');
      if (label.length > 40) label = list.length + '-pages';
      var name = baseName(ex.file.name) + '-pages-' + label + '.pdf';
      offer(exResult, bytes, name, 'Saved ' + plural(list.length, 'page') + ' as a new PDF, ' + mb(bytes.length) + '.', 'extract');
      status(exStatus, 'Done.');
    } catch (err) { status(exStatus, 'That didn’t work: ' + (err.message || err) + '.', true); }
    exGo.disabled = false;
  });
  wireDrop($('extractFile'), exLoad);

  // =========================================================
  // ROTATE & REORDER
  // =========================================================
  var ar = { file: null, bytes: null, items: [], all: [], token: 0 };
  var arPages = $('arrangePages'), arStatus = $('arrangeStatus'), arGo = $('arrangeGo'), arResult = $('arrangeResult');

  function arRender() {
    arPages.innerHTML = '';
    ar.items.forEach(function (it, i) {
      arPages.appendChild(it.el);
      it.el.querySelector('.pt-page__num').textContent = (i + 1) + (it.src + 1 !== i + 1 ? ' (was ' + (it.src + 1) + ')' : '') + (it.rot ? ', ' + it.rot + '°' : '');
      it.el.querySelector('[data-l]').disabled = i === 0;
      it.el.querySelector('[data-r]').disabled = i === ar.items.length - 1;
      var odd = it.rot % 180 !== 0;
      var c = it.el.querySelector('canvas');
      if (c) c.style.transform = 'rotate(' + it.rot + 'deg)' + (odd ? ' scale(.74)' : '');
    });
    arGo.disabled = !ar.items.length;
    if (ar.file) {
      var changed = ar.items.length !== ar.all.length || ar.items.some(function (it, i) { return it.rot || it.src !== i; });
      status(arStatus, plural(ar.items.length, 'page') + (changed ? '. Changes ready to save.' : '. Nothing changed yet.'));
    }
  }
  function arTouch() { arResult.hidden = true; arRender(); }

  async function arLoad(files) {
    if (!libsReady(arStatus)) return;
    var f = files[0], token = ++ar.token;
    arResult.hidden = true; arPages.innerHTML = ''; arGo.disabled = true; $('arrangeAllRow').hidden = true;
    status(arStatus, 'Reading ' + f.name + '…');
    try {
      var bytes = await readBytes(f);
      var doc = await loadPdfLib(bytes);
      var n = doc.getPageCount();
      ar.file = f; ar.bytes = bytes; ar.items = [];
      $('arrangeName').textContent = f.name + ', ' + plural(n, 'page');
      $('arrangeAllRow').hidden = false;
      for (var i = 0; i < n; i++) {
        var it = { key: ++keySeq, src: i, rot: 0 };
        var card = document.createElement('div');
        card.className = 'pt-page'; card.draggable = true; card.dataset.key = it.key;
        card.innerHTML = '<span class="pt-page__thumb"></span><span class="pt-page__num"></span><span class="pt-page__tools"></span>';
        var tools = card.querySelector('.pt-page__tools');
        var bl = iconBtn('left', 'Move earlier'), rl = iconBtn('rotL', 'Rotate left'), rr = iconBtn('rotR', 'Rotate right'), del = iconBtn('x', 'Remove page'), br = iconBtn('right', 'Move later');
        bl.dataset.l = ''; br.dataset.r = '';
        tools.append(bl, rl, rr, del, br);
        (function (it) {
          bl.addEventListener('click', function () { var k = ar.items.indexOf(it); move(ar.items, k, k - 1); arTouch(); });
          br.addEventListener('click', function () { var k = ar.items.indexOf(it); move(ar.items, k, k + 1); arTouch(); });
          rl.addEventListener('click', function () { it.rot = (it.rot + 270) % 360; arTouch(); });
          rr.addEventListener('click', function () { it.rot = (it.rot + 90) % 360; arTouch(); });
          del.addEventListener('click', function () { ar.items.splice(ar.items.indexOf(it), 1); arTouch(); });
        })(it);
        it.el = card;
        ar.items.push(it);
      }
      ar.all = ar.items.slice();
      arRender();
      var pd = await loadPdfJs(bytes);
      for (var k = 0; k < ar.all.length; k++) {
        if (token !== ar.token) break;
        var c = await renderThumb(pd, k + 1, 150);
        ar.all[k].el.querySelector('.pt-page__thumb').appendChild(c);
        var r = ar.all[k].rot;
        c.style.transform = 'rotate(' + r + 'deg)' + (r % 180 ? ' scale(.74)' : '');
      }
      pd.destroy();
    } catch (err) {
      if (token === ar.token) { ar.file = null; status(arStatus, 'Couldn’t open ' + f.name + ': ' + (err.message || err) + '.', true); }
    }
  }
  $('arrangeRotAllL').addEventListener('click', function () { ar.items.forEach(function (it) { it.rot = (it.rot + 270) % 360; }); arTouch(); });
  $('arrangeRotAllR').addEventListener('click', function () { ar.items.forEach(function (it) { it.rot = (it.rot + 90) % 360; }); arTouch(); });
  $('arrangeReset').addEventListener('click', function () { ar.all.forEach(function (it) { it.rot = 0; }); ar.items = ar.all.slice(); arTouch(); });
  sortable(arPages, function () { return ar.items; }, arTouch);

  arGo.addEventListener('click', async function () {
    if (!ar.items.length) return;
    arGo.disabled = true; status(arStatus, 'Saving…');
    try {
      var src = await PDFLib.PDFDocument.load(ar.bytes);
      var out = await PDFLib.PDFDocument.create();
      var copied = await out.copyPages(src, ar.items.map(function (it) { return it.src; }));
      copied.forEach(function (p, i) {
        var angle = ((p.getRotation().angle || 0) + ar.items[i].rot) % 360;
        p.setRotation(PDFLib.degrees(angle));
        out.addPage(p);
      });
      var bytes = await out.save();
      var name = baseName(ar.file.name) + '-edited.pdf';
      offer(arResult, bytes, name, 'Saved ' + plural(ar.items.length, 'page') + ' in the new order, ' + mb(bytes.length) + '.', 'arrange');
      status(arStatus, 'Done.');
    } catch (err) { status(arStatus, 'Saving didn’t work: ' + (err.message || err) + '.', true); }
    arGo.disabled = false;
  });
  wireDrop($('arrangeFile'), arLoad);

  // =========================================================
  // IMAGES TO PDF
  // =========================================================
  var imgs = [];
  var imList = $('imagesList'), imStatus = $('imagesStatus'), imGo = $('imagesGo'), imClear = $('imagesClear'), imResult = $('imagesResult');

  function jpegOrientation(bytes) {
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1;
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), off = 2;
    while (off + 4 < dv.byteLength) {
      var marker = dv.getUint16(off); off += 2;
      if (marker === 0xFFE1) {
        if (dv.getUint32(off + 2) !== 0x45786966) return 1; // "Exif"
        var tiff = off + 8, little = dv.getUint16(tiff) === 0x4949;
        var ifd = tiff + dv.getUint32(tiff + 4, little), count = dv.getUint16(ifd, little);
        for (var i = 0; i < count; i++) {
          var e = ifd + 2 + i * 12;
          if (e + 10 > dv.byteLength) return 1;
          if (dv.getUint16(e, little) === 0x0112) return dv.getUint16(e + 8, little);
        }
        return 1;
      }
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
      off += dv.getUint16(off);
    }
    return 1;
  }
  function loadImage(url) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('couldn’t read it as an image')); }; im.src = url; });
  }
  function canvasJpeg(im) {
    var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0);
    return new Promise(function (res) { c.toBlob(function (b) { b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, 'image/jpeg', 0.92); });
  }

  function imRender() {
    imgs.forEach(function (m, i) {
      imList.appendChild(m.el);
      m.el.querySelector('[data-up]').disabled = i === 0;
      m.el.querySelector('[data-down]').disabled = i === imgs.length - 1;
      m.el.querySelector('.pt-meta span').textContent = 'Page ' + (i + 1) + ', ' + m.w + ' x ' + m.h + ', ' + mb(m.file.size);
    });
    imGo.disabled = !imgs.length;
    imClear.hidden = !imgs.length;
    if (imgs.length) status(imStatus, plural(imgs.length, 'image') + ', one per page. Drag or use the arrows to change the order.');
  }

  async function imAdd(files) {
    if (!libsReady(imStatus)) return;
    imResult.hidden = true;
    var bad = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png)$/i.test(f.name)) { bad.push(f.name + ' isn’t an image'); continue; }
      var url = URL.createObjectURL(f);
      try {
        var im = await loadImage(url);
        var bytes = await readBytes(f), kind;
        var isJpg = bytes[0] === 0xFF && bytes[1] === 0xD8, isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
        if (isPng) kind = 'png';
        else if (isJpg && jpegOrientation(bytes) === 1) kind = 'jpg';
        else { bytes = await canvasJpeg(im); kind = 'jpg'; } // rotated phone photos and other formats
        var item = { key: ++keySeq, file: f, bytes: bytes, kind: kind, w: im.naturalWidth, h: im.naturalHeight, url: url };
        var li = document.createElement('li');
        li.className = 'pt-item'; li.draggable = true; li.dataset.key = item.key;
        li.innerHTML = '<span class="pt-handle" aria-hidden="true">' + ICON.grip + '</span><span class="pt-mini"><img alt="" src="' + url + '"></span>' +
          '<span class="pt-meta"><strong>' + esc(f.name) + '</strong><span></span></span><span class="pt-actions"></span>';
        var up = iconBtn('up', 'Move up'), down = iconBtn('down', 'Move down'), del = iconBtn('x', 'Remove');
        up.dataset.up = ''; down.dataset.down = '';
        li.querySelector('.pt-actions').append(up, down, del);
        (function (item) {
          up.addEventListener('click', function () { var k = imgs.indexOf(item); move(imgs, k, k - 1); imResult.hidden = true; imRender(); });
          down.addEventListener('click', function () { var k = imgs.indexOf(item); move(imgs, k, k + 1); imResult.hidden = true; imRender(); });
          del.addEventListener('click', function () { imgs.splice(imgs.indexOf(item), 1); item.el.remove(); URL.revokeObjectURL(item.url); imResult.hidden = true; imRender(); if (!imgs.length) status(imStatus, ''); });
        })(item);
        item.el = li;
        imgs.push(item);
        imRender();
      } catch (err) {
        URL.revokeObjectURL(url);
        bad.push(f.name + ' was skipped: ' + err.message);
      }
    }
    if (bad.length) status(imStatus, bad.join('. ') + '.', true);
  }

  imGo.addEventListener('click', async function () {
    if (!imgs.length) return;
    imGo.disabled = true; status(imStatus, 'Building your PDF…');
    try {
      var A4 = [595.28, 841.89];
      var orient = $('imagesOrient').value, margin = parseFloat($('imagesMargin').value) || 0;
      var out = await PDFLib.PDFDocument.create();
      for (var i = 0; i < imgs.length; i++) {
        var m = imgs[i];
        var emb = m.kind === 'png' ? await out.embedPng(m.bytes) : await out.embedJpg(m.bytes);
        var land = orient === 'landscape' || (orient === 'auto' && m.w > m.h);
        var pw = land ? A4[1] : A4[0], ph = land ? A4[0] : A4[1];
        var s = Math.min((pw - 2 * margin) / emb.width, (ph - 2 * margin) / emb.height);
        var w = emb.width * s, h = emb.height * s;
        var page = out.addPage([pw, ph]);
        page.drawImage(emb, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      }
      var bytes = await out.save();
      offer(imResult, bytes, 'images.pdf', 'Made a ' + plural(imgs.length, 'page') + ' A4 PDF, ' + mb(bytes.length) + '.', 'images');
      status(imStatus, 'Done.');
    } catch (err) { status(imStatus, 'That didn’t work: ' + (err.message || err) + '.', true); }
    imGo.disabled = false;
  });
  ['imagesOrient', 'imagesMargin'].forEach(function (id) { $(id).addEventListener('change', function () { imResult.hidden = true; }); });
  wireDrop($('imagesFiles'), imAdd);
  sortable(imList, function () { return imgs; }, function () { imResult.hidden = true; imRender(); });
  imClear.addEventListener('click', function () { imgs.forEach(function (m) { m.el.remove(); URL.revokeObjectURL(m.url); }); imgs = []; imResult.hidden = true; imRender(); status(imStatus, ''); });

  if (!PDFLib || !pdfjsLib) {
    [mergeStatus, exStatus, arStatus, imStatus].forEach(function (el) { status(el, 'The PDF library didn’t load. Check your connection and refresh the page.', true); });
  }
})();
