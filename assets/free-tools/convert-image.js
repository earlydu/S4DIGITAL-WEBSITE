/* Convert images to JPG, PNG or WebP, including iPhone HEIC photos. Batch + ZIP. */
(function () {
  'use strict';
  var F = window.FTM, $ = F.$;
  var quality = $('ftQuality'), qOut = $('ftQualityOut'), qRow = $('ftQualityRow'), bg = $('ftBg'), bgRow = $('ftBgRow');

  function target() { return document.querySelector('input[name="ftTo"]:checked').value; }
  function sync() { var t = target(); qRow.hidden = t === 'image/png'; bgRow.hidden = t !== 'image/jpeg'; qOut.textContent = quality.value; }
  document.querySelectorAll('input[name="ftTo"]').forEach(function (r) { r.addEventListener('change', sync); });
  quality.addEventListener('input', sync);
  if (!F.webpOk) { var w = document.querySelector('input[name="ftTo"][value="image/webp"]'); if (w) { w.disabled = true; w.closest('label').title = 'Your browser can’t save WebP'; } }
  sync();

  F.batch({
    zipName: 'converted-images',
    settings: [quality, bg].concat(Array.prototype.slice.call(document.querySelectorAll('input[name="ftTo"]'))),
    process: async function (file, img) {
      var type = target(), w = img.naturalWidth, h = img.naturalHeight;
      var c = F.drawScaled(img, w, h, w, h, { background: type === 'image/jpeg' ? (bg.value || '#ffffff') : null });
      var blob = await F.canvasToBlob(c, type, type === 'image/png' ? undefined : parseInt(quality.value, 10) / 100);
      var from = F.isHeic(file) ? 'HEIC' : (F.ext(file.name) || 'image').toUpperCase();
      return { blob: blob, name: F.baseName(file.name) + '.' + F.extFor(type), info: from + ' to ' + F.extFor(type).toUpperCase() + ', ' + w + ' x ' + h + ', ' + F.bytes(blob.size) };
    }
  });
})();
