/* GIF optimiser: fewer colours, fewer frames, smaller size, and frame-to-frame
   transparency so unchanged pixels cost almost nothing. Shows before and after. */
(function () {
  'use strict';
  var F = window.FTM, G = window.FTG, $ = F.$;
  var colors = $('ftColors'), skip = $('ftSkip'), scale = $('ftScale'), lossy = $('ftLossy'), compare = $('ftCompare');

  G.tool({
    onLoad: function () { compare.hidden = true; },
    run: async function (s, progress) {
      var gif = s.gif, keep = parseInt(skip.value, 10) || 1, sc = (parseInt(scale.value, 10) || 100) / 100;
      var W = Math.max(1, Math.round(gif.width * sc)), H = Math.max(1, Math.round(gif.height * sc));
      var frames = await G.scaleFrames(gif, W, H, function (f) { progress(0.2 * f); });
      if (keep > 1) {
        var merged = [];
        for (var i = 0; i < frames.length; i += keep) {
          var d = 0;
          for (var j = i; j < Math.min(frames.length, i + keep); j++) d += frames[j].delay;
          merged.push({ data: frames[i].data, delay: d });
        }
        frames = merged;
      }
      var blob = await G.encode(frames, {
        width: W, height: H, colors: parseInt(colors.value, 10) || 256, tolerance: parseInt(lossy.value, 10) || 0,
        onProgress: function (f) { progress(0.2 + 0.8 * f); }
      });
      var before = s.file.size, after = blob.size;
      compare.hidden = false;
      compare.querySelector('[data-before]').textContent = F.bytes(before);
      compare.querySelector('[data-after]').textContent = F.bytes(after);
      compare.querySelector('[data-saving]').textContent = F.saving(before, after);
      compare.classList.toggle('is-worse', after >= before);
      var name = F.baseName(s.file.name) + '-optimised.gif';
      var note = after >= before ?
        'This GIF was already tight, and our version came out bigger. Keep your original, or try fewer colours, fewer frames or a smaller size.' :
        'Done. ' + F.saving(before, after) + ' than the original.';
      return { blob: blob, name: name, note: note, text: name + ': ' + W + ' x ' + H + ', ' + frames.length + ' frames, ' + F.bytes(after) + '.' };
    }
  });
})();
