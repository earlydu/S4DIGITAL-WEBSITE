/* PowerPoint to PDF: unzip the .pptx with JSZip, read each slide's text boxes, pictures, simple shapes and tables,
   and lay them out one PDF page per slide with pdf-lib. Best for simple decks: no charts, SmartArt, effects or animations. */
(function () {
  'use strict';
  var T = window.S4T, S = window.S4Layout, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), bar = $('progress'), cur = null;
  var EMU = 12700;

  function progress(p) { bar.hidden = p == null; if (p != null) bar.firstElementChild.style.width = Math.round(p * 100) + '%'; }

  T.wireDrop($('file'), async function (files) {
    var f = files[0];
    cur = null; result.hidden = true; go.disabled = true;
    if (/\.ppt$/i.test(f.name)) { T.status(st, f.name + ' is the old .ppt format. Open it in PowerPoint or Google Slides and save it as .pptx first.', true); return; }
    if (!/\.pptx$/i.test(f.name)) { T.status(st, f.name + ' isn’t a .pptx file.', true); return; }
    if (!T.need(st, ['PDFLib', 'JSZip'])) return;
    $('fileName').textContent = f.name + ', ' + T.mb(f.size);
    cur = { file: f, buf: await f.arrayBuffer() };
    go.disabled = false;
    T.status(st, 'Ready to convert.');
  });

  // ---------- XML helpers ----------
  function kids(el, name) { if (!el) return []; var out = []; for (var i = 0; i < el.children.length; i++) if (el.children[i].localName === name) out.push(el.children[i]); return out; }
  function kid(el, name) { return kids(el, name)[0] || null; }
  function path(el) { for (var i = 1; i < arguments.length && el; i++) el = kid(el, arguments[i]); return el || null; }
  function num(el, attr, def) { if (!el) return def; var v = el.getAttribute(attr); return v == null || v === '' ? def : parseFloat(v); }
  function resolve(dir, target) {
    if (/^\//.test(target)) return target.slice(1);
    var parts = (dir + target).split('/'), out = [];
    parts.forEach(function (p) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
    return out.join('/');
  }
  async function xml(zip, p) {
    var f = zip.file(p); if (!f) return null;
    return new DOMParser().parseFromString(await f.async('string'), 'application/xml');
  }
  async function rels(zip, partPath) {
    var dir = partPath.replace(/[^/]+$/, ''), doc = await xml(zip, dir + '_rels/' + partPath.split('/').pop() + '.rels'), map = {};
    if (doc) Array.prototype.forEach.call(doc.getElementsByTagName('Relationship'), function (r) {
      map[r.getAttribute('Id')] = { target: r.getAttribute('TargetMode') === 'External' ? null : resolve(dir, r.getAttribute('Target')), type: r.getAttribute('Type') || '' };
    });
    return map;
  }
  function relOfType(map, word) { for (var k in map) if (map[k].type.indexOf(word) >= 0 && map[k].target) return map[k].target; return null; }

  // ---------- colours ----------
  function hsl(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) { var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l];
  }
  function rgbOf(h, s, l) {
    if (!s) return [l, l, l];
    var f = function (p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
  }
  // el is a solidFill (or similar) containing srgbClr / schemeClr / sysClr / prstClr. Returns { c:[r,g,b], a } or null.
  function colourOf(el, theme, phClr) {
    if (!el) return null;
    var c = null, mods = null;
    for (var i = 0; i < el.children.length; i++) {
      var ch = el.children[i], n = ch.localName, v = ch.getAttribute('val');
      if (n === 'srgbClr' && v) c = hex(v);
      else if (n === 'sysClr') c = hex(ch.getAttribute('lastClr') || (v === 'window' ? 'FFFFFF' : '000000'));
      else if (n === 'prstClr') c = { white: [1, 1, 1], black: [0, 0, 0], red: [1, 0, 0], blue: [0, 0, 1], green: [0, 0.5, 0], yellow: [1, 1, 0], gray: [0.5, 0.5, 0.5] }[v] || [0, 0, 0];
      else if (n === 'schemeClr') c = v === 'phClr' ? (phClr || null) : (theme[{ tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' }[v] || v] || null);
      else continue;
      mods = ch; break;
    }
    if (!c) return null;
    c = c.slice(); var a = 1;
    Array.prototype.forEach.call(mods.children, function (m) {
      var val = num(m, 'val', 100000) / 100000;
      if (m.localName === 'alpha') a = val;
      else if (m.localName === 'lumMod' || m.localName === 'lumOff') { var x = hsl(c[0], c[1], c[2]); x[2] = m.localName === 'lumMod' ? x[2] * val : Math.min(1, x[2] + val); c = rgbOf(x[0], x[1], x[2]); }
      else if (m.localName === 'shade') c = c.map(function (k) { return k * val; });
      else if (m.localName === 'tint') c = c.map(function (k) { return k + (1 - k) * (1 - val); });
    });
    return { c: c, a: a };
  }
  function hex(v) { return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255]; }
  function pdfColour(c) { return window.PDFLib.rgb(c.c[0], c.c[1], c.c[2]); }
  function fillOf(spPr, style, theme) {
    if (!spPr) return null;
    if (kid(spPr, 'noFill')) return null;
    var sf = kid(spPr, 'solidFill'); if (sf) return colourOf(sf, theme);
    var gf = kid(spPr, 'gradFill'); if (gf) { var gs = path(gf, 'gsLst', 'gs'); return colourOf(gs, theme); }
    if (style) { var fr = kid(style, 'fillRef'); if (fr && num(fr, 'idx', 0) > 0) return colourOf(fr, theme); }
    return null;
  }
  function lineOf(spPr, style, theme) {
    var ln = spPr && kid(spPr, 'ln');
    if (ln && kid(ln, 'noFill')) return null;
    var c = ln && colourOf(kid(ln, 'solidFill'), theme);
    if (!c && style) { var lr = kid(style, 'lnRef'); if (lr && num(lr, 'idx', 0) > 0) c = colourOf(lr, theme); }
    if (!c) return null;
    return { c: c, w: Math.max(0.5, num(ln, 'w', 12700) / EMU) };
  }

  // ---------- geometry ----------
  function xfrmOf(el) {
    var x = path(el, 'spPr', 'xfrm') || path(el, 'grpSpPr', 'xfrm') || kid(el, 'xfrm');
    if (!x) return null;
    var off = kid(x, 'off'), ext = kid(x, 'ext');
    if (!off || !ext) return null;
    var r = { x: num(off, 'x', 0), y: num(off, 'y', 0), w: num(ext, 'cx', 0), h: num(ext, 'cy', 0), flipH: x.getAttribute('flipH') === '1', flipV: x.getAttribute('flipV') === '1', rot: num(x, 'rot', 0) / 60000 };
    var cho = kid(x, 'chOff'), che = kid(x, 'chExt');
    if (cho && che) { r.chX = num(cho, 'x', 0); r.chY = num(cho, 'y', 0); r.chW = num(che, 'cx', 1) || 1; r.chH = num(che, 'cy', 1) || 1; }
    return r;
  }
  function apply(tf, b) { // map a child box through a group transform
    if (!tf) return b;
    return { x: tf.x0 + (b.x - tf.cx) * tf.sx, y: tf.y0 + (b.y - tf.cy) * tf.sy, w: b.w * tf.sx, h: b.h * tf.sy, flipH: b.flipH, flipV: b.flipV, rot: b.rot };
  }

  // ---------- placeholders and text styles ----------
  function phOf(sp) { return path(sp, 'nvSpPr', 'nvPr', 'ph') || path(sp, 'nvPicPr', 'nvPr', 'ph') || path(sp, 'nvGraphicFramePr', 'nvPr', 'ph'); }
  function phType(ph) { var t = ph.getAttribute('type') || 'body'; return t === 'ctrTitle' ? 'title' : (t === 'subTitle' || t === 'obj') ? 'body' : t; }
  function findPh(tree, ph, byTypeOnly) {
    if (!tree) return null;
    var idx = ph.getAttribute('idx'), type = phType(ph), byType = null, found = null;
    Array.prototype.forEach.call(tree.getElementsByTagNameNS('*', 'sp'), function (sp) {
      if (found) return;
      var p = phOf(sp); if (!p) return;
      if (!byTypeOnly && idx != null && p.getAttribute('idx') === idx) found = sp;
      else if (!byType && phType(p) === type) byType = sp;
    });
    return found || byType;
  }

  // Context for one slide: theme, master, layout, rels.
  function textChain(sp, ctx) {
    var ph = phOf(sp), chain = [], bodies = [];
    var own = path(sp, 'txBody', 'lstStyle'); if (own) chain.push(own);
    var ob = path(sp, 'txBody', 'bodyPr'); if (ob) bodies.push(ob);
    var kind = 'other';
    if (ph) {
      kind = phType(ph) === 'title' ? 'title' : (['body', 'subTitle', 'obj'].indexOf(ph.getAttribute('type') || 'body') >= 0 || phType(ph) === 'body') ? 'body' : 'other';
      [findPh(ctx.layoutTree, ph), findPh(ctx.masterTree, ph, true)].forEach(function (s) {
        if (!s) return;
        var l = path(s, 'txBody', 'lstStyle'); if (l) chain.push(l);
        var b = path(s, 'txBody', 'bodyPr'); if (b) bodies.push(b);
      });
    }
    var tx = ctx.txStyles && kid(ctx.txStyles, kind === 'title' ? 'titleStyle' : kind === 'body' ? 'bodyStyle' : 'otherStyle');
    if (tx) chain.push(tx);
    return { chain: chain, bodies: bodies, kind: kind, isPh: !!ph };
  }
  function lvlP(chainEl, lvl) { return kid(chainEl, 'lvl' + (lvl + 1) + 'pPr'); }
  function pick(pPr, chain, lvl, fn) { // first non-null from paragraph pPr, then the style chain
    var v = pPr ? fn(pPr) : null; if (v != null) return v;
    for (var i = 0; i < chain.length; i++) { var p = lvlP(chain[i], lvl); if (p) { v = fn(p); if (v != null) return v; } }
    return null;
  }
  function pickRun(rPr, pPr, chain, lvl, fn) {
    var v = rPr ? fn(rPr) : null; if (v != null) return v;
    return pick(pPr, chain, lvl, function (p) { var d = kid(p, 'defRPr'); return d ? fn(d) : null; });
  }
  function bodyProp(bodies, fn) { for (var i = 0; i < bodies.length; i++) { var v = fn(bodies[i]); if (v != null) return v; } return null; }

  // ---------- drawing ----------
  async function imageFor(zip, target, srcRect) {
    if (!target) return null;
    var f = zip.file(target); if (!f) return null;
    var bytes = await f.async('uint8array'), ext = (target.split('.').pop() || '').toLowerCase();
    var isPng = bytes[0] === 0x89 && bytes[1] === 0x50, isJpg = bytes[0] === 0xFF && bytes[1] === 0xD8;
    var crop = srcRect && ['l', 't', 'r', 'b'].some(function (k) { return num(srcRect, k, 0); });
    if ((isPng || isJpg) && !crop) return { data: bytes, kind: isPng ? 'png' : 'jpg' };
    if (/^(emf|wmf|tif|tiff)$/.test(ext)) return null;
    var mime = ext === 'svg' ? 'image/svg+xml' : isPng ? 'image/png' : isJpg ? 'image/jpeg' : 'image/' + ext;
    var url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    try {
      var im = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = url; });
      var w = im.naturalWidth || 800, h = im.naturalHeight || 600;
      var l = num(srcRect, 'l', 0) / 100000, t = num(srcRect, 't', 0) / 100000, r = num(srcRect, 'r', 0) / 100000, b = num(srcRect, 'b', 0) / 100000;
      var sx = w * l, sy = h * t, sw = Math.max(1, w * (1 - l - r)), sh = Math.max(1, h * (1 - t - b));
      var scale = Math.min(1, 2400 / Math.max(sw, sh));
      var c = document.createElement('canvas'); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
      c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return { data: await T.blobBytes(await T.canvasBlob(c, 'image/png')), kind: 'png' };
    } catch (e) { return null; } finally { URL.revokeObjectURL(url); }
  }

  function size0Guess(runs) { return runs.length ? Math.max.apply(null, runs.map(function (x) { return x.size || 18; })) : 18; }

  function Slide(doc, page, fonts, ctx) { this.doc = doc; this.page = page; this.fonts = fonts; this.ctx = ctx; this.H = page.getHeight(); }
  Slide.prototype.rect = function (b) { return { x: b.x / EMU, y: this.H - (b.y + b.h) / EMU, w: b.w / EMU, h: b.h / EMU }; };

  Slide.prototype.shapeFill = function (sp, b) {
    var spPr = kid(sp, 'spPr'), style = kid(sp, 'style'), theme = this.ctx.theme;
    var geom = path(spPr, 'prstGeom'), g = geom ? geom.getAttribute('prst') : (path(spPr, 'custGeom') ? 'cust' : null);
    if (!g) return;
    var fill = fillOf(spPr, style, theme), line = lineOf(spPr, style, theme), r = this.rect(b), P = this.page;
    if (!fill && !line) return;
    var o = {};
    if (fill) { o.color = pdfColour(fill); o.opacity = fill.a; }
    if (line) { o.borderColor = pdfColour(line.c); o.borderWidth = line.w; }
    if (g === 'ellipse') P.drawEllipse(Object.assign({ x: r.x + r.w / 2, y: r.y + r.h / 2, xScale: r.w / 2, yScale: r.h / 2 }, o));
    else if (g === 'line' || g === 'straightConnector1') {
      if (line) P.drawLine({ start: { x: r.x, y: b.flipV ? r.y : r.y + r.h }, end: { x: r.x + r.w, y: b.flipV ? r.y + r.h : r.y }, thickness: line.w, color: pdfColour(line.c) });
    }
    else if (/^(rect|roundRect|snip|flowChartProcess|flowChartAlternateProcess|cust|round)/.test(g)) P.drawRectangle(Object.assign({ x: r.x, y: r.y, width: r.w, height: r.h }, o));
  };

  Slide.prototype.text = function (sp, b) {
    var tb = kid(sp, 'txBody'); if (!tb) return;
    var paras = kids(tb, 'p'); if (!paras.length) return;
    var info = textChain(sp, this.ctx), theme = this.ctx.theme, fonts = this.fonts, L = window.PDFLib;
    var bp = info.bodies;
    var ins = function (k, d) { return bodyProp(bp, function (x) { var v = x.getAttribute(k); return v == null ? null : parseFloat(v); }); };
    var lI = (ins('lIns') != null ? ins('lIns') : 91440) / EMU, rI = (ins('rIns') != null ? ins('rIns') : 91440) / EMU;
    var tI = (ins('tIns') != null ? ins('tIns') : 45720) / EMU, bI = (ins('bIns') != null ? ins('bIns') : 45720) / EMU;
    var anchor = bodyProp(bp, function (x) { return x.getAttribute('anchor'); }) || (info.kind === 'title' ? 'ctr' : 't');
    var fit = bodyProp(bp, function (x) { var n = kid(x, 'normAutofit'); return n ? num(n, 'fontScale', 100000) / 100000 : null; });
    var r = this.rect(b), boxW = Math.max(10, r.w - lI - rI), boxH = r.h - tI - bI;
    var defColour = colourOf(path(this.ctx.txStyles, 'otherStyle', 'lvl1pPr', 'defRPr', 'solidFill'), theme) || { c: theme.dk1 || [0, 0, 0], a: 1 };

    var self = this;
    function build(scale) {
      var out = [], counter = {}, total = 0;
      paras.forEach(function (p) {
        var pPr = kid(p, 'pPr'), lvl = num(pPr, 'lvl', 0);
        var chain = info.chain;
        var sizeOf = function (rPr) { var v = pickRun(rPr, pPr, chain, lvl, function (e) { return e.getAttribute('sz'); }); return (v ? parseFloat(v) / 100 : (info.kind === 'title' ? 40 : 18)) * scale; };
        var runs = [];
        Array.prototype.forEach.call(p.children, function (ch) {
          if (ch.localName === 'r' || ch.localName === 'fld') {
            var rPr = kid(ch, 'rPr'), t = kid(ch, 't');
            var txt = t ? t.textContent : '';
            if (ch.localName === 'fld' && /slidenum/i.test(ch.getAttribute('type') || '')) txt = String(self.ctx.number);
            var col = colourOf(kid(rPr, 'solidFill'), theme) || pickRun(null, pPr, chain, lvl, function (e) { return colourOf(kid(e, 'solidFill'), theme); }) || defColour;
            var cap = pickRun(rPr, pPr, chain, lvl, function (e) { return e.getAttribute('cap'); });
            if (cap === 'all') txt = txt.toUpperCase();
            runs.push({
              text: txt, size: sizeOf(rPr), color: L.rgb(col.c[0], col.c[1], col.c[2]),
              bold: pickRun(rPr, pPr, chain, lvl, function (e) { var v = e.getAttribute('b'); return v == null ? null : v === '1' || v === 'true'; }) || false,
              italic: pickRun(rPr, pPr, chain, lvl, function (e) { var v = e.getAttribute('i'); return v == null ? null : v === '1' || v === 'true'; }) || false,
              underline: !!pickRun(rPr, pPr, chain, lvl, function (e) { var v = e.getAttribute('u'); return v == null ? null : v !== 'none'; })
            });
          } else if (ch.localName === 'br') runs.push({ text: '\n', size: sizeOf(kid(ch, 'rPr')) });
        });
        var endSize = sizeOf(kid(p, 'endParaRPr'));
        var hasText = runs.some(function (x) { return x.text.trim(); });
        var algn = pick(pPr, chain, lvl, function (e) { return e.getAttribute('algn'); }) || 'l';
        var align = { ctr: 'center', r: 'right', just: 'left', dist: 'center' }[algn] || 'left';
        // Bullets: explicit char or autonumber, or the inherited style for body placeholders.
        var bu = pick(pPr, chain, lvl, function (e) { return kid(e, 'buNone') ? 'none' : kid(e, 'buAutoNum') ? 'num' : kid(e, 'buChar') ? 'char' : null; });
        var bullet = null;
        if (hasText && bu === 'char') bullet = '•';
        if (hasText && bu === 'num') { counter[lvl] = (counter[lvl] || 0) + 1; bullet = counter[lvl] + '.'; }
        var marL = pick(pPr, chain, lvl, function (e) { var v = e.getAttribute('marL'); return v == null ? null : parseFloat(v); });
        var indentPt = marL != null ? marL / EMU : (bullet ? 22 * (lvl + 1) : 0);
        var hang = pick(pPr, chain, lvl, function (e) { var v = e.getAttribute('indent'); return v == null ? null : parseFloat(v); });
        var bulletX = hang != null && hang < 0 ? Math.max(0, indentPt + hang / EMU) : Math.max(0, indentPt - Math.max(12, size0Guess(runs) * 0.9));
        var spcPct = pick(pPr, chain, lvl, function (e) { var s = path(e, 'lnSpc', 'spcPct'); return s ? num(s, 'val', 100000) / 100000 : null; }) || 1;
        var before = pick(pPr, chain, lvl, function (e) { var s = path(e, 'spcBef', 'spcPts'); return s ? num(s, 'val', 0) / 100 : null; }) || 0;
        var after = pick(pPr, chain, lvl, function (e) { var s = path(e, 'spcAft', 'spcPts'); return s ? num(s, 'val', 0) / 100 : null; }) || 0;
        var size0 = runs.length ? Math.max.apply(null, runs.map(function (x) { return x.size || endSize; })) : endSize;
        var lines = hasText ? S.wrap(runs, Math.max(10, boxW - indentPt), fonts, { size: size0 }) : [{ pieces: [], w: 0, size: endSize }];
        var lh = 1.2 * spcPct;
        var h = before * scale + after * scale + lines.reduce(function (a, l) { return a + l.size * lh; }, 0);
        out.push({ lines: lines, align: align, bullet: bullet, bulletX: bulletX, indent: indentPt, lh: lh, before: before * scale, after: after * scale, size: size0, colour: runs[0] && runs[0].color });
        total += h;
      });
      return { paras: out, h: total };
    }
    var scale = fit || 1, lay = build(scale);
    if ((info.isPh || fit) && lay.h > boxH) {
      for (var tries = 0; tries < 8 && lay.h > boxH && scale > 0.4; tries++) { scale *= 0.9; lay = build(scale); }
    }
    var top = r.y + r.h - tI;
    if (anchor === 'ctr') top -= Math.max(0, (boxH - lay.h) / 2);
    else if (anchor === 'b') top -= Math.max(0, boxH - lay.h);
    var y = top, P = this.page;
    lay.paras.forEach(function (p) {
      y -= p.before;
      p.lines.forEach(function (l, i) {
        var base = y - l.size * 0.95;
        if (i === 0 && p.bullet) P.drawText(T.winAnsi(p.bullet), { x: r.x + lI + p.bulletX, y: base, size: p.size * 0.9, font: fonts.r, color: p.colour || L.rgb(0, 0, 0) });
        S.drawLine(P, l, r.x + lI + p.indent, base, boxW - p.indent, p.align);
        y -= l.size * p.lh;
      });
      y -= p.after;
    });
  };

  Slide.prototype.table = function (gf, b) {
    var tbl = path(gf, 'graphic', 'graphicData', 'tbl'); if (!tbl) return false;
    var L = window.PDFLib, theme = this.ctx.theme, fonts = this.fonts, P = this.page;
    var cols = kids(path(tbl, 'tblGrid'), 'gridCol').map(function (c) { return num(c, 'w', 0); });
    var sum = cols.reduce(function (a, c) { return a + c; }, 0) || 1;
    var r = this.rect(b), y = r.y + r.h, rows = kids(tbl, 'tr'), firstRow = path(tbl, 'tblPr') && path(tbl, 'tblPr').getAttribute('firstRow') === '1';
    var self = this;
    rows.forEach(function (tr, ri) {
      var cells = kids(tr, 'tc'), x = r.x, laid = [], rowH = num(tr, 'h', 0) / EMU;
      cells.forEach(function (tc, ci) {
        var span = num(tc, 'gridSpan', 1), w = 0;
        for (var k = 0; k < span; k++) w += (cols[ci + k] || 0) / sum * r.w;
        if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') { laid.push({ x: x, w: w, lines: [], skip: true }); x += w; return; }
        var runs = [];
        kids(path(tc, 'txBody'), 'p').forEach(function (p, pi) {
          if (pi) runs.push({ text: '\n', size: 12 });
          Array.prototype.forEach.call(p.children, function (ch) {
            if (ch.localName !== 'r') return;
            var rPr = kid(ch, 'rPr'), col = colourOf(kid(rPr, 'solidFill'), theme);
            runs.push({ text: (kid(ch, 't') || {}).textContent || '', size: num(rPr, 'sz', 1400) / 100, bold: (rPr && rPr.getAttribute('b') === '1') || (firstRow && ri === 0), italic: rPr && rPr.getAttribute('i') === '1', color: col ? pdfColour(col) : (firstRow && ri === 0 ? L.rgb(1, 1, 1) : L.rgb(0, 0, 0)) });
          });
        });
        var lines = S.wrap(runs, Math.max(8, w - 10), fonts, { size: 14 });
        var fill = colourOf(path(tc, 'tcPr', 'solidFill'), theme);
        if (!fill && firstRow && ri === 0) fill = { c: theme.accent1 || [0.27, 0.45, 0.77], a: 1 };
        laid.push({ x: x, w: w, lines: lines, fill: fill });
        rowH = Math.max(rowH, lines.reduce(function (a, l) { return a + l.size * 1.2; }, 0) + 8);
        x += w;
      });
      laid.forEach(function (c) {
        if (c.skip) return;
        P.drawRectangle({ x: c.x, y: y - rowH, width: c.w, height: rowH, color: c.fill ? pdfColour(c.fill) : undefined, borderColor: L.rgb(0.6, 0.62, 0.66), borderWidth: 0.6 });
        var yy = y - 4;
        c.lines.forEach(function (l) { S.drawLine(P, l, c.x + 5, yy - l.size * 0.95, c.w - 10, 'left'); yy -= l.size * 1.2; });
      });
      y -= rowH;
    });
    return true;
  };

  // Walk a shape tree (slide, layout or master). tf maps group child coordinates.
  Slide.prototype.tree = async function (spTree, relMap, opts, tf) {
    if (!spTree) return;
    var ctx = this.ctx;
    for (var i = 0; i < spTree.children.length; i++) {
      var el = spTree.children[i], n = el.localName;
      if (n === 'grpSp') {
        var gx = xfrmOf(el);
        var inner = gx && gx.chW ? { x0: gx.x, y0: gx.y, cx: gx.chX, cy: gx.chY, sx: gx.w / gx.chW, sy: gx.h / gx.chH } : null;
        var combined = inner;
        if (tf && inner) { var p0 = apply(tf, { x: inner.x0, y: inner.y0, w: 0, h: 0 }); combined = { x0: p0.x, y0: p0.y, cx: inner.cx, cy: inner.cy, sx: inner.sx * tf.sx, sy: inner.sy * tf.sy }; }
        await this.tree(el, relMap, opts, combined || tf);
        continue;
      }
      if (n !== 'sp' && n !== 'pic' && n !== 'graphicFrame' && n !== 'cxnSp') continue;
      var ph = phOf(el);
      if (opts.skipPh && ph) continue;
      var b = xfrmOf(el);
      if (!b && ph) { var lp = findPh(ctx.layoutTree, ph); if (lp) b = xfrmOf(lp); if (!b) { var mp = findPh(ctx.masterTree, ph, true); if (mp) b = xfrmOf(mp); } }
      if (!b) continue;
      b = apply(tf, b);
      if (n === 'sp' || n === 'cxnSp') { this.shapeFill(el, b); if (n === 'sp') this.text(el, b); }
      else if (n === 'pic') {
        var blip = path(el, 'blipFill', 'blip'), id = blip && (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
        var im = id && relMap[id] ? await imageFor(ctx.zip, relMap[id].target, path(el, 'blipFill', 'srcRect')) : null;
        if (!im) { ctx.skipped++; continue; }
        try {
          var emb = im.kind === 'png' ? await this.doc.embedPng(im.data) : await this.doc.embedJpg(im.data);
          var rr = this.rect(b);
          this.page.drawImage(emb, { x: rr.x, y: rr.y, width: rr.w, height: rr.h });
        } catch (e) { ctx.skipped++; }
      } else if (n === 'graphicFrame') {
        if (!this.table(el, b)) ctx.skipped++;
      }
    }
  };

  async function background(slide, parts, zip) {
    // parts: [{doc, rels}] slide, layout, master. First one with a background wins.
    for (var i = 0; i < parts.length; i++) {
      var bg = parts[i].doc && path(parts[i].doc.documentElement, 'cSld', 'bg');
      if (!bg) continue;
      var bgPr = kid(bg, 'bgPr'), ref = kid(bg, 'bgRef'), r = { x: 0, y: 0, w: slide.page.getWidth(), h: slide.page.getHeight() };
      if (bgPr) {
        var blip = path(bgPr, 'blipFill', 'blip');
        if (blip) {
          var id = blip.getAttribute('r:embed'), im = id && parts[i].rels[id] ? await imageFor(zip, parts[i].rels[id].target) : null;
          if (im) { try { var e = im.kind === 'png' ? await slide.doc.embedPng(im.data) : await slide.doc.embedJpg(im.data); slide.page.drawImage(e, { x: 0, y: 0, width: r.w, height: r.h }); return; } catch (err) {} }
        }
        var c = fillOf(bgPr, null, slide.ctx.theme);
        if (c) { slide.page.drawRectangle({ x: 0, y: 0, width: r.w, height: r.h, color: pdfColour(c) }); return; }
      }
      if (ref) { var c2 = colourOf(ref, slide.ctx.theme); if (c2) { slide.page.drawRectangle({ x: 0, y: 0, width: r.w, height: r.h, color: pdfColour(c2) }); return; } }
      return;
    }
  }

  go.addEventListener('click', async function () {
    if (!cur) return;
    var L = window.PDFLib;
    go.disabled = true; result.hidden = true; progress(0); T.status(st, 'Unpacking the deck…');
    try {
      var zip = await window.JSZip.loadAsync(cur.buf);
      var pres = await xml(zip, 'ppt/presentation.xml');
      if (!pres) throw new Error('it doesn’t look like a PowerPoint file');
      var presRels = await rels(zip, 'ppt/presentation.xml');
      var sz = path(pres.documentElement, 'sldSz');
      var W = num(sz, 'cx', 9144000) / EMU, H = num(sz, 'cy', 5143500) / EMU;
      var ids = kids(path(pres.documentElement, 'sldIdLst'), 'sldId');
      var slidePaths = ids.map(function (s) { var id = s.getAttribute('r:id'); return presRels[id] && presRels[id].target; }).filter(Boolean);
      if (!slidePaths.length) throw new Error('there are no slides in it');
      // Everything's text first, so we know if we need the wider font.
      var allText = '';
      for (var a = 0; a < slidePaths.length; a++) { var f0 = zip.file(slidePaths[a]); if (f0) allText += (await f0.async('string')).replace(/<[^>]+>/g, ' '); }
      var doc = await L.PDFDocument.create();
      doc.setTitle(cur.file.name.replace(/\.pptx$/i, ''));
      var fonts = await S.loadFonts(doc, S.needsUnicode(allText.replace(/&[a-z#0-9]+;/gi, ' ')));
      var cache = {}, skipped = 0;
      async function part(p) { if (!p) return { doc: null, rels: {} }; if (!cache[p]) cache[p] = { doc: await xml(zip, p), rels: await rels(zip, p) }; return cache[p]; }

      for (var i = 0; i < slidePaths.length; i++) {
        T.status(st, 'Slide ' + (i + 1) + ' of ' + slidePaths.length + '…');
        var sl = await part(slidePaths[i]);
        if (!sl.doc) continue;
        if (sl.doc.documentElement.getAttribute('show') === '0' && !$('hidden').checked) continue;
        var lay = await part(relOfType(sl.rels, '/slideLayout'));
        var mas = await part(relOfType(lay.rels, '/slideMaster'));
        var thm = await part(relOfType(mas.rels, '/theme'));
        var theme = {};
        var scheme = thm.doc && thm.doc.getElementsByTagNameNS('*', 'clrScheme')[0];
        if (scheme) Array.prototype.forEach.call(scheme.children, function (c) { var col = colourOf(c, {}); if (col) theme[c.localName] = col.c; });
        var ctx = {
          zip: zip, theme: theme, number: i + 1, skipped: 0,
          layoutTree: lay.doc && path(lay.doc.documentElement, 'cSld', 'spTree'),
          masterTree: mas.doc && path(mas.doc.documentElement, 'cSld', 'spTree'),
          txStyles: mas.doc && path(mas.doc.documentElement, 'txStyles')
        };
        var page = doc.addPage([W, H]);
        page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: L.rgb(1, 1, 1) });
        var slide = new Slide(doc, page, fonts, ctx);
        await background(slide, [sl, lay, mas], zip);
        var showMaster = sl.doc.documentElement.getAttribute('showMasterSp') !== '0';
        if (showMaster && lay.doc && lay.doc.documentElement.getAttribute('showMasterSp') !== '0') await slide.tree(ctx.masterTree, mas.rels, { skipPh: true });
        if (showMaster) await slide.tree(ctx.layoutTree, lay.rels, { skipPh: true });
        await slide.tree(path(sl.doc.documentElement, 'cSld', 'spTree'), sl.rels, {});
        skipped += ctx.skipped;
        progress((i + 1) / slidePaths.length);
        await T.tick();
      }
      var bytes = await doc.save();
      var note = skipped ? ' ' + T.plural(skipped, 'item') + ' (charts, SmartArt or unusual image formats) couldn’t be drawn and were left out.' : '';
      T.offer(result, bytes, T.baseName(cur.file.name) + '.pdf', 'Made a PDF with ' + T.plural(doc.getPageCount(), 'page') + ', one per slide, ' + T.mb(bytes.length) + '.' + note);
      T.status(st, 'Done. Check it against the deck, fonts are swapped for a standard one.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    progress(null);
    go.disabled = false;
  });
})();
