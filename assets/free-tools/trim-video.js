/* Trim a video: keep the part between start and end, sound included. */
(function () {
  'use strict';
  var F = window.FTM, V = window.FTV;
  V.tool({
    run: async function (s, progress) {
      var r = s.range(), v = s.video;
      var scale = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight));
      var w = V.even(v.videoWidth * scale), h = V.even(v.videoHeight * scale);
      var out = await V.record({ video: v, t0: r[0], t1: r[1], width: w, height: h, audio: true, vbps: w * h > 1e6 ? 8000000 : 5000000, onProgress: progress });
      var name = s.name + '-trimmed.' + out.ext;
      return { blob: out.blob, name: name, text: name + ': ' + (r[1] - r[0]).toFixed(1) + ' seconds, ' + w + ' x ' + h + ', ' + F.bytes(out.blob.size) + ', ' + out.ext.toUpperCase() + '.' };
    }
  });
})();
