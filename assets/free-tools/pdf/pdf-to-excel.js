/* PDF to Excel: best-effort. Groups text into rows by position and into columns by gaps, then writes .xlsx with SheetJS. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), bar = $('progress'), cur = null;

  function progress(p) { bar.hidden = p == null; if (p != null) bar.firstElementChild.style.width = Math.round(p * 100) + '%'; }
  function oneSheet() { return ((document.querySelector('input[name="sheets"]:checked') || {}).value || 'page') === 'one'; }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; $('opts').hidden = true; $('previewWrap').hidden = true; go.disabled = true; result.hidden = true; progress(null); },
    onLoad: async function (d) { if (!T.need(st, ['pdfjsLib', 'XLSX'])) return; cur = d; $('opts').hidden = false; go.disabled = false; T.status(st, 'Ready. ' + T.plural(d.n, 'page') + '.'); }
  });
  document.querySelectorAll('input[name="sheets"], #numbers').forEach(function (el) { el.addEventListener('change', function () { result.hidden = true; }); });

  // Split a line's text items into cells wherever there's a wide gap.
  function cells(line) {
    var out = [], cell = null, prevEnd = null;
    line.items.forEach(function (it) {
      if (!it.str.trim()) return; // PDF.js adds space items that span column gaps; ignore them
      var gap = prevEnd === null ? Infinity : it.x - prevEnd;
      if (!cell || gap > Math.max(it.size * 0.9, 5)) { cell = { x: it.x, end: it.x + it.w, text: it.str.trim() }; out.push(cell); }
      else { cell.text += (gap > it.size * 0.15 ? ' ' : '') + it.str.trim(); cell.end = it.x + it.w; }
      prevEnd = it.x + it.w;
    });
    return out;
  }
  // Find column positions for a page: cluster left edges, and right edges for right-aligned numbers.
  function table(lines) {
    var rows = lines.map(cells), starts = [];
    var minX = Infinity, maxX = -Infinity;
    rows.forEach(function (r) { r.forEach(function (c) { minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.end); }); });
    var span = Math.max(1, maxX - minX);
    // Only rows that look like table rows (2+ cells) decide where the columns are; headings and paragraphs don't.
    rows.forEach(function (r) { if (r.length > 1) r.forEach(function (c) { if (c.end - c.x < span * 0.4) starts.push(c); }); });
    starts.sort(function (a, b) { return a.x - b.x; });
    var cols = [];
    starts.forEach(function (c) {
      var hit = null;
      for (var i = 0; i < cols.length; i++) {
        var col = cols[i];
        if (Math.abs(c.x - col.x) < 10 || Math.abs(c.end - col.end) < 6) { hit = col; break; }
      }
      if (hit) { hit.x = Math.min(hit.x, c.x); hit.end = Math.max(hit.end, c.end); hit.n++; }
      else cols.push({ x: c.x, end: c.end, n: 1 });
    });
    cols.sort(function (a, b) { return a.x - b.x; });
    // Merge columns that overlap after growing.
    var merged = [];
    cols.forEach(function (c) { var last = merged[merged.length - 1]; if (last && c.x < last.end - 2) { last.end = Math.max(last.end, c.end); last.n += c.n; } else merged.push(c); });
    if (!merged.length) merged.push({ x: minX, end: maxX, n: 1 });
    var wide = [];
    var grid = rows.map(function (r, ri) {
      if (r.length === 1 && r[0].end - r[0].x >= span * 0.4) { wide[ri] = true; return [r[0].text]; }
      var row = [];
      r.forEach(function (c) {
        var idx = 0, best = Infinity;
        merged.forEach(function (col, i) {
          var d = (c.x >= col.x - 2 && c.x <= col.end + 2) ? 0 : Math.min(Math.abs(c.x - col.x), Math.abs(c.end - col.end));
          if (d < best) { best = d; idx = i; }
        });
        while (row[idx] !== undefined && idx < merged.length + 20) idx++;
        row[idx] = c.text;
      });
      return row;
    });
    // A left-aligned heading over right-aligned numbers lands in two neighbouring columns that are
    // never both filled on the same row. Fold those pairs together when they sit close.
    var n = merged.length;
    for (var i = n - 2; i >= 0; i--) {
      var a = merged[i], b = merged[i + 1];
      if (b.x - a.end > 60) continue;
      var clash = grid.some(function (row, ri) { return !wide[ri] && row[i] !== undefined && row[i] !== '' && row[i + 1] !== undefined && row[i + 1] !== ''; });
      var both = grid.some(function (row, ri) { return !wide[ri] && row[i] !== undefined; }) && grid.some(function (row, ri) { return !wide[ri] && row[i + 1] !== undefined; });
      if (clash || !both) continue;
      grid.forEach(function (row, ri) {
        if (wide[ri]) return;
        if (row[i] === undefined || row[i] === '') row[i] = row[i + 1];
        row.splice(i + 1, 1);
      });
      a.end = Math.max(a.end, b.end); merged.splice(i + 1, 1);
    }
    return grid.map(function (row) {
      for (var k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = '';
      while (row.length && row[row.length - 1] === '') row.pop();
      return row;
    });
  }
  function toValue(s, numbers) {
    if (!numbers) return s;
    var t = s.replace(/^\((.*)\)$/, '-$1').replace(/[£$€\s]/g, '');
    if (/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t)) return parseFloat(t.replace(/,/g, ''));
    return s;
  }

  go.addEventListener('click', async function () {
    if (!cur) return;
    var X = window.XLSX, one = oneSheet(), numbers = $('numbers').checked;
    go.disabled = true; result.hidden = true; progress(0);
    try {
      var pd = await T.loadPdfJs(cur.bytes), wb = X.utils.book_new(), all = [], firstRows = null, cellsN = 0;
      for (var i = 1; i <= pd.numPages; i++) {
        T.status(st, 'Reading page ' + i + ' of ' + pd.numPages + '…');
        var page = await pd.getPage(i);
        var rows = table(await T.pageLines(page, false)).map(function (r) { return r.map(function (v) { return v === '' ? null : toValue(v, numbers); }); });
        page.cleanup();
        rows.forEach(function (r) { r.forEach(function (v) { if (v !== null) cellsN++; }); });
        if (!firstRows && rows.length) firstRows = rows;
        if (one) { if (all.length && rows.length) all.push([]); all = all.concat(rows); }
        else X.utils.book_append_sheet(wb, sheet(X, rows.length ? rows : [['(no text on this page)']]), 'Page ' + i);
        progress(i / pd.numPages);
        if (i % 4 === 0) await T.tick();
      }
      pd.destroy();
      if (!cellsN) { T.status(st, 'No text found. This PDF is probably a scan, which needs OCR. This tool doesn’t do OCR.', true); progress(null); go.disabled = false; return; }
      if (one) X.utils.book_append_sheet(wb, sheet(X, all), 'Sheet1');
      var out = X.write(wb, { type: 'array', bookType: 'xlsx' });
      T.offer(result, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), T.baseName(cur.file.name) + '.xlsx',
        'Made a spreadsheet with ' + cellsN.toLocaleString('en-GB') + ' filled cells from ' + T.plural(cur.n, 'page') + '. Check the columns before you rely on it.');
      preview(firstRows || []);
      T.status(st, 'Done. The preview shows the start of page 1.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    progress(null);
    go.disabled = false;
  });

  function sheet(X, rows) {
    var ws = X.utils.aoa_to_sheet(rows);
    var widths = [];
    rows.forEach(function (r) { r.forEach(function (v, i) { var l = v == null ? 0 : String(v).length; widths[i] = Math.max(widths[i] || 6, Math.min(60, l + 2)); }); });
    ws['!cols'] = widths.map(function (w) { return { wch: w || 6 }; });
    return ws;
  }
  function preview(rows) {
    var tb = $('preview'), html = '';
    rows.slice(0, 14).forEach(function (r) { html += '<tr>' + r.map(function (v) { return '<td>' + T.esc(v == null ? '' : v) + '</td>'; }).join('') + '</tr>'; });
    tb.innerHTML = html;
    $('previewWrap').hidden = !rows.length;
  }
})();
