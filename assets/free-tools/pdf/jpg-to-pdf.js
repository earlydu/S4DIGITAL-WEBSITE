/* JPG to PDF: images into one PDF, one image per page, in the order you set. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var imgs = [];
  var list = $('list'), st = $('status'), go = $('go'), clear = $('clear'), result = $('result');
  var SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

  function jpegOrientation(bytes) {
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1;
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), off = 2;
    while (off + 4 < dv.byteLength) {
      var marker = dv.getUint16(off); off += 2;
      if (marker === 0xFFE1) {
        if (dv.getUint32(off + 2) !== 0x45786966) return 1;
        var tiff = off + 8, little = dv.getUint16(tiff) === 0x4949;
        var ifd = tiff + dv.getUint32(tiff + 4, little), count = dv.getUint16(ifd, little);
        for (var i = 0; i < count; i++) {
          var e = ifd + 2 + i * 12;
          if (e + 10 > dv.byteLength) return 1;
          if (dv.getUint16(e, little) === 0x0112) return dv.getUint16(e + 8, little);
        }
        return 1;
      }
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
      off += dv.getUint16(off);
    }
    return 1;
  }
  function loadImage(url) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('your browser can’t read it as an image')); }; im.src = url; });
  }
  async function canvasJpeg(im) {
    var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0);
    return T.blobBytes(await T.canvasBlob(c, 'image/jpeg', 0.92));
  }

  function render() {
    imgs.forEach(function (m, i) {
      list.appendChild(m.el);
      m.el.querySelector('[data-up]').disabled = i === 0;
      m.el.querySelector('[data-down]').disabled = i === imgs.length - 1;
      m.el.querySelector('.pt-meta span').textContent = 'Page ' + (i + 1) + ', ' + m.w + ' x ' + m.h + ', ' + T.mb(m.file.size);
    });
    go.disabled = !imgs.length;
    clear.hidden = !imgs.length;
    if (imgs.length) T.status(st, T.plural(imgs.length, 'image') + ', one per page. Drag or use the arrows to change the order.');
  }

  async function add(files) {
    if (!T.need(st, ['PDFLib'])) return;
    result.hidden = true;
    var bad = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name)) { bad.push(f.name + ' isn’t an image'); continue; }
      var url = URL.createObjectURL(f);
      try {
        var im = await loadImage(url);
        var bytes = await T.readBytes(f), kind;
        var isJpg = bytes[0] === 0xFF && bytes[1] === 0xD8, isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
        if (isPng) kind = 'png';
        else if (isJpg && jpegOrientation(bytes) === 1) kind = 'jpg';
        else { bytes = await canvasJpeg(im); kind = 'jpg'; }
        var item = { key: ++T.keySeq, file: f, bytes: bytes, kind: kind, w: im.naturalWidth, h: im.naturalHeight, url: url };
        var li = document.createElement('li');
        li.className = 'pt-item'; li.draggable = true; li.dataset.key = item.key;
        li.innerHTML = '<span class="pt-handle" aria-hidden="true">' + T.ICON.grip + '</span><span class="pt-mini"><img alt="" src="' + url + '"></span>' +
          '<span class="pt-meta"><strong>' + T.esc(f.name) + '</strong><span></span></span><span class="pt-actions"></span>';
        var up = T.iconBtn('up', 'Move up'), down = T.iconBtn('down', 'Move down'), del = T.iconBtn('x', 'Remove');
        up.dataset.up = ''; down.dataset.down = '';
        li.querySelector('.pt-actions').append(up, down, del);
        (function (item) {
          up.addEventListener('click', function () { var k = imgs.indexOf(item); T.move(imgs, k, k - 1); result.hidden = true; render(); });
          down.addEventListener('click', function () { var k = imgs.indexOf(item); T.move(imgs, k, k + 1); result.hidden = true; render(); });
          del.addEventListener('click', function () { imgs.splice(imgs.indexOf(item), 1); item.el.remove(); URL.revokeObjectURL(item.url); result.hidden = true; render(); if (!imgs.length) T.status(st, ''); });
        })(item);
        item.el = li;
        imgs.push(item);
        render();
      } catch (err) {
        URL.revokeObjectURL(url);
        bad.push(f.name + ' was skipped: ' + err.message);
      }
    }
    if (bad.length) T.status(st, bad.join('. ') + '.', true);
  }

  go.addEventListener('click', async function () {
    if (!imgs.length) return;
    go.disabled = true; T.status(st, 'Building your PDF…');
    try {
      var L = window.PDFLib;
      var size = $('size').value, orient = $('orient').value, margin = parseFloat($('margin').value) || 0;
      var out = await L.PDFDocument.create();
      for (var i = 0; i < imgs.length; i++) {
        var m = imgs[i];
        var emb = m.kind === 'png' ? await out.embedPng(m.bytes) : await out.embedJpg(m.bytes);
        var pw, ph;
        if (size === 'fit') {
          // Page the size of the image at 96 dpi, plus the margin.
          pw = m.w * 0.75 + margin * 2; ph = m.h * 0.75 + margin * 2;
        } else {
          var S = SIZES[size] || SIZES.a4;
          var land = orient === 'landscape' || (orient === 'auto' && m.w > m.h);
          pw = land ? S[1] : S[0]; ph = land ? S[0] : S[1];
        }
        var s = Math.min((pw - 2 * margin) / emb.width, (ph - 2 * margin) / emb.height);
        if (size === 'fit') s = 0.75;
        var w = emb.width * s, h = emb.height * s;
        var page = out.addPage([pw, ph]);
        page.drawImage(emb, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        if (i % 5 === 4) await T.tick();
      }
      var bytes = await out.save();
      var name = imgs.length === 1 ? T.baseName(imgs[0].file.name) + '.pdf' : 'images.pdf';
      T.offer(result, bytes, name, 'Made a PDF with ' + T.plural(imgs.length, 'page') + ', ' + T.mb(bytes.length) + '.');
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
  ['size', 'orient', 'margin'].forEach(function (id) { $(id).addEventListener('change', function () { result.hidden = true; $('orientRow').hidden = $('size').value === 'fit'; }); });
  T.wireDrop($('file'), add);
  T.sortable(list, function () { return imgs; }, function () { result.hidden = true; render(); });
  clear.addEventListener('click', function () { imgs.forEach(function (m) { m.el.remove(); URL.revokeObjectURL(m.url); }); imgs = []; result.hidden = true; render(); T.status(st, ''); });
})();
