/* PDF to Word: text per page with PDF.js, rebuilt as an editable .docx with the docx library. Layout isn't kept. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), bar = $('progress'), cur = null;

  function progress(p) { bar.hidden = p == null; if (p != null) bar.firstElementChild.style.width = Math.round(p * 100) + '%'; }
  function flow() { return ((document.querySelector('input[name="flow"]:checked') || {}).value || 'para') === 'para'; }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; $('opts').hidden = true; go.disabled = true; result.hidden = true; progress(null); },
    onLoad: async function (d) { if (!T.need(st, ['pdfjsLib', 'docx'])) return; cur = d; $('opts').hidden = false; go.disabled = false; T.status(st, 'Ready. ' + T.plural(d.n, 'page') + '.'); }
  });
  document.querySelectorAll('input[name="flow"], #breaks').forEach(function (el) { el.addEventListener('change', function () { result.hidden = true; }); });

  function bodySize(pages) {
    var count = {};
    pages.forEach(function (lines) { lines.forEach(function (l) { var s = Math.round(l.size * 2) / 2; count[s] = (count[s] || 0) + l.text.length; }); });
    var best = 11, max = -1;
    Object.keys(count).forEach(function (s) { if (count[s] > max) { max = count[s]; best = parseFloat(s); } });
    return best;
  }

  go.addEventListener('click', async function () {
    if (!cur) return;
    var D = window.docx, joinLines = flow(), breaks = $('breaks').checked;
    go.disabled = true; result.hidden = true; progress(0);
    try {
      var pd = await T.loadPdfJs(cur.bytes), pages = [];
      for (var i = 1; i <= pd.numPages; i++) {
        T.status(st, 'Reading page ' + i + ' of ' + pd.numPages + '…');
        var page = await pd.getPage(i);
        pages.push(await T.pageLines(page, true));
        page.cleanup();
        progress(i / pd.numPages * 0.85);
        if (i % 4 === 0) await T.tick();
      }
      pd.destroy();
      var body = bodySize(pages), chars = 0, children = [];
      pages.forEach(function (lines, pi) {
        var paras = [], p = null;
        lines.forEach(function (l, li) {
          chars += l.text.replace(/\s/g, '').length;
          var prev = lines[li - 1];
          var bullet = /^\s*([•▪●‣⁃\-*]|\d{1,3}[.)])\s+/.test(l.text);
          var newPara = !joinLines || !p || !prev ||
            (l.y - prev.y) > Math.max(prev.size, l.size) * 1.75 ||
            Math.abs(l.size - p.size) > p.size * 0.12 || l.bold !== p.bold || bullet;
          if (newPara) { p = { text: l.text, size: l.size, bold: l.bold }; paras.push(p); }
          else if (/[A-Za-z]-$/.test(p.text) && /^[a-z]/.test(l.text)) p.text = p.text.slice(0, -1) + l.text;
          else p.text += ' ' + l.text.trim();
        });
        if (!paras.length) paras.push({ text: '', size: body, bold: false, empty: true });
        paras.forEach(function (pp, k) {
          var ratio = pp.size / body, heading;
          if (pp.text.length < 160) {
            if (ratio >= 1.6) heading = D.HeadingLevel.HEADING_1;
            else if (ratio >= 1.25) heading = D.HeadingLevel.HEADING_2;
            else if (ratio >= 1.1 && pp.bold) heading = D.HeadingLevel.HEADING_3;
          }
          var half = Math.max(12, Math.min(96, Math.round(pp.size * 2)));
          children.push(new D.Paragraph({
            heading: heading,
            pageBreakBefore: breaks && pi > 0 && k === 0,
            spacing: { after: joinLines ? 140 : 0 },
            children: [new D.TextRun({ text: pp.text, bold: pp.bold || undefined, size: heading ? undefined : half })]
          }));
        });
      });
      if (!chars) { T.status(st, 'No text found. This PDF is probably a scan, which needs OCR. This tool doesn’t do OCR.', true); progress(null); go.disabled = false; return; }
      T.status(st, 'Building the Word file…');
      var doc = new D.Document({
        creator: 's4digital free PDF tools', title: T.baseName(cur.file.name),
        styles: { default: { document: { run: { font: 'Calibri' } } } },
        sections: [{ properties: {}, children: children }]
      });
      var blob = await D.Packer.toBlob(doc);
      T.offer(result, blob, T.baseName(cur.file.name) + '.docx', 'Made an editable Word file from ' + T.plural(cur.n, 'page') + ', ' + T.mb(blob.size) + '.', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      T.status(st, 'Done. Expect to tidy up the formatting in Word.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    progress(null);
    go.disabled = false;
  });
})();
