/* Video to GIF: seek frame by frame, draw to canvas, encode with gifenc. */
(function () {
  'use strict';
  var F = window.FTM, $ = F.$;
  var fps = $('ftFps'), width = $('ftWidth'), loop = $('ftLoop'), est = $('ftEstimate'), out = $('ftOut');
  var MAX_FRAMES = 600, outUrl = null;

  function plan(state) {
    var r = state.range(), v = state.video, f = parseInt(fps.value, 10) || 12;
    var w = Math.max(32, Math.min(1200, parseInt(width.value, 10) || 480));
    if (v.videoWidth && w > v.videoWidth) w = v.videoWidth;
    var h = v.videoWidth ? Math.max(2, Math.round(w * v.videoHeight / v.videoWidth)) : 0;
    var n = Math.max(1, Math.floor((r[1] - r[0]) * f + 1e-6));
    return { t0: r[0], t1: r[1], fps: f, w: w, h: h, n: n };
  }
  function showEstimate(state) {
    if (!state.loaded) { est.textContent = ''; return; }
    var p = plan(state);
    est.textContent = p.n + ' frames at ' + p.w + ' x ' + p.h + '.' + (p.n > MAX_FRAMES ? ' That’s over the ' + MAX_FRAMES + ' frame limit, so shorten the clip or lower the frame rate.' : '');
  }

  var state = window.FTV.tool({
    needsRecorder: false,
    onLoad: function (s) {
      if (s.video.duration > 10) $('ftEnd').value = Math.min(s.video.duration, 5).toFixed(1);
      showEstimate(s);
    },
    onRange: function (s) { showEstimate(s); },
    run: async function (s, progress) {
      var p = plan(s), v = s.video;
      if (p.n > MAX_FRAMES) throw new Error('That would be ' + p.n + ' frames. Keep it under ' + MAX_FRAMES + ' by trimming or lowering the frame rate.');
      v.pause();
      var c = document.createElement('canvas'); c.width = p.w; c.height = p.h;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      var frames = [], step = 1 / p.fps;
      for (var i = 0; i < p.n; i++) {
        var t = Math.min(p.t0 + i * step, Math.max(0, v.duration - 0.001));
        await window.FTV.seek(v, t);
        ctx.drawImage(v, 0, 0, p.w, p.h);
        frames.push({ data: ctx.getImageData(0, 0, p.w, p.h).data, delay: 1000 / p.fps });
        progress(0.5 * (i + 1) / p.n);
      }
      var blob = await window.FTG.encode(frames, {
        width: p.w, height: p.h, colors: 256, repeat: parseInt(loop.value, 10),
        onProgress: function (f) { progress(0.5 + 0.5 * f); }
      });
      if (outUrl) URL.revokeObjectURL(outUrl);
      outUrl = URL.createObjectURL(blob);
      out.src = outUrl; out.hidden = false;
      var name = s.name + '.gif';
      return { blob: blob, name: name, text: name + ': ' + p.w + ' x ' + p.h + ', ' + p.n + ' frames, ' + F.bytes(blob.size) + '.' };
    }
  });
  [fps, width].forEach(function (el) { el.addEventListener('change', function () { showEstimate(state); }); el.addEventListener('input', function () { showEstimate(state); }); });
})();
