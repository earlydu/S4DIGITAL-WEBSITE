/* Watermark PDF: a text watermark with size, colour, opacity and angle, once in the centre or tiled. Live preview of page 1. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), cur = null;
  var prev = $('preview'), base = null, pageW = 0, pageH = 0;

  function opts() {
    return {
      text: T.winAnsi($('wmText').value.trim() || 'CONFIDENTIAL').replace(/\n/g, ' '),
      size: parseFloat($('wmSize').value) || 60,
      opacity: (parseFloat($('wmOpacity').value) || 25) / 100,
      angle: parseFloat($('wmAngle').value) || 0,
      colour: $('wmColour').value || '#d33a2c',
      tiled: (document.querySelector('input[name="layout"]:checked') || {}).value === 'tiled'
    };
  }
  // Centres (in visual page points) where the text goes.
  function spots(o, w, h, tw) {
    if (!o.tiled) return [[w / 2, h / 2]];
    var out = [], stepX = Math.max(tw * 0.9, o.size * 3) + o.size * 1.5, stepY = o.size * 3.2, row = 0;
    for (var y = -h * 0.2; y < h * 1.2; y += stepY, row++) {
      for (var x = -w * 0.2 + (row % 2 ? stepX / 2 : 0); x < w * 1.2; x += stepX) out.push([x, y]);
    }
    return out;
  }
  function pages() {
    if (!cur) return [];
    var v = $('wmPages').value.trim();
    if (!v) { var a = []; for (var i = 1; i <= cur.n; i++) a.push(i); return a; }
    return Array.from(T.parseRanges(v, cur.n).set).sort(function (a, b) { return a - b; });
  }

  function drawPreview() {
    if (!base) return;
    var g = prev.getContext('2d'), o = opts();
    g.putImageData(base, 0, 0);
    var k = prev.width / pageW;
    g.save();
    g.globalAlpha = o.opacity; g.fillStyle = o.colour;
    g.font = 'bold ' + (o.size * k) + 'px Helvetica, Arial, sans-serif';
    g.textBaseline = 'middle'; g.textAlign = 'center';
    var tw = g.measureText(o.text).width / k;
    spots(o, pageW, pageH, tw).forEach(function (p) {
      g.save();
      g.translate(p[0] * k, prev.height - p[1] * k);
      g.rotate(-o.angle * Math.PI / 180);
      g.fillText(o.text, 0, 0);
      g.restore();
    });
    g.restore();
  }
  function sync() {
    result.hidden = true;
    drawPreview();
    if (!cur) return;
    var n = pages().length;
    go.disabled = !n;
    $('wmOpacityVal').textContent = Math.round(opts().opacity * 100) + '%';
    $('wmSizeVal').textContent = Math.round(opts().size) + ' pt';
    T.status(st, n ? 'Watermark goes on ' + T.plural(n, 'page') + '. The preview shows page 1.' : 'No pages match that range.', !n);
  }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; base = null; $('opts').hidden = true; go.disabled = true; result.hidden = true; },
    onLoad: async function (d) {
      cur = d; $('opts').hidden = false;
      try {
        var pd = await T.loadPdfJs(d.bytes), page = await pd.getPage(1), vp1 = page.getViewport({ scale: 1 });
        pageW = vp1.width; pageH = vp1.height;
        var c = await T.renderPage(pd, 1, Math.min(2, 520 / Math.max(pageW, pageH)) * Math.min(2, window.devicePixelRatio || 1));
        prev.width = c.width; prev.height = c.height;
        prev.style.aspectRatio = pageW + ' / ' + pageH;
        prev.getContext('2d').drawImage(c, 0, 0);
        base = prev.getContext('2d').getImageData(0, 0, c.width, c.height);
        pd.destroy();
      } catch (e) {}
      sync();
    }
  });
  ['wmText', 'wmSize', 'wmOpacity', 'wmAngle', 'wmColour', 'wmPages'].forEach(function (id) { $(id).addEventListener('input', sync); });
  document.querySelectorAll('input[name="layout"]').forEach(function (r) { r.addEventListener('change', sync); });

  go.addEventListener('click', async function () {
    if (!cur) return;
    var L = window.PDFLib, o = opts(), list = pages();
    if (!list.length) return;
    go.disabled = true; T.status(st, 'Adding the watermark…');
    try {
      var doc = await L.PDFDocument.load(cur.bytes);
      var font = await doc.embedFont(L.StandardFonts.HelveticaBold);
      var color = T.hexRgb(o.colour), a = o.angle * Math.PI / 180;
      var tw = font.widthOfTextAtSize(o.text, o.size), half = o.size * 0.35;
      var all = doc.getPages();
      list.forEach(function (n) {
        var page = all[n - 1], vb = T.visualBox(page);
        spots(o, vb.w, vb.h, tw).forEach(function (p) {
          // Start of the baseline so the text's middle lands on p.
          var sx = p[0] - (tw / 2) * Math.cos(a) + half * Math.sin(a);
          var sy = p[1] - (tw / 2) * Math.sin(a) - half * Math.cos(a);
          var u = vb.toUser(sx, sy);
          page.drawText(o.text, { x: u.x, y: u.y, size: o.size, font: font, color: color, opacity: o.opacity, rotate: L.degrees(o.angle + vb.rot) });
        });
      });
      var bytes = await doc.save();
      T.offer(result, bytes, T.baseName(cur.file.name) + '-watermarked.pdf', 'Watermarked ' + T.plural(list.length, 'page') + ', ' + T.mb(bytes.length) + '.');
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
})();
