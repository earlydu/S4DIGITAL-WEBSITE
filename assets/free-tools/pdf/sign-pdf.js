/* Sign PDF: draw, type or upload a signature, place it on any pages, save. */
(function () {
  'use strict';
  var renderTask = null;
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), cur = null, pd = null;
  var sig = null; // { url, bytes(promise), aspect }
  var stamps = [], pageNo = 1, pageW = 0, pageH = 0, k = 1, renderToken = 0;
  var stage = $('stage'), pageCanvas = $('pageCanvas');

  // ---------- signature sources ----------
  function trim(canvas) {
    var g = canvas.getContext('2d'), d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    var minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (var y = 0; y < canvas.height; y++) for (var x = 0; x < canvas.width; x++) {
      if (d[(y * canvas.width + x) * 4 + 3] > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX < 0) return null;
    var p = 6, w = maxX - minX + 1 + p * 2, h = maxY - minY + 1 + p * 2;
    var out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d').drawImage(canvas, minX - p, minY - p, w, h, 0, 0, w, h);
    return out;
  }
  function setSig(canvas) {
    var t = canvas && trim(canvas);
    if (!t) { sig = null; } else {
      sig = { url: t.toDataURL('image/png'), aspect: t.width / t.height };
      sig.bytes = T.canvasBlob(t, 'image/png').then(T.blobBytes);
    }
    stamps.forEach(function (s) { s.h = s.w / (sig ? sig.aspect : 3); });
    drawStamps(); sync();
  }
  function mode() { return (document.querySelector('input[name="sigMode"]:checked') || {}).value || 'draw'; }
  function showMode() {
    ['draw', 'type', 'upload'].forEach(function (m) { $('mode-' + m).hidden = mode() !== m; });
    refreshSig();
  }
  function refreshSig() {
    if (mode() === 'draw') setSig(padUsed ? pad : null);
    else if (mode() === 'type') typed();
    else setSig(uploaded);
  }

  // Draw pad
  var pad = $('pad'), pg = pad.getContext('2d'), drawing = false, padUsed = false, last = null;
  function sizePad() {
    var r = pad.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    if (!r.width) return;
    var keep = padUsed ? pad.toDataURL() : null;
    pad.width = Math.round(r.width * dpr); pad.height = Math.round(r.height * dpr);
    if (keep) { var im = new Image(); im.onload = function () { pg.drawImage(im, 0, 0, pad.width, pad.height); }; im.src = keep; }
  }
  function pt(e) { var r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) * pad.width / r.width, y: (e.clientY - r.top) * pad.height / r.height }; }
  pad.addEventListener('pointerdown', function (e) {
    e.preventDefault(); drawing = true; last = pt(e); pad.setPointerCapture(e.pointerId);
    pg.strokeStyle = $('sigColour').value; pg.fillStyle = pg.strokeStyle; pg.lineCap = 'round'; pg.lineJoin = 'round';
    pg.lineWidth = Math.max(2, pad.width / 260);
    pg.beginPath(); pg.arc(last.x, last.y, pg.lineWidth / 2, 0, Math.PI * 2); pg.fill();
  });
  pad.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = pt(e), mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    pg.beginPath(); pg.moveTo(last.lastMid ? last.lastMid.x : last.x, last.lastMid ? last.lastMid.y : last.y);
    pg.quadraticCurveTo(last.x, last.y, mid.x, mid.y); pg.stroke();
    p.lastMid = mid; last = p; padUsed = true;
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) { pad.addEventListener(ev, function () { if (drawing) { drawing = false; setSig(padUsed ? pad : null); } }); });
  $('padClear').addEventListener('click', function () { pg.clearRect(0, 0, pad.width, pad.height); padUsed = false; setSig(null); });
  $('sigColour').addEventListener('change', function () {
    if (mode() === 'type') typed();
  });

  // Typed
  async function typed() {
    var name = $('sigName').value.trim();
    if (!name) { setSig(null); return; }
    var fam = $('sigFont').value, colour = $('sigColour').value;
    try { await document.fonts.load('96px "' + fam + '"', name); } catch (e) {}
    var c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = '96px "' + fam + '", cursive';
    var w = Math.ceil(g.measureText(name).width) + 80;
    c.width = Math.min(4000, w); c.height = 220;
    g.font = '96px "' + fam + '", cursive'; g.fillStyle = colour; g.textBaseline = 'middle';
    g.fillText(name, 40, 110);
    $('typedPreview').src = c.toDataURL();
    $('typedPreview').hidden = false;
    setSig(c);
  }
  $('sigName').addEventListener('input', typed);
  $('sigFont').addEventListener('change', typed);

  // Upload
  var uploaded = null;
  $('sigUpload').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var url = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      var s = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      var c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
      var g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height);
      if ($('sigKnockout').checked) {
        var img = g.getImageData(0, 0, c.width, c.height), d = img.data;
        for (var i = 0; i < d.length; i += 4) { var lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; if (lum > 200) d[i + 3] = Math.max(0, Math.round((255 - lum) * 4.6)); }
        g.putImageData(img, 0, 0);
      }
      uploaded = c; URL.revokeObjectURL(url);
      $('uploadName').textContent = f.name;
      setSig(c);
    };
    im.onerror = function () { T.status(st, 'That image couldn’t be read. Try a PNG or JPG.', true); };
    im.src = url;
    this.value = '';
  });
  $('sigKnockout').addEventListener('change', function () { /* applies to the next upload */ });

  document.querySelectorAll('input[name="sigMode"]').forEach(function (r) { r.addEventListener('change', showMode); });

  // ---------- page viewer and stamps ----------
  async function showPage(n) {
    if (!pd) return;
    pageNo = Math.max(1, Math.min(cur.n, n));
    var my = ++renderToken;
    var page = await pd.getPage(pageNo), vp1 = page.getViewport({ scale: 1 });
    pageW = vp1.width; pageH = vp1.height;
    var avail = Math.min(760, stage.parentElement.clientWidth || 760);
    k = avail / pageW;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var vp = page.getViewport({ scale: k * dpr });
    if (my !== renderToken) return;
    pageCanvas.width = Math.round(vp.width); pageCanvas.height = Math.round(vp.height);
    pageCanvas.style.width = (vp.width / dpr) + 'px'; pageCanvas.style.height = (vp.height / dpr) + 'px';
    stage.style.width = (vp.width / dpr) + 'px'; stage.style.height = (vp.height / dpr) + 'px';
    var g = pageCanvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    if (renderTask) { try { renderTask.cancel(); } catch (e) {} }
    renderTask = page.render({ canvasContext: g, viewport: vp });
    try { await renderTask.promise; } catch (e) { if (e && e.name === 'RenderingCancelledException') return; throw e; }
    renderTask = null;
    if (my !== renderToken) return;
    $('pageLabel').textContent = 'Page ' + pageNo + ' of ' + cur.n;
    $('prevPage').disabled = pageNo <= 1; $('nextPage').disabled = pageNo >= cur.n;
    drawStamps();
  }
  function drawStamps() {
    stage.querySelectorAll('.sg-stamp').forEach(function (n) { n.remove(); });
    stamps.filter(function (s) { return s.page === pageNo; }).forEach(function (s) {
      var el = document.createElement('div');
      el.className = 'sg-stamp';
      el.style.left = (s.x * k) + 'px'; el.style.top = (s.y * k) + 'px'; el.style.width = (s.w * k) + 'px'; el.style.height = (s.h * k) + 'px';
      el.innerHTML = (sig ? '<img alt="" src="' + sig.url + '">' : '') + '<button type="button" class="sg-x" aria-label="Remove this signature">' + T.ICON.x + '</button><span class="sg-resize" aria-hidden="true"></span>';
      el.querySelector('.sg-x').addEventListener('click', function (e) { e.stopPropagation(); stamps.splice(stamps.indexOf(s), 1); drawStamps(); sync(); });
      dragify(el, s);
      stage.appendChild(el);
    });
  }
  function dragify(el, s) {
    var startX, startY, ox, oy, ow, resizing = false;
    el.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.sg-x')) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      resizing = !!e.target.closest('.sg-resize');
      startX = e.clientX; startY = e.clientY; ox = s.x; oy = s.y; ow = s.w;
      el.classList.add('is-active');
    });
    el.addEventListener('pointermove', function (e) {
      if (startX == null) return;
      var dx = (e.clientX - startX) / k, dy = (e.clientY - startY) / k;
      if (resizing) {
        s.w = Math.max(20, Math.min(pageW - s.x, ow + dx)); s.h = s.w / (sig ? sig.aspect : 3);
        if (s.y + s.h > pageH) { s.h = pageH - s.y; s.w = s.h * (sig ? sig.aspect : 3); }
      } else {
        s.x = Math.max(0, Math.min(pageW - s.w, ox + dx)); s.y = Math.max(0, Math.min(pageH - s.h, oy + dy));
      }
      el.style.left = (s.x * k) + 'px'; el.style.top = (s.y * k) + 'px'; el.style.width = (s.w * k) + 'px'; el.style.height = (s.h * k) + 'px';
      result.hidden = true;
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) { el.addEventListener(ev, function () { startX = null; el.classList.remove('is-active'); }); });
  }

  function sync() {
    go.disabled = !cur || !sig || !stamps.length;
    $('place').disabled = !cur || !sig;
    if (!cur) { T.status(st, sig ? 'Signature ready. Now add your PDF.' : ''); return; }
    if (!sig) T.status(st, 'Make your signature above first.');
    else if (!stamps.length) T.status(st, 'Press “Add signature to this page”, then drag it into place.');
    else {
      var pagesWith = Array.from(new Set(stamps.map(function (s) { return s.page; }))).sort(function (a, b) { return a - b; });
      T.status(st, T.plural(stamps.length, 'signature') + ' placed, on ' + (pagesWith.length === 1 ? 'page ' : 'pages ') + T.toRanges(pagesWith) + '. Drag to move, use the corner to resize.');
    }
  }

  $('place').addEventListener('click', function () {
    if (!cur || !sig) return;
    var w = Math.min(pageW * 0.3, 190), h = w / sig.aspect;
    stamps.push({ page: pageNo, w: w, h: h, x: pageW - w - pageW * 0.1, y: Math.max(0, pageH * 0.82 - h) });
    result.hidden = true; drawStamps(); sync();
  });
  $('prevPage').addEventListener('click', function () { showPage(pageNo - 1); });
  $('nextPage').addEventListener('click', function () { showPage(pageNo + 1); });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { sizePad(); if (cur) showPage(pageNo); }, 200); });

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; stamps = []; if (pd) { pd.destroy(); pd = null; } $('viewer').hidden = true; result.hidden = true; sync(); },
    onLoad: async function (d) {
      if (!T.need(st, ['pdfjsLib'])) return;
      cur = d; pd = await T.loadPdfJs(d.bytes);
      $('viewer').hidden = false;
      await showPage(1); sync();
    }
  });

  go.addEventListener('click', async function () {
    if (!cur || !sig || !stamps.length) return;
    var L = window.PDFLib;
    go.disabled = true; T.status(st, 'Signing…');
    try {
      var doc = await L.PDFDocument.load(cur.bytes);
      var img = await doc.embedPng(await sig.bytes);
      var pages = doc.getPages();
      stamps.forEach(function (s) {
        var page = pages[s.page - 1], vb = T.visualBox(page);
        var fx = vb.w / pageWOf(s.page), fy = vb.h / pageHOf(s.page);
        var w = s.w * fx, h = s.h * fy;
        var u = vb.toUser(s.x * fx, vb.h - s.y * fy - h);
        page.drawImage(img, { x: u.x, y: u.y, width: w, height: h, rotate: L.degrees(vb.rot) });
      });
      var bytes = await doc.save();
      T.offer(result, bytes, T.baseName(cur.file.name) + '-signed.pdf', 'Signed: ' + T.plural(stamps.length, 'signature') + ' added, ' + T.mb(bytes.length) + '.');
      T.status(st, 'Done. Check it over before you send it.');
    } catch (err) { T.status(st, 'Signing didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
  // Page sizes are read from PDF.js when a page is shown; stamps keep their page's size here.
  var sizes = {};
  function pageWOf(n) { return (sizes[n] || [pageW])[0]; }
  function pageHOf(n) { return (sizes[n] || [0, pageH])[1]; }
  var origShow = showPage;
  showPage = async function (n) { await origShow(n); sizes[pageNo] = [pageW, pageH]; };

  sizePad(); showMode(); sync();
})();
