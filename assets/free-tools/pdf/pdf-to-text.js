/* PDF to text: pull the text layer out of every page, line by line. No OCR. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), out = $('textOut'), cur = null;

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; $('opts').hidden = true; $('textWrap').hidden = true; go.disabled = true; result.hidden = true; },
    onLoad: async function (d) { if (!T.need(st, ['pdfjsLib'])) return; cur = d; $('opts').hidden = false; go.disabled = false; T.status(st, 'Ready. ' + T.plural(d.n, 'page') + '.'); }
  });
  $('marks').addEventListener('change', function () { result.hidden = true; });

  go.addEventListener('click', async function () {
    if (!cur) return;
    go.disabled = true; result.hidden = true;
    try {
      var pd = await T.loadPdfJs(cur.bytes), parts = [], chars = 0, marks = $('marks').checked;
      for (var i = 1; i <= pd.numPages; i++) {
        T.status(st, 'Reading page ' + i + ' of ' + pd.numPages + '…');
        var page = await pd.getPage(i);
        var lines = await T.pageLines(page, false);
        var text = '', prev = null;
        lines.forEach(function (l) {
          if (prev && l.y - prev.y > Math.max(prev.size, l.size) * 1.9) text += '\n';
          text += l.text + '\n'; prev = l;
        });
        chars += text.replace(/\s/g, '').length;
        parts.push((marks ? '--- Page ' + i + ' ---\n\n' : '') + text.trim());
        page.cleanup();
        if (i % 5 === 0) await T.tick();
      }
      pd.destroy();
      var all = parts.join('\n\n') + '\n';
      out.value = all;
      $('textWrap').hidden = false;
      if (!chars) {
        T.status(st, 'No text found. This PDF is probably a scan or a picture of text, which needs OCR. This tool doesn’t do OCR.', true);
      } else {
        T.offer(result, new Blob([all], { type: 'text/plain;charset=utf-8' }), T.baseName(cur.file.name) + '.txt', 'Pulled ' + chars.toLocaleString('en-GB') + ' characters of text from ' + T.plural(cur.n, 'page') + '.');
        T.status(st, 'Done. Copy it from the box below or download the .txt file.');
      }
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
})();
