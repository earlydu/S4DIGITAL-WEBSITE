/* Add page numbers: stamp numbers on each page, in a chosen spot and style. Works on rotated pages too. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), cur = null;

  function label(fmt, n, total) {
    if (fmt === 'page') return 'Page ' + n;
    if (fmt === 'pageof') return 'Page ' + n + ' of ' + total;
    if (fmt === 'slash') return n + ' / ' + total;
    if (fmt === 'dash') return '- ' + n + ' -';
    return '' + n;
  }
  function sync() {
    result.hidden = true;
    if (!cur) return;
    var from = Math.min(cur.n, Math.max(1, parseInt($('from').value, 10) || 1));
    var start = parseInt($('start').value, 10); if (isNaN(start)) start = 1;
    var count = cur.n - from + 1;
    T.status(st, 'Numbering ' + T.plural(count, 'page') + ' (pages ' + from + ' to ' + cur.n + '), starting at ' + start + '. First label: “' + label($('fmt').value, start, start + count - 1) + '”.');
    go.disabled = false;
  }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; $('opts').hidden = true; go.disabled = true; result.hidden = true; },
    onLoad: async function (d) { cur = d; $('opts').hidden = false; $('from').max = d.n; sync(); }
  });
  ['pos', 'fmt', 'start', 'from', 'fontSize', 'margin', 'colour'].forEach(function (id) { $(id).addEventListener('input', sync); $(id).addEventListener('change', sync); });

  go.addEventListener('click', async function () {
    if (!cur) return;
    var L = window.PDFLib;
    go.disabled = true; T.status(st, 'Adding numbers…');
    try {
      var doc = await L.PDFDocument.load(cur.bytes);
      var font = await doc.embedFont(L.StandardFonts.Helvetica);
      var pages = doc.getPages(), total0 = pages.length;
      var from = Math.min(total0, Math.max(1, parseInt($('from').value, 10) || 1));
      var start = parseInt($('start').value, 10); if (isNaN(start)) start = 1;
      var size = parseFloat($('fontSize').value) || 11, margin = parseFloat($('margin').value) || 28;
      var pos = $('pos').value, fmt = $('fmt').value, color = T.hexRgb($('colour').value);
      var last = start + (total0 - from);
      for (var i = from - 1; i < total0; i++) {
        var page = pages[i], vb = T.visualBox(page);
        var text = label(fmt, start + (i - (from - 1)), last);
        var tw = font.widthOfTextAtSize(text, size);
        var vx = pos.indexOf('left') >= 0 ? margin : pos.indexOf('right') >= 0 ? vb.w - margin - tw : (vb.w - tw) / 2;
        var vy = pos.indexOf('top') === 0 ? vb.h - margin - size * 0.75 : margin;
        var u = vb.toUser(vx, vy);
        page.drawText(text, { x: u.x, y: u.y, size: size, font: font, color: color, rotate: L.degrees(vb.rot) });
      }
      var bytes = await doc.save();
      T.offer(result, bytes, T.baseName(cur.file.name) + '-numbered.pdf', 'Numbered ' + T.plural(total0 - from + 1, 'page') + ', ' + T.mb(bytes.length) + '.');
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
})();
