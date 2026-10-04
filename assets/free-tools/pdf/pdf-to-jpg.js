/* PDF to JPG / PNG: render pages to images. One page downloads directly, more come as a zip. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), bar = $('progress'), cur = null;

  function fmt() { var r = document.querySelector('input[name="fmt"]:checked'); return r ? r.value : 'jpg'; }
  function progress(p) { bar.hidden = p == null; if (p != null) bar.firstElementChild.style.width = Math.round(p * 100) + '%'; }
  function pages() {
    if (!cur) return { list: [], errors: [] };
    var v = $('range').value.trim();
    if (!v) { var all = []; for (var i = 1; i <= cur.n; i++) all.push(i); return { list: all, errors: [] }; }
    var r = T.parseRanges(v, cur.n);
    return { list: Array.from(r.set).sort(function (a, b) { return a - b; }), errors: r.errors };
  }
  function sync() {
    $('qualityRow').hidden = fmt() !== 'jpg';
    result.hidden = true;
    if (!cur) return;
    var p = pages();
    go.disabled = !p.list.length;
    if (p.errors.length) T.status(st, 'Not sure about “' + p.errors.join(', ') + '”. This PDF has ' + T.plural(cur.n, 'page') + '.', true);
    else T.status(st, T.plural(p.list.length, 'page') + ' to convert' + (p.list.length > 1 ? ', delivered as one zip.' : '.'));
  }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; $('opts').hidden = true; go.disabled = true; result.hidden = true; progress(null); },
    onLoad: async function (d) { if (!T.need(st, ['pdfjsLib'])) return; cur = d; $('opts').hidden = false; sync(); }
  });
  document.querySelectorAll('input[name="fmt"], #dpi, #quality').forEach(function (el) { el.addEventListener('change', sync); });
  $('range').addEventListener('input', sync);

  go.addEventListener('click', async function () {
    var p = pages(); if (!cur || !p.list.length || p.errors.length) return;
    if (p.list.length > 1 && !T.need(st, ['JSZip'])) return;
    var f = fmt(), dpi = parseInt($('dpi').value, 10) || 150, q = parseFloat($('quality').value) || 0.85;
    var type = f === 'png' ? 'image/png' : 'image/jpeg', ext = f === 'png' ? 'png' : 'jpg';
    go.disabled = true; result.hidden = true; progress(0);
    try {
      var pd = await T.loadPdfJs(cur.bytes), files = [], base = T.baseName(cur.file.name);
      for (var i = 0; i < p.list.length; i++) {
        var n = p.list[i];
        T.status(st, 'Rendering page ' + n + ' (' + (i + 1) + ' of ' + p.list.length + ')…');
        var page = await pd.getPage(n), vp1 = page.getViewport({ scale: 1 });
        var scale = Math.min(dpi / 72, 8000 / Math.max(vp1.width, vp1.height));
        var c = await T.renderPage(pd, n, scale);
        var blob = await T.canvasBlob(c, type, f === 'png' ? undefined : q);
        c.width = c.height = 0;
        files.push({ name: base + '-page-' + T.pad(n, cur.n) + '.' + ext, data: blob });
        progress((i + 1) / p.list.length);
        await T.tick();
      }
      pd.destroy();
      if (files.length === 1) {
        T.offer(result, files[0].data, files[0].name, 'Page ' + p.list[0] + ' as a ' + ext.toUpperCase() + ', ' + T.mb(files[0].data.size) + '.');
      } else {
        T.status(st, 'Zipping…');
        var zip = await T.zip(files);
        T.offer(result, zip, base + '-' + ext + '.zip', T.plural(files.length, 'page') + ' as ' + ext.toUpperCase() + ' images in one zip, ' + T.mb(zip.size) + '.');
      }
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    progress(null);
    go.disabled = false;
  });
})();
