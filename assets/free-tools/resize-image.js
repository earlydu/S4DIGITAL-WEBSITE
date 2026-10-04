/* Resize images by pixels or percentage, in a batch. */
(function () {
  'use strict';
  var F = window.FTM, $ = F.$;
  var wIn = $('ftW'), hIn = $('ftH'), lock = $('ftLock'), pct = $('ftPct'), pxRow = $('ftPxRow'), pctRow = $('ftPctRow'), hint = $('ftPxHint');

  function mode() { return document.querySelector('input[name="ftMode"]:checked').value; }
  function syncMode() { var px = mode() === 'px'; pxRow.hidden = !px; pctRow.hidden = px; hint.hidden = !px; }
  document.querySelectorAll('input[name="ftMode"]').forEach(function (r) { r.addEventListener('change', syncMode); });
  syncMode();

  function size(iw, ih) {
    if (mode() === 'pct') {
      var p = Math.max(1, Math.min(400, parseFloat(pct.value) || 100)) / 100;
      return [Math.max(1, Math.round(iw * p)), Math.max(1, Math.round(ih * p))];
    }
    var w = parseInt(wIn.value, 10) || 0, h = parseInt(hIn.value, 10) || 0;
    if (!w && !h) throw new Error('Enter a width or a height.');
    if (lock.checked) {
      if (w && h) { var s = Math.min(w / iw, h / ih); return [Math.max(1, Math.round(iw * s)), Math.max(1, Math.round(ih * s))]; }
      if (w) return [w, Math.max(1, Math.round(ih * w / iw))];
      return [Math.max(1, Math.round(iw * h / ih)), h];
    }
    return [w || iw, h || ih];
  }

  F.batch({
    zipName: 'resized-images',
    settings: [wIn, hIn, lock, pct],
    process: async function (file, img) {
      var iw = img.naturalWidth, ih = img.naturalHeight, d = size(iw, ih);
      if (d[0] > 12000 || d[1] > 12000) throw new Error('That’s too big. Keep it under 12,000 pixels a side.');
      var src = F.typeFor(file), native = /^image\/(jpeg|png|webp)$/.test(file.type || '') || /\.(jpe?g|png|webp)$/i.test(file.name);
      var type = native && !F.isHeic(file) ? src : 'image/jpeg';
      if (type === 'image/webp' && !F.webpOk) type = 'image/png';
      var c = F.drawScaled(img, iw, ih, d[0], d[1], { background: type === 'image/jpeg' ? '#ffffff' : null });
      var blob = await F.canvasToBlob(c, type, 0.92);
      return { blob: blob, name: F.baseName(file.name) + '-' + d[0] + 'x' + d[1] + '.' + F.extFor(type), info: iw + ' x ' + ih + ' to ' + d[0] + ' x ' + d[1] + ', ' + F.bytes(blob.size) };
    }
  });
})();
