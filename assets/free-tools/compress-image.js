/* Compress images: JPG/WebP by quality, PNG by reducing colours (like TinyPNG), batch + ZIP. */
(function () {
  'use strict';
  var F = window.FTM, $ = F.$;
  var quality = $('ftQuality'), qOut = $('ftQualityOut'), format = $('ftFormat'), maxW = $('ftMaxW');

  function pngColours(q) { return q >= 100 ? 0 : q >= 90 ? 256 : q >= 70 ? 128 : q >= 50 ? 64 : q >= 30 ? 32 : 16; }
  function showQ() {
    var q = parseInt(quality.value, 10), c = pngColours(q);
    qOut.textContent = q + (format.value === 'keep' ? ' (PNGs: ' + (c ? c + ' colours' : 'lossless') + ')' : '');
  }
  quality.addEventListener('input', showQ); format.addEventListener('change', showQ); showQ();

  F.batch({
    zipName: 'compressed-images',
    settings: [quality, format, maxW],
    summary: function (a, b) { return 'Total ' + F.bytes(a) + ' to ' + F.bytes(b) + ', ' + F.saving(a, b) + '.'; },
    process: async function (file, img) {
      var q = parseInt(quality.value, 10) / 100;
      var src = F.typeFor(file), isNative = /^image\/(jpeg|png|webp)$/.test(file.type || src) && !F.isHeic(file) && !/\.(gif|bmp|avif)$/i.test(file.name);
      var type = format.value === 'keep' ? (isNative ? src : 'image/jpeg') : format.value;
      if (type === 'image/webp' && !F.webpOk) type = 'image/jpeg';
      var w = img.naturalWidth, h = img.naturalHeight, cap = parseInt(maxW.value, 10) || 0;
      if (cap && w > cap) { h = Math.round(h * cap / w); w = cap; }
      var c = F.drawScaled(img, img.naturalWidth, img.naturalHeight, w, h, { background: type === 'image/jpeg' ? '#ffffff' : null });
      var blob;
      if (type === 'image/png') {
        var UPNG = await F.lib.upng();
        var data = c.getContext('2d').getImageData(0, 0, w, h).data;
        blob = new Blob([UPNG.encode([data.buffer], w, h, pngColours(parseInt(quality.value, 10)))], { type: 'image/png' });
      } else {
        blob = await F.canvasToBlob(c, type, q);
      }
      var name = F.baseName(file.name) + '-compressed.' + F.extFor(type);
      if (blob.size >= file.size && type === src && w === img.naturalWidth) {
        return { blob: file, name: F.baseName(file.name) + '.' + F.extFor(type), info: F.bytes(file.size) + '. Already smaller than we could make it, so we kept the original.' };
      }
      return { blob: blob, name: name, info: F.bytes(file.size) + ' to ' + F.bytes(blob.size) + ', ' + F.saving(file.size, blob.size) + (w !== img.naturalWidth ? ', ' + w + ' x ' + h : '') };
    }
  });
})();
