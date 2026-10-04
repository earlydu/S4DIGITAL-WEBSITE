/* Compress PDF: redraw every page as a JPEG at a chosen resolution and rebuild the file. Text becomes part of the picture. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), bar = $('progress'), cur = null;
  var LEVELS = { small: { dpi: 72, q: 0.5 }, balanced: { dpi: 110, q: 0.66 }, quality: { dpi: 150, q: 0.8 } };

  function level() { var r = document.querySelector('input[name="level"]:checked'); return LEVELS[r ? r.value : 'balanced']; }
  function progress(p) { bar.hidden = p == null; if (p != null) bar.firstElementChild.style.width = Math.round(p * 100) + '%'; }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; $('opts').hidden = true; go.disabled = true; result.hidden = true; progress(null); },
    onLoad: async function (d) {
      if (!T.need(st, ['pdfjsLib'])) return;
      cur = d; $('opts').hidden = false; go.disabled = false;
      T.status(st, 'Ready. ' + T.plural(d.n, 'page') + ', ' + T.mb(d.file.size) + ' now.');
    }
  });
  document.querySelectorAll('input[name="level"], #grey').forEach(function (el) { el.addEventListener('change', function () { result.hidden = true; }); });

  go.addEventListener('click', async function () {
    if (!cur) return;
    var lv = level(), grey = $('grey').checked, L = window.PDFLib;
    go.disabled = true; result.hidden = true; progress(0);
    try {
      var pd = await T.loadPdfJs(cur.bytes);
      var out = await L.PDFDocument.create();
      for (var i = 1; i <= pd.numPages; i++) {
        T.status(st, 'Compressing page ' + i + ' of ' + pd.numPages + '…');
        var page = await pd.getPage(i);
        var vp1 = page.getViewport({ scale: 1 });
        // Keep very large pages (posters, plans) under a sane pixel count.
        var scale = Math.min(lv.dpi / 72, 4200 / Math.max(vp1.width, vp1.height));
        var c = await T.renderPage(pd, i, scale);
        if (grey) {
          var g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height), px = img.data;
          for (var k = 0; k < px.length; k += 4) { var y = px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114; px[k] = px[k + 1] = px[k + 2] = y; }
          g.putImageData(img, 0, 0);
        }
        var jpg = await T.blobBytes(await T.canvasBlob(c, 'image/jpeg', lv.q));
        c.width = c.height = 0;
        var emb = await out.embedJpg(jpg);
        var p = out.addPage([vp1.width, vp1.height]);
        p.drawImage(emb, { x: 0, y: 0, width: vp1.width, height: vp1.height });
        progress(i / pd.numPages);
        await T.tick();
      }
      pd.destroy();
      T.status(st, 'Saving…');
      var bytes = await out.save();
      var before = cur.file.size, after = bytes.length, pct = Math.round((1 - after / before) * 100);
      var name = T.baseName(cur.file.name) + '-compressed.pdf';
      if (after < before) {
        T.offer(result, bytes, name, 'From ' + T.mb(before) + ' to ' + T.mb(after) + ', ' + pct + '% smaller.');
        T.status(st, 'Done.');
      } else {
        T.offer(result, bytes, name, 'This one came out bigger (' + T.mb(after) + ' against ' + T.mb(before) + '), so keep your original.');
        T.status(st, 'Your PDF is already well compressed. Try “Small file” or Black and white, or keep the original.');
      }
    } catch (err) { T.status(st, 'Compressing didn’t work: ' + (err.message || err) + '.', true); }
    progress(null);
    go.disabled = false;
  });
})();
