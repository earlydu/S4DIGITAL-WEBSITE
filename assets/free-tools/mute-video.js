/* Mute a video: re-record the picture with no sound track at all. */
(function () {
  'use strict';
  var F = window.FTM, V = window.FTV;
  V.tool({
    run: async function (s, progress) {
      var v = s.video;
      var scale = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight));
      var w = V.even(v.videoWidth * scale), h = V.even(v.videoHeight * scale);
      var out = await V.record({ video: v, t0: 0, t1: v.duration, width: w, height: h, audio: false, vbps: w * h > 1e6 ? 8000000 : 5000000, onProgress: progress });
      var name = s.name + '-muted.' + out.ext;
      return { blob: out.blob, name: name, text: name + ': no sound, ' + w + ' x ' + h + ', ' + F.bytes(out.blob.size) + ', ' + out.ext.toUpperCase() + '.' };
    }
  });
})();
