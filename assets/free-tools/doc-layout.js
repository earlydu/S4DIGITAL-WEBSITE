/* s4digital PDF suite: a small text layout engine on top of pdf-lib.
   Lays out paragraphs, lists, tables and images as real (selectable) PDF text.
   Used by Word, Excel and PowerPoint to PDF. Exposes window.S4Layout. */
(function () {
  'use strict';
  var S = window.S4Layout = {};
  var T = window.S4T;

  S.PAGE = { a4: [595.28, 841.89], letter: [612, 792] };

  // ---------- fonts ----------
  var FONT_BASE = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/';
  var FONT_FILES = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans-Oblique.ttf', 'DejaVuSans-BoldOblique.ttf'];
  var fontCache = null;
  var SOFT = /[‐-‒―−  -  ­​-‍﻿\t\n\r]/;

  S.needsUnicode = function (text) {
    var chars = Array.from(String(text));
    for (var i = 0; i < chars.length; i++) if (!T.isWinAnsi(chars[i]) && !SOFT.test(chars[i])) return true;
    return false;
  };

  // Standard Helvetica unless the text needs characters it can't show, then DejaVu Sans (Latin, Greek, Cyrillic).
  S.loadScript = function (src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('script')); };
      document.head.appendChild(s);
    });
  };
  S.loadFonts = async function (doc, needUnicode) {
    if (needUnicode) {
      try {
        if (!window.fontkit) await S.loadScript('https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js');
        if (!fontCache) {
          fontCache = await Promise.all(FONT_FILES.map(function (n) {
            return fetch(FONT_BASE + n).then(function (r) { if (!r.ok) throw new Error('font'); return r.arrayBuffer(); });
          }));
        }
        doc.registerFontkit(window.fontkit);
        var f = await Promise.all(fontCache.map(function (b) { return doc.embedFont(b, { subset: true }); }));
        return { r: f[0], b: f[1], i: f[2], bi: f[3], unicode: true };
      } catch (e) { fontCache = null; }
    }
    var SF = window.PDFLib.StandardFonts;
    return {
      r: await doc.embedFont(SF.Helvetica), b: await doc.embedFont(SF.HelveticaBold),
      i: await doc.embedFont(SF.HelveticaOblique), bi: await doc.embedFont(SF.HelveticaBoldOblique), unicode: false
    };
  };

  function clean(text, fonts) {
    var s = String(text).replace(/\r\n?/g, '\n');
    if (fonts.unicode) return s.replace(/\t/g, '    ').replace(/[­​-‍﻿]/g, '');
    return T.winAnsi(s);
  }
  function fontFor(fonts, run) { return run.bold ? (run.italic ? fonts.bi : fonts.b) : (run.italic ? fonts.i : fonts.r); }
  function width(font, text, size) { try { return font.widthOfTextAtSize(text, size); } catch (e) { return text.length * size * 0.5; } }

  // ---------- line breaking ----------
  // runs: [{text, bold, italic, underline, size, color}] -> lines [{pieces:[{text,font,size,color,underline,w}], w, size}]
  S.wrap = function (runs, maxW, fonts, def) {
    def = def || {};
    var lines = [], line = null;
    function newLine() { line = { pieces: [], w: 0, size: 0 }; }
    function finish() {
      while (line.pieces.length && !line.pieces[line.pieces.length - 1].text.trim()) line.w -= line.pieces.pop().w;
      var last = line.pieces[line.pieces.length - 1];
      if (last && /\s+$/.test(last.text)) { var t = last.text.replace(/\s+$/, ''); line.w -= last.w - width(last.font, t, last.size); last.w = width(last.font, t, last.size); last.text = t; }
      lines.push(line); newLine();
    }
    function add(text, st, w) {
      var last = line.pieces[line.pieces.length - 1];
      if (last && last.font === st.font && last.size === st.size && last.color === st.color && last.underline === st.underline) { last.text += text; last.w += w; }
      else line.pieces.push({ text: text, font: st.font, size: st.size, color: st.color, underline: st.underline, w: w });
      line.w += w; line.size = Math.max(line.size, st.size);
    }
    newLine();
    runs.forEach(function (run) {
      var st = { font: fontFor(fonts, run), size: run.size || def.size || 11, color: run.color || def.color, underline: !!run.underline };
      line.size = Math.max(line.size, st.size);
      clean(run.text == null ? '' : run.text, fonts).split(/(\n| +)/).forEach(function (tok) {
        if (!tok) return;
        if (tok === '\n') { finish(); line.size = st.size; return; }
        var isSpace = /^ +$/.test(tok);
        if (isSpace && !line.pieces.length) return;
        var w = width(st.font, tok, st.size);
        if (!isSpace && line.pieces.length && line.w + w > maxW) finish();
        if (!isSpace && w > maxW) {
          var chunk = '';
          Array.from(tok).forEach(function (ch) {
            var cw = width(st.font, chunk + ch, st.size);
            if (line.w + cw > maxW && (chunk || line.pieces.length)) {
              if (chunk) add(chunk, st, width(st.font, chunk, st.size));
              finish(); chunk = ch;
            } else chunk += ch;
          });
          if (chunk) add(chunk, st, width(st.font, chunk, st.size));
          return;
        }
        add(tok, st, w);
      });
    });
    if (line.pieces.length || !lines.length) finish();
    lines.forEach(function (l) { if (!l.size) l.size = def.size || 11; });
    return lines;
  };

  // Widest single line (no wrapping) and longest word, for table column sizing.
  S.measure = function (runs, fonts, def) {
    var nat = 0, min = 0, cur = 0;
    runs.forEach(function (run) {
      var font = fontFor(fonts, run), size = run.size || def.size || 11;
      clean(run.text == null ? '' : run.text, fonts).split(/(\n)/).forEach(function (part) {
        if (part === '\n') { nat = Math.max(nat, cur); cur = 0; return; }
        cur += width(font, part, size);
        part.split(/ +/).forEach(function (w) { if (w) min = Math.max(min, width(font, w, size)); });
      });
    });
    return { nat: Math.max(nat, cur), min: min };
  };

  S.drawLine = function (page, line, x, baseline, w, align) {
    var dx = align === 'center' ? (w - line.w) / 2 : align === 'right' ? (w - line.w) : 0;
    var cx = x + Math.max(0, dx);
    line.pieces.forEach(function (p) {
      if (p.text.trim()) page.drawText(p.text, { x: cx, y: baseline, size: p.size, font: p.font, color: p.color });
      if (p.underline && p.text.trim()) page.drawLine({ start: { x: cx, y: baseline - p.size * 0.13 }, end: { x: cx + p.w, y: baseline - p.size * 0.13 }, thickness: Math.max(0.5, p.size / 16), color: p.color });
      cx += p.w;
    });
  };
  S.lineH = function (line, lh) { return line.size * (lh || 1.3); };

  // ---------- flowing document ----------
  S.Flow = function (doc, fonts, o) {
    this.doc = doc; this.fonts = fonts;
    this.pw = o.size[0]; this.ph = o.size[1];
    this.m = o.margin; this.base = o.fontSize || 11;
    this.black = window.PDFLib.rgb(0.07, 0.07, 0.08);
    this.pages = 0;
    this.newPage();
  };
  var F = S.Flow.prototype;
  F.newPage = function () { this.page = this.doc.addPage([this.pw, this.ph]); this.y = this.ph - this.m.top; this.top = true; this.pages++; };
  F.width = function () { return this.pw - this.m.left - this.m.right; };
  F.full = function () { return this.ph - this.m.top - this.m.bottom; };
  F.room = function () { return this.y - this.m.bottom; };
  F.gap = function (h) { if (this.top || !h) return; this.y -= h; if (this.y < this.m.bottom) this.newPage(); };

  // o: size, align, indent, bullet, spaceBefore, spaceAfter, keep (keep with next), lh
  F.para = function (runs, o) {
    o = o || {};
    var size = o.size || this.base, lh = o.lh || 1.32;
    var indent = o.indent || 0, bw = o.bullet ? Math.max(14, size * 1.4) : 0;
    var x = this.m.left + indent + bw, w = this.width() - indent - bw;
    var lines = S.wrap(runs, w, this.fonts, { size: size, color: o.color || this.black });
    var firstH = S.lineH(lines[0], lh);
    this.gap(o.spaceBefore || 0);
    var need = firstH + (o.keep ? size * 3.2 : 0);
    if (!this.top && this.room() < need) this.newPage();
    var self = this;
    lines.forEach(function (ln, i) {
      var h = S.lineH(ln, lh);
      if (self.room() < h && !self.top) self.newPage();
      var base = self.y - ln.size * 1.0;
      if (i === 0 && o.bullet) {
        var bf = self.fonts.r, bt = clean(o.bullet, self.fonts);
        self.page.drawText(bt, { x: x - bw, y: base, size: size, font: bf, color: o.color || self.black });
      }
      S.drawLine(self.page, ln, x, base, w, o.align);
      self.y -= h; self.top = false;
    });
    this.gap(o.spaceAfter || 0);
  };

  F.rule = function () {
    this.gap(6);
    if (this.room() < 8) this.newPage();
    this.page.drawLine({ start: { x: this.m.left, y: this.y - 4 }, end: { x: this.pw - this.m.right, y: this.y - 4 }, thickness: 0.75, color: window.PDFLib.rgb(0.75, 0.76, 0.8) });
    this.y -= 12; this.top = false;
  };

  // img: embedded pdf-lib image. wPt/hPt: wanted size in points.
  F.image = function (img, wPt, hPt, o) {
    o = o || {};
    var w = wPt, h = hPt, maxW = this.width() - (o.indent || 0), maxH = this.full();
    var s = Math.min(1, maxW / w, maxH / h); w *= s; h *= s;
    this.gap(o.spaceBefore || 4);
    if (this.room() < h && !this.top) this.newPage();
    var x = this.m.left + (o.indent || 0) + (o.align === 'center' ? (maxW - w) / 2 : o.align === 'right' ? maxW - w : 0);
    this.page.drawImage(img, { x: x, y: this.y - h, width: w, height: h });
    this.y -= h; this.top = false;
    this.gap(o.spaceAfter || 6);
  };

  // rows: [{ header:bool, cells:[{ paras:[{runs, align}], span, align, fill }] }]
  // o: size, pad, headerRows (repeat on each page), stretch, border, zebra, colWidths
  F.table = function (rows, o) {
    o = o || {};
    var L = window.PDFLib, self = this, fonts = this.fonts;
    var size = o.size || this.base * 0.92, pad = o.pad != null ? o.pad : Math.max(3, size * 0.45), lh = o.lh || 1.25;
    var border = o.border || L.rgb(0.72, 0.73, 0.77), headFill = o.headFill || L.rgb(0.93, 0.94, 0.96);
    var ncols = 0;
    rows.forEach(function (r) { var n = 0; r.cells.forEach(function (c) { n += c.span || 1; }); ncols = Math.max(ncols, n); });
    if (!ncols) return;
    var avail = this.width() - (o.indent || 0);
    var widths = o.colWidths;
    if (!widths) {
      var nat = [], min = [];
      for (var c = 0; c < ncols; c++) { nat[c] = pad * 2 + 8; min[c] = pad * 2 + 6; }
      rows.forEach(function (r) {
        var col = 0;
        r.cells.forEach(function (cell) {
          var span = cell.span || 1;
          if (span === 1) {
            cell.paras.forEach(function (p) {
              var m = S.measure(p.runs, fonts, { size: size });
              nat[col] = Math.max(nat[col], Math.min(m.nat, avail * 0.7) + pad * 2 + 1);
              min[col] = Math.max(min[col], Math.min(m.min, avail * 0.4) + pad * 2 + 1);
            });
          }
          col += span;
        });
      });
      var tNat = nat.reduce(function (a, b) { return a + b; }, 0), tMin = min.reduce(function (a, b) { return a + b; }, 0);
      if (tNat <= avail) widths = o.stretch === false ? nat : nat.map(function (w) { return w * avail / tNat; });
      else if (tMin >= avail) widths = min.map(function (w) { return w * avail / tMin; });
      else widths = nat.map(function (w, i) { return min[i] + (w - min[i]) * (avail - tMin) / (tNat - tMin); });
    }
    var tableW = widths.reduce(function (a, b) { return a + b; }, 0);

    function layoutRow(r) {
      var col = 0, x = self.m.left + (o.indent || 0), cells = [];
      r.cells.forEach(function (cell) {
        var span = cell.span || 1, w = 0;
        for (var k = 0; k < span && col + k < ncols; k++) w += widths[col + k];
        var lines = [];
        cell.paras.forEach(function (p, pi) {
          var ls = S.wrap(p.runs, Math.max(4, w - pad * 2), fonts, { size: size, color: self.black });
          ls.forEach(function (l, li) { l.align = p.align || cell.align; l.gapBefore = (pi > 0 && li === 0) ? size * 0.35 : 0; });
          lines = lines.concat(ls);
        });
        cells.push({ x: x, w: w, lines: lines, fill: cell.fill || (r.header ? headFill : null) });
        x += w; col += span;
      });
      if (col < ncols) { var rest = 0; for (var k2 = col; k2 < ncols; k2++) rest += widths[k2]; cells.push({ x: x, w: rest, lines: [], fill: r.header ? headFill : null }); }
      return { cells: cells, header: !!r.header };
    }
    function linesH(lines) { return lines.reduce(function (a, l) { return a + S.lineH(l, lh) + (l.gapBefore || 0); }, 0); }
    function rowH(lay) { var h = 0; lay.cells.forEach(function (c) { h = Math.max(h, linesH(c.lines)); }); return h + pad * 2; }
    function drawRow(lay, part) {
      var h = 0;
      part.forEach(function (ls) { h = Math.max(h, linesH(ls)); });
      h += pad * 2;
      var top = self.y;
      lay.cells.forEach(function (c, i) {
        self.page.drawRectangle({ x: c.x, y: top - h, width: c.w, height: h, color: c.fill || undefined, borderColor: border, borderWidth: 0.6 });
        var y = top - pad;
        part[i].forEach(function (l) {
          y -= (l.gapBefore || 0);
          S.drawLine(self.page, l, c.x + pad, y - l.size * 0.98, c.w - pad * 2, l.align);
          y -= S.lineH(l, lh);
        });
      });
      self.y -= h; self.top = false;
    }
    var headerLays = [];
    var repeat = o.headerRows || 0;
    function newPageWithHeader() {
      self.newPage();
      headerLays.forEach(function (hl) { drawRow(hl, hl.cells.map(function (c) { return c.lines; })); });
    }

    this.gap(o.spaceBefore || 6);
    rows.forEach(function (r, ri) {
      var lay = layoutRow(r), h = rowH(lay);
      var isHead = ri < repeat;
      var headH = headerLays.reduce(function (a, hl) { return a + rowH(hl); }, 0);
      if (h <= self.room()) { drawRow(lay, lay.cells.map(function (c) { return c.lines; })); }
      else if (h <= self.full() - headH) { if (!self.top) newPageWithHeader(); drawRow(lay, lay.cells.map(function (c) { return c.lines; })); }
      else {
        // Taller than a page: split the row's lines across pages.
        var rest = lay.cells.map(function (c) { return c.lines.slice(); });
        var guard = 0;
        while (rest.some(function (ls) { return ls.length; }) && guard++ < 500) {
          var room = self.room() - pad * 2;
          if (room < size * 2) { newPageWithHeader(); room = self.room() - pad * 2; }
          var part = rest.map(function (ls) {
            var take = [], used = 0;
            while (ls.length && (used + S.lineH(ls[0], lh) + (ls[0].gapBefore || 0) <= room || !take.length && room > size)) { used += S.lineH(ls[0], lh) + (ls[0].gapBefore || 0); take.push(ls.shift()); if (used > room) break; }
            return take;
          });
          drawRow(lay, part);
          if (rest.some(function (ls) { return ls.length; })) newPageWithHeader();
        }
      }
      if (isHead) headerLays.push(lay);
    });
    this.gap(o.spaceAfter || 8);
    return tableW;
  };

  // ---------- generic block renderer ----------
  // blocks: {t:'p', runs, ...para opts} | {t:'img', data, kind, w, h} (w,h in points) | {t:'table', rows, opts} | {t:'hr'} | {t:'break'}
  S.blocksText = function (blocks) {
    var out = [];
    (function walk(bs) {
      bs.forEach(function (b) {
        if (b.runs) b.runs.forEach(function (r) { out.push(r.text || ''); });
        if (b.bullet) out.push(b.bullet);
        if (b.rows) b.rows.forEach(function (r) { r.cells.forEach(function (c) { c.paras.forEach(function (p) { p.runs.forEach(function (r) { out.push(r.text || ''); }); }); }); });
      });
    })(blocks);
    return out.join(' ');
  };

  S.render = async function (doc, blocks, o) {
    var fonts = o.fonts || await S.loadFonts(doc, S.needsUnicode(S.blocksText(blocks)));
    var flow = new S.Flow(doc, fonts, o);
    var skipped = 0;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.t === 'p') flow.para(b.runs, b);
      else if (b.t === 'hr') flow.rule();
      else if (b.t === 'break') { if (!flow.top) flow.newPage(); }
      else if (b.t === 'table') flow.table(b.rows, b.opts || {});
      else if (b.t === 'img') {
        try {
          var img = b.kind === 'png' ? await doc.embedPng(b.data) : await doc.embedJpg(b.data);
          flow.image(img, b.w, b.h, b);
        } catch (e) { skipped++; }
      }
      if (i % 40 === 39) await T.tick();
    }
    return { pages: flow.pages, fonts: fonts, skippedImages: skipped };
  };

  // Turn any browser-readable image (data URL or blob URL) into PNG or JPEG bytes pdf-lib can embed.
  S.imageBytes = async function (src, mime) {
    var isPng = /png/i.test(mime || ''), isJpg = /jpe?g/i.test(mime || '');
    if ((isPng || isJpg) && /^data:/.test(src)) {
      var b64 = src.split(',')[1];
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var dims = await new Promise(function (res) { var im = new Image(); im.onload = function () { res([im.naturalWidth, im.naturalHeight]); }; im.onerror = function () { res(null); }; im.src = src; });
      if (dims) return { data: bytes, kind: isPng ? 'png' : 'jpg', w: dims[0], h: dims[1] };
    }
    var im2 = await new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('unsupported image')); }; im.src = src; });
    var c = document.createElement('canvas'); c.width = im2.naturalWidth; c.height = im2.naturalHeight;
    c.getContext('2d').drawImage(im2, 0, 0);
    var blob = await T.canvasBlob(c, 'image/png');
    return { data: await T.blobBytes(blob), kind: 'png', w: im2.naturalWidth, h: im2.naturalHeight };
  };
})();
