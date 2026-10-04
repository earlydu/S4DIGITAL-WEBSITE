/* Excel to PDF: SheetJS reads the workbook, S4Layout draws each sheet as a real PDF table that fits the page. */
(function () {
  'use strict';
  var T = window.S4T, S = window.S4Layout, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), cur = null;

  function isSheet(f) { return /\.(xlsx|xlsm|xls|ods|csv)$/i.test(f.name); }

  T.wireDrop($('file'), async function (files) {
    var f = files[0];
    cur = null; result.hidden = true; go.disabled = true; $('opts').hidden = true;
    if (!isSheet(f)) { T.status(st, f.name + ' isn’t a spreadsheet. Use .xlsx, .xls, .ods or .csv.', true); return; }
    if (!T.need(st, ['PDFLib', 'XLSX'])) return;
    T.status(st, 'Reading ' + f.name + '…');
    try {
      var wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
      cur = { file: f, wb: wb };
      $('fileName').textContent = f.name + ', ' + T.plural(wb.SheetNames.length, 'sheet') + ', ' + T.mb(f.size);
      var list = $('sheetList');
      list.innerHTML = '';
      wb.SheetNames.forEach(function (name, i) {
        var hidden = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i] && wb.Workbook.Sheets[i].Hidden;
        var lab = document.createElement('label');
        lab.className = 'ft-check ft-check--inline';
        lab.innerHTML = '<input type="checkbox" value="' + i + '"' + (hidden ? '' : ' checked') + '><strong>' + T.esc(name) + (hidden ? ' (hidden)' : '') + '</strong>';
        list.appendChild(lab);
      });
      $('opts').hidden = false; go.disabled = false;
      T.status(st, 'Ready. Untick any sheets you don’t want.');
    } catch (err) { T.status(st, 'Couldn’t read ' + f.name + '. If it’s password-protected, remove the password first.', true); }
  });
  ['orient', 'size', 'headerRow', 'titles'].forEach(function (id) { $(id).addEventListener('change', function () { result.hidden = true; }); });

  function colLetter(c) { return window.XLSX.utils.encode_col(c); }

  // Sheet -> { rows: [[{text, num}]], cols: [col index] }
  function readSheet(ws) {
    var X = window.XLSX;
    if (!ws || !ws['!ref']) return null;
    var rg = X.utils.decode_range(ws['!ref']);
    var hiddenC = {}, hiddenR = {};
    (ws['!cols'] || []).forEach(function (c, i) { if (c && c.hidden) hiddenC[i] = true; });
    (ws['!rows'] || []).forEach(function (r, i) { if (r && r.hidden) hiddenR[i] = true; });
    var spans = {}, covered = {};
    (ws['!merges'] || []).forEach(function (m) {
      spans[m.s.r + ':' + m.s.c] = m.e.c - m.s.c + 1;
      for (var r = m.s.r; r <= m.e.r; r++) for (var c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered[r + ':' + c] = r === m.s.r ? 'h' : 'v';
    });
    var rows = [], lastRow = -1, lastCol = -1, cols = [];
    for (var c = rg.s.c; c <= rg.e.c; c++) if (!hiddenC[c]) cols.push(c);
    for (var r = rg.s.r; r <= rg.e.r; r++) {
      if (hiddenR[r]) continue;
      var row = { cells: [] };
      cols.forEach(function (c, ci) {
        var cell = ws[X.utils.encode_cell({ r: r, c: c })];
        var text = cell ? (cell.w != null ? cell.w : (cell.v == null ? '' : String(cell.v))) : '';
        var cov = covered[r + ':' + c];
        row.cells.push({ text: cov ? '' : text, num: cell && (cell.t === 'n' || cell.t === 'd'), span: spans[r + ':' + c] || 1, cov: cov });
        if (text.trim()) { lastCol = Math.max(lastCol, ci); }
      });
      rows.push(row);
      if (row.cells.some(function (x) { return x.text.trim(); })) lastRow = rows.length - 1;
    }
    if (lastRow < 0) return null;
    rows = rows.slice(0, lastRow + 1);
    cols = cols.slice(0, lastCol + 1);
    rows.forEach(function (row) { row.cells = row.cells.slice(0, lastCol + 1); });
    return { rows: rows, cols: cols };
  }

  go.addEventListener('click', async function () {
    if (!cur) return;
    var L = window.PDFLib, X = window.XLSX;
    var picked = Array.prototype.map.call($('sheetList').querySelectorAll('input:checked'), function (i) { return +i.value; });
    if (!picked.length) { T.status(st, 'Tick at least one sheet.', true); return; }
    go.disabled = true; result.hidden = true; T.status(st, 'Laying out the sheets…');
    try {
      var sheets = picked.map(function (i) { return { name: cur.wb.SheetNames[i], data: readSheet(cur.wb.Sheets[cur.wb.SheetNames[i]]) }; }).filter(function (s) { return s.data; });
      if (!sheets.length) { T.status(st, 'Those sheets are empty.', true); go.disabled = false; return; }
      var allText = sheets.map(function (s) { return s.name + ' ' + s.data.rows.map(function (r) { return r.cells.map(function (c) { return c.text; }).join(' '); }).join(' '); }).join(' ');
      var doc = await L.PDFDocument.create();
      doc.setTitle(cur.file.name.replace(/\.[^.]+$/, ''));
      var fonts = await S.loadFonts(doc, S.needsUnicode(allText));
      var paper = S.PAGE[$('size').value] || S.PAGE.a4, orient = $('orient').value, margin = 36;
      var header = $('headerRow').checked, titles = $('titles').checked;
      var pages = 0;

      for (var si = 0; si < sheets.length; si++) {
        var sh = sheets[si], rows = sh.data.rows, ncol = sh.data.cols.length;
        // Natural column widths at 9pt.
        var base = 9, pad9 = base * 0.45, nat = [];
        for (var c = 0; c < ncol; c++) nat[c] = 18;
        rows.forEach(function (r, ri) {
          r.cells.forEach(function (cell, ci) {
            if (cell.span > 1 || !cell.text) return;
            var m = S.measure([{ text: cell.text, bold: header && ri === 0 }], fonts, { size: base });
            nat[ci] = Math.max(nat[ci], m.nat + pad9 * 2 + 2);
          });
        });
        var portraitW = paper[0] - margin * 2, landW = paper[1] - margin * 2;
        var land = orient === 'landscape' || (orient === 'auto' && nat.reduce(function (a, b) { return a + Math.min(b, portraitW * 0.45); }, 0) > portraitW);
        var pageSize = land ? [paper[1], paper[0]] : paper, avail = pageSize[0] - margin * 2;
        var capped = nat.map(function (w) { return Math.min(w, avail * 0.45); });
        var total = capped.reduce(function (a, b) { return a + b; }, 0);
        var size = total > avail ? Math.max(6, base * avail / total) : base;
        var widths = capped.map(function (w) { return w * size / base; });
        // Still too wide at 6pt: split the columns into chunks that fit, one after another.
        var chunks = [], start = 0, acc = 0;
        widths.forEach(function (w, i) { if (acc + w > avail && i > start) { chunks.push([start, i]); start = i; acc = 0; } acc += w; });
        chunks.push([start, ncol]);

        var flow = new S.Flow(doc, fonts, { size: pageSize, margin: { top: margin, bottom: margin, left: margin, right: margin }, fontSize: size });
        chunks.forEach(function (ch, k) {
          if (k > 0) flow.newPage();
          if (titles) {
            var label = sh.name + (chunks.length > 1 ? ', columns ' + colLetter(sh.data.cols[ch[0]]) + ' to ' + colLetter(sh.data.cols[ch[1] - 1]) : '');
            flow.para([{ text: label, bold: true, size: 13 }], { size: 13, spaceAfter: 6, keep: true });
          }
          var trows = rows.map(function (r, ri) {
            var cells = [];
            for (var ci = ch[0]; ci < ch[1]; ci++) {
              var cell = r.cells[ci];
              if (cell.cov === 'h' && ci > ch[0]) continue;
              var span = Math.min(cell.span, ch[1] - ci);
              cells.push({ span: span, align: cell.num ? 'right' : 'left', paras: [{ runs: [{ text: cell.text, bold: header && ri === 0 }] }] });
            }
            return { header: header && ri === 0, cells: cells };
          });
          flow.table(trows, { size: size, pad: size * 0.45, headerRows: header ? 1 : 0, colWidths: widths.slice(ch[0], ch[1]), headFill: L.rgb(0.92, 0.94, 0.97), lh: 1.22 });
        });
        pages += flow.pages;
        await T.tick();
      }
      var bytes = await doc.save();
      T.offer(result, bytes, T.baseName(cur.file.name) + '.pdf', 'Made a PDF of ' + T.plural(pages, 'page') + ' from ' + T.plural(sheets.length, 'sheet') + ', ' + T.mb(bytes.length) + '.');
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
})();
