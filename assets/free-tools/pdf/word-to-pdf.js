/* Word to PDF: mammoth.js turns the .docx into clean HTML, then S4Layout sets it as real PDF text with pdf-lib. */
(function () {
  'use strict';
  var T = window.S4T, S = window.S4Layout, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), cur = null;
  var HSIZE = [0, 21, 16.5, 14, 12.5, 11.5, 11];
  var BLUE = null;

  function isDocx(f) { return /\.docx$/i.test(f.name) || /officedocument\.wordprocessingml/.test(f.type); }

  T.wireDrop($('file'), async function (files) {
    var f = files[0];
    cur = null; result.hidden = true; go.disabled = true;
    if (/\.doc$/i.test(f.name)) { T.status(st, f.name + ' is the old .doc format. Open it in Word or Google Docs and save it as .docx first.', true); return; }
    if (!isDocx(f)) { T.status(st, f.name + ' isn’t a .docx file.', true); return; }
    if (!T.need(st, ['PDFLib', 'mammoth'])) return;
    $('fileName').textContent = f.name + ', ' + T.mb(f.size);
    cur = { file: f, buf: await f.arrayBuffer() };
    go.disabled = false;
    T.status(st, 'Ready to convert.');
  });

  // ---------- HTML -> blocks ----------
  function inline(node, style, sink) {
    node.childNodes.forEach(function (ch) {
      if (ch.nodeType === 3) { var t = ch.nodeValue.replace(/[ \t\r\n]+/g, ' '); if (t) sink.text(Object.assign({ text: t }, style)); return; }
      if (ch.nodeType !== 1) return;
      var tag = ch.tagName.toLowerCase(), s = Object.assign({}, style);
      if (tag === 'br') { sink.text({ text: '\n' }); return; }
      if (tag === 'img') { sink.img(ch); return; }
      if (tag === 'strong' || tag === 'b') s.bold = true;
      if (tag === 'em' || tag === 'i') s.italic = true;
      if (tag === 'u') s.underline = true;
      if (tag === 'a' && ch.getAttribute('href') && !/^#/.test(ch.getAttribute('href'))) { s.color = BLUE; s.underline = true; }
      if (tag === 'sup' || tag === 'sub') s.size = (style.size || 11) * 0.72;
      if (tag === 'ul' || tag === 'ol' || tag === 'table' || tag === 'p') return; // handled by the block walker
      inline(ch, s, sink);
    });
  }
  // Paragraph-like element -> one or more blocks (images split a paragraph).
  function paraBlocks(el, style, opts) {
    var out = [], runs = [];
    function flush(force) {
      while (runs.length && !runs[0].text.trim() && runs[0].text !== '\n') runs.shift();
      if (runs.length && runs[0].text !== '\n') runs[0] = Object.assign({}, runs[0], { text: runs[0].text.replace(/^ +/, '') });
      if (runs.length || force) out.push(Object.assign({ t: 'p', runs: runs.length ? runs : [{ text: ' ' }] }, opts));
      runs = [];
      opts = Object.assign({}, opts, { bullet: null });
    }
    inline(el, style, {
      text: function (r) { runs.push(r); },
      img: function (img) { flush(false); out.push({ t: 'img', src: img.getAttribute('src'), align: 'left' }); }
    });
    if (runs.length || !out.length) flush(!out.length);
    return out;
  }
  function listBlocks(list, level, out) {
    var n = parseInt(list.getAttribute('start'), 10) || 1, ordered = list.tagName.toLowerCase() === 'ol';
    Array.prototype.forEach.call(list.children, function (li) {
      if (li.tagName.toLowerCase() !== 'li') return;
      var bullet = ordered ? (n++) + '.' : (level % 2 ? '-' : '•');
      var opts = { size: 11, indent: 18 * level, bullet: bullet, spaceAfter: 3, lh: 1.32 };
      // Inline content of the li (not nested lists or paragraphs) first.
      var wrap = document.createElement('div');
      Array.prototype.forEach.call(li.childNodes, function (c) { if (!(c.nodeType === 1 && /^(ul|ol|p|table)$/i.test(c.tagName))) wrap.appendChild(c.cloneNode(true)); });
      var first = true;
      if (wrap.textContent.trim() || wrap.querySelector('img')) { paraBlocks(wrap, {}, opts).forEach(function (b) { out.push(b); }); first = false; }
      Array.prototype.forEach.call(li.children, function (c) {
        var tag = c.tagName.toLowerCase();
        if (tag === 'p') { paraBlocks(c, {}, Object.assign({}, opts, { bullet: first ? bullet : null })).forEach(function (b) { out.push(b); }); first = false; }
        else if (tag === 'ul' || tag === 'ol') listBlocks(c, level + 1, out);
        else if (tag === 'table') out.push(tableBlock(c));
      });
    });
  }
  function cellParas(cell) {
    var paras = [];
    function add(el, prefix) {
      var runs = [];
      if (prefix) runs.push({ text: prefix + ' ' });
      inline(el, cell.tagName.toLowerCase() === 'th' ? { bold: true } : {}, { text: function (r) { runs.push(r); }, img: function () {} });
      if (runs.length && runs.some(function (r) { return r.text.trim(); })) paras.push({ runs: runs });
    }
    var blockKids = Array.prototype.filter.call(cell.children, function (c) { return /^(p|ul|ol|h[1-6])$/i.test(c.tagName); });
    if (!blockKids.length) add(cell);
    blockKids.forEach(function (c) {
      if (/^(ul|ol)$/i.test(c.tagName)) Array.prototype.forEach.call(c.children, function (li, i) { add(li, /ol/i.test(c.tagName) ? (i + 1) + '.' : '•'); });
      else add(c);
    });
    if (!paras.length) paras.push({ runs: [{ text: '' }] });
    return paras;
  }
  function tableBlock(tbl) {
    var rows = [], headerRows = 0;
    Array.prototype.forEach.call(tbl.querySelectorAll('tr'), function (tr) {
      if (tr.closest('table') !== tbl) return;
      var cellsEl = Array.prototype.filter.call(tr.children, function (c) { return /^(td|th)$/i.test(c.tagName); });
      var header = !!tr.closest('thead') || (cellsEl.length > 0 && cellsEl.every(function (c) { return c.tagName.toLowerCase() === 'th'; }));
      if (header && rows.length === headerRows) headerRows++;
      rows.push({ header: header, cells: cellsEl.map(function (c) { return { span: parseInt(c.getAttribute('colspan'), 10) || 1, paras: cellParas(c) }; }) });
    });
    return { t: 'table', rows: rows, opts: { size: 9.5, headerRows: headerRows, spaceBefore: 6, spaceAfter: 10 } };
  }
  function toBlocks(root) {
    var out = [];
    Array.prototype.forEach.call(root.children, function (el) {
      var tag = el.tagName.toLowerCase(), m = tag.match(/^h([1-6])$/);
      if (m) {
        var sz = HSIZE[+m[1]];
        paraBlocks(el, { bold: true, size: sz }, { size: sz, spaceBefore: sz * 0.85, spaceAfter: sz * 0.35, keep: true, lh: 1.22 }).forEach(function (b) { out.push(b); });
      } else if (tag === 'p') {
        paraBlocks(el, {}, { size: 11, spaceAfter: 7, lh: 1.36 }).forEach(function (b) { out.push(b); });
      } else if (tag === 'ul' || tag === 'ol') { listBlocks(el, 0, out); out.push({ t: 'p', runs: [{ text: '' }], size: 4, lh: 1 }); }
      else if (tag === 'table') out.push(tableBlock(el));
      else if (tag === 'blockquote') paraBlocks(el, { italic: true }, { size: 11, indent: 24, spaceAfter: 7 }).forEach(function (b) { out.push(b); });
      else if (tag === 'hr') out.push({ t: 'hr' });
      else if (el.textContent.trim()) paraBlocks(el, {}, { size: 11, spaceAfter: 7 }).forEach(function (b) { out.push(b); });
    });
    return out;
  }

  go.addEventListener('click', async function () {
    if (!cur) return;
    var L = window.PDFLib;
    BLUE = L.rgb(0.1, 0.36, 0.78);
    go.disabled = true; result.hidden = true; T.status(st, 'Reading the Word file…');
    try {
      var res = await window.mammoth.convertToHtml({ arrayBuffer: cur.buf }, {
        styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Quote'] => blockquote:fresh", "p[style-name='Intense Quote'] => blockquote:fresh"]
      });
      var root = new DOMParser().parseFromString('<body>' + res.value + '</body>', 'text/html').body;
      var blocks = toBlocks(root);
      // Image sizes as set in Word (mammoth drops them): read <wp:extent> in document order.
      var extents = [];
      if (window.JSZip) {
        try {
          var dz = await window.JSZip.loadAsync(cur.buf), xml = await dz.file('word/document.xml').async('string');
          var re = /<wp:(?:inline|anchor)\b[\s\S]*?<wp:extent cx="(\d+)" cy="(\d+)"[\s\S]*?<\/wp:(?:inline|anchor)>/g, m;
          while ((m = re.exec(xml))) if (/<a:blip\b/.test(m[0])) extents.push([+m[1] / 12700, +m[2] / 12700]);
        } catch (e) { extents = []; }
      }
      var imgCount = blocks.filter(function (b) { return b.t === 'img'; }).length, imgIdx = 0;
      if (extents.length !== imgCount) extents = [];
      // Images: decode each into bytes pdf-lib can embed. Formats the browser can't draw (EMF, WMF) are skipped.
      var skipped = 0;
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.t !== 'img') continue;
        imgIdx++;
        try {
          var mime = (b.src.match(/^data:([^;]+)/) || [])[1] || '';
          var im = await S.imageBytes(b.src, mime);
          var ext = extents[imgIdx - 1];
          b.data = im.data; b.kind = im.kind; b.w = ext ? ext[0] : im.w * 0.75; b.h = ext ? ext[1] : im.h * 0.75;
        } catch (e) { b.t = 'skip'; skipped++; }
      }
      blocks = blocks.filter(function (b) { return b.t !== 'skip'; });
      if (!blocks.length) { T.status(st, 'That document looks empty.', true); go.disabled = false; return; }
      T.status(st, 'Setting the pages…');
      var m = parseFloat($('margin').value) || 64;
      var doc = await L.PDFDocument.create();
      doc.setTitle(cur.file.name.replace(/\.docx$/i, ''));
      var r = await S.render(doc, blocks, { size: S.PAGE[$('size').value] || S.PAGE.a4, margin: { top: m, bottom: m, left: m, right: m }, fontSize: 11 });
      var bytes = await doc.save();
      var note = (skipped + r.skippedImages) ? ' ' + T.plural(skipped + r.skippedImages, 'image') + ' in a format browsers can’t draw (like EMF) were left out.' : '';
      T.offer(result, bytes, T.baseName(cur.file.name) + '.pdf', 'Made a PDF with ' + T.plural(r.pages, 'page') + ', ' + T.mb(bytes.length) + '.' + note);
      T.status(st, 'Done. Give it a quick look before you send it.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '. If the file opens in Word, try saving it again as .docx.', true); }
    go.disabled = false;
  });
  ['size', 'margin'].forEach(function (id) { $(id).addEventListener('change', function () { result.hidden = true; }); });
})();
