/* GIF speed: rewrite each frame's delay in place. No re-encode, so no quality loss. */
(function () {
  'use strict';
  var F = window.FTM, G = window.FTG, $ = F.$;
  var factor = $('ftFactor'), fixed = $('ftFixed'), factorRow = $('ftFactorRow'), fixedRow = $('ftFixedRow'), info = $('ftTiming');
  var delays = null;

  function mode() { return document.querySelector('input[name="ftSpeedMode"]:checked').value; }
  function newDelay(old) {
    if (mode() === 'fixed') return Math.max(20, parseInt(fixed.value, 10) || 100);
    return Math.max(20, old / (parseFloat(factor.value) || 1));
  }
  function total(list) { return list.reduce(function (a, b) { return a + b; }, 0); }
  function cs(ms) { return Math.max(2, Math.round(ms / 10)) * 10; }
  function show() {
    if (!delays) { info.textContent = ''; return; }
    var after = delays.map(function (d) { return cs(newDelay(d)); });
    var clamped = delays.some(function (d) { return d / (parseFloat(factor.value) || 1) < 20; }) && mode() === 'factor';
    info.textContent = 'Now ' + (total(delays) / 1000).toFixed(2) + 's per loop. After: ' + (total(after) / 1000).toFixed(2) + 's.' + (clamped ? ' Some frames hit the 20 ms floor, so it can’t go quite that fast.' : '');
  }
  function syncMode() { var f = mode() === 'factor'; factorRow.hidden = !f; fixedRow.hidden = f; show(); }
  document.querySelectorAll('input[name="ftSpeedMode"]').forEach(function (r) { r.addEventListener('change', syncMode); });
  factor.addEventListener('change', show); fixed.addEventListener('input', show);
  syncMode();

  G.tool({
    needDecode: false,
    onLoad: function (s) { delays = G.readDelays(s.bytes); show(); },
    run: async function (s, progress) {
      var name = F.baseName(s.file.name) + '-' + (mode() === 'fixed' ? parseInt(fixed.value, 10) + 'ms' : factor.value + 'x') + '.gif';
      var patched = G.patchDelays(s.bytes, newDelay);
      if (patched) {
        progress(1);
        var blob = new Blob([patched], { type: 'image/gif' });
        return { blob: blob, name: name, note: 'Done. Only the timing changed, so the picture is exactly as it was.' };
      }
      // Rare: frames without timing blocks. Rebuild the GIF instead.
      var gif = await G.decode(s.bytes.buffer.slice(0));
      gif.frames.forEach(function (f) { f.delay = newDelay(f.delay); });
      var out = await G.encode(gif.frames, { width: gif.width, height: gif.height, onProgress: progress });
      return { blob: out, name: name, note: 'Done. This GIF had no timing info, so we rebuilt it.' };
    }
  });
})();
