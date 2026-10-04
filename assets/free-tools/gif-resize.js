/* GIF resize: scale every frame, keep the timing. */
(function () {
  'use strict';
  var F = window.FTM, G = window.FTG, $ = F.$;
  var wIn = $('ftW'), hIn = $('ftH'), lock = $('ftLock'), pct = $('ftPct'), pxRow = $('ftPxRow'), pctRow = $('ftPctRow'), sizeOut = $('ftNewSize');
  var gif = null;

  function mode() { return document.querySelector('input[name="ftMode"]:checked').value; }
  function target() {
    if (!gif) return null;
    var w, h;
    if (mode() === 'pct') {
      var p = Math.max(1, Math.min(400, parseFloat(pct.value) || 100)) / 100;
      w = gif.width * p; h = gif.height * p;
    } else {
      w = parseInt(wIn.value, 10) || gif.width; h = parseInt(hIn.value, 10) || gif.height;
    }
    return { w: Math.max(1, Math.min(4000, Math.round(w))), h: Math.max(1, Math.min(4000, Math.round(h))) };
  }
  function show() { var t = target(); sizeOut.textContent = t ? 'New size: ' + t.w + ' x ' + t.h + '.' : ''; }
  function syncMode() { var px = mode() === 'px'; pxRow.hidden = !px; pctRow.hidden = px; show(); }
  document.querySelectorAll('input[name="ftMode"]').forEach(function (r) { r.addEventListener('change', syncMode); });
  wIn.addEventListener('input', function () { if (gif && lock.checked) hIn.value = Math.max(1, Math.round((parseInt(wIn.value, 10) || 0) * gif.height / gif.width)); show(); });
  hIn.addEventListener('input', function () { if (gif && lock.checked) wIn.value = Math.max(1, Math.round((parseInt(hIn.value, 10) || 0) * gif.width / gif.height)); show(); });
  pct.addEventListener('input', show);
  syncMode();

  G.tool({
    onLoad: function (s) { gif = s.gif; wIn.value = gif.width; hIn.value = gif.height; show(); },
    run: async function (s, progress) {
      var t = target();
      var frames = await G.scaleFrames(gif, t.w, t.h, function (f) { progress(0.3 * f); });
      var blob = await G.encode(frames, { width: t.w, height: t.h, onProgress: function (f) { progress(0.3 + 0.7 * f); } });
      var name = F.baseName(s.file.name) + '-' + t.w + 'x' + t.h + '.gif';
      return { blob: blob, name: name, text: name + ': ' + t.w + ' x ' + t.h + ', ' + frames.length + ' frames, ' + F.bytes(blob.size) + '.' };
    }
  });
})();
