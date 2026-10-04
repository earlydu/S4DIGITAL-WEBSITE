/* Crop PDF: drag a box on the page, apply it to every page or just this one. Sets the crop box, so nothing is redrawn. */
(function () {
  'use strict';
  var renderTask = null;
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), cur = null, pd = null;
  var stage = $('stage'), canvas = $('pageCanvas'), box = $('cropBox');
  var pageNo = 1, k = 1, pageW = 0, pageH = 0, token = 0;
  // Crop as fractions of the visible page: left, top, right, bottom margins.
  var crop = { l: 0.08, t: 0.08, r: 0.08, b: 0.08 };
  var perPage = {}; // page number -> crop, when "this page only"

  function scope() { return (document.querySelector('input[name="scope"]:checked') || {}).value || 'all'; }
  function active() { return scope() === 'page' ? (perPage[pageNo] || (perPage[pageNo] = Object.assign({}, crop))) : crop; }

  function place() {
    var c = active(), w = stage.clientWidth, h = stage.clientHeight;
    box.style.left = (c.l * w) + 'px'; box.style.top = (c.t * h) + 'px';
    box.style.width = Math.max(10, (1 - c.l - c.r) * w) + 'px'; box.style.height = Math.max(10, (1 - c.t - c.b) * h) + 'px';
    var mm = function (f, dim) { return Math.round(f * dim * 25.4 / 72); };
    $('cropInfo').textContent = 'Trim: left ' + mm(c.l, pageW) + ' mm, top ' + mm(c.t, pageH) + ' mm, right ' + mm(c.r, pageW) + ' mm, bottom ' + mm(c.b, pageH) + ' mm.';
  }
  async function showPage(n) {
    if (!pd) return;
    pageNo = Math.max(1, Math.min(cur.n, n));
    var my = ++token;
    var page = await pd.getPage(pageNo), vp1 = page.getViewport({ scale: 1 });
    pageW = vp1.width; pageH = vp1.height;
    var avail = Math.min(680, stage.parentElement.clientWidth || 680);
    k = Math.min(avail / pageW, 820 / pageH);
    var dpr = Math.min(2, window.devicePixelRatio || 1), vp = page.getViewport({ scale: k * dpr });
    if (my !== token) return;
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    stage.style.width = canvas.style.width = (vp.width / dpr) + 'px';
    stage.style.height = canvas.style.height = (vp.height / dpr) + 'px';
    var g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
    if (renderTask) { try { renderTask.cancel(); } catch (e) {} }
    renderTask = page.render({ canvasContext: g, viewport: vp });
    try { await renderTask.promise; } catch (e) { if (e && e.name === 'RenderingCancelledException') return; throw e; }
    renderTask = null;
    if (my !== token) return;
    $('pageLabel').textContent = 'Page ' + pageNo + ' of ' + cur.n;
    $('prevPage').disabled = pageNo <= 1; $('nextPage').disabled = pageNo >= cur.n;
    place();
  }

  // Drag the box or its corners.
  (function () {
    var mode = null, sx, sy, start;
    box.addEventListener('pointerdown', function (e) {
      e.preventDefault(); box.setPointerCapture(e.pointerId);
      mode = e.target.dataset.h || 'move'; sx = e.clientX; sy = e.clientY; start = Object.assign({}, active());
    });
    box.addEventListener('pointermove', function (e) {
      if (!mode) return;
      var c = active(), dx = (e.clientX - sx) / stage.clientWidth, dy = (e.clientY - sy) / stage.clientHeight, min = 0.04;
      var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
      if (mode === 'move') {
        var bw = 1 - start.l - start.r, bh = 1 - start.t - start.b;
        c.l = clamp(start.l + dx, 0, 1 - bw); c.r = 1 - bw - c.l;
        c.t = clamp(start.t + dy, 0, 1 - bh); c.b = 1 - bh - c.t;
      } else {
        if (mode.indexOf('w') >= 0) c.l = clamp(start.l + dx, 0, 1 - start.r - min);
        if (mode.indexOf('e') >= 0) c.r = clamp(start.r - dx, 0, 1 - start.l - min);
        if (mode.indexOf('n') >= 0) c.t = clamp(start.t + dy, 0, 1 - start.b - min);
        if (mode.indexOf('s') >= 0) c.b = clamp(start.b - dy, 0, 1 - start.t - min);
      }
      result.hidden = true; place();
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) { box.addEventListener(ev, function () { mode = null; }); });
  })();

  function sync() {
    if (!cur) return;
    go.disabled = false;
    T.status(st, scope() === 'all' ? 'The same crop goes on all ' + T.plural(cur.n, 'page') + '. Drag the box or its corners.' : 'Cropping page ' + Object.keys(perPage).sort(function (a, b) { return a - b; }).join(', ') + ' only. Move between pages to set each one.');
  }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; perPage = {}; if (pd) { pd.destroy(); pd = null; } $('viewer').hidden = true; go.disabled = true; result.hidden = true; },
    onLoad: async function (d) {
      if (!T.need(st, ['pdfjsLib'])) return;
      cur = d; pd = await T.loadPdfJs(d.bytes);
      $('viewer').hidden = false;
      await showPage(1); sync();
    }
  });
  $('prevPage').addEventListener('click', function () { showPage(pageNo - 1).then(sync); });
  $('nextPage').addEventListener('click', function () { showPage(pageNo + 1).then(sync); });
  $('cropReset').addEventListener('click', function () { var c = active(); c.l = c.t = c.r = c.b = 0; result.hidden = true; place(); });
  document.querySelectorAll('input[name="scope"]').forEach(function (r) { r.addEventListener('change', function () { result.hidden = true; if (scope() === 'page') { perPage = {}; active(); } place(); sync(); }); });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (cur) showPage(pageNo); }, 200); });

  go.addEventListener('click', async function () {
    if (!cur) return;
    var L = window.PDFLib;
    go.disabled = true; T.status(st, 'Cropping…');
    try {
      var doc = await L.PDFDocument.load(cur.bytes), pages = doc.getPages(), done = 0;
      pages.forEach(function (page, i) {
        var c = scope() === 'all' ? crop : perPage[i + 1];
        if (!c || (c.l + c.t + c.r + c.b) === 0) return;
        var vb = T.visualBox(page);
        var a = vb.toUser(c.l * vb.w, c.b * vb.h), b = vb.toUser((1 - c.r) * vb.w, (1 - c.t) * vb.h);
        var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
        page.setCropBox(x, y, w, h);
        page.setMediaBox(x, y, w, h);
        done++;
      });
      if (!done) { T.status(st, 'Nothing to crop yet. Drag the box in from the edges.', true); go.disabled = false; return; }
      var bytes = await doc.save();
      T.offer(result, bytes, T.baseName(cur.file.name) + '-cropped.pdf', 'Cropped ' + T.plural(done, 'page') + ', ' + T.mb(bytes.length) + '.');
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'Cropping didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
})();
