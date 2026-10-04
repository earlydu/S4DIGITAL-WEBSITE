/* Compress a video: re-record at a lower resolution and bitrate. Real time. */
(function () {
  'use strict';
  var F = window.FTM, V = window.FTV, $ = F.$;
  var res = $('ftRes'), qual = $('ftQual'), keepAudio = $('ftAudio'), est = $('ftEstimate');
  var BPP = { high: 0.1, balanced: 0.05, small: 0.025 };

  function plan(v) {
    var cap = parseInt(res.value, 10) || 0, long = Math.max(v.videoWidth, v.videoHeight);
    var s = cap && long > cap ? cap / long : 1;
    var w = V.even(v.videoWidth * s), h = V.even(v.videoHeight * s);
    var vbps = Math.round(Math.max(300000, Math.min(12000000, w * h * 30 * BPP[qual.value])));
    var abps = keepAudio.checked ? 128000 : 0;
    return { w: w, h: h, vbps: vbps, abps: abps, bytes: (vbps + abps) * v.duration / 8 };
  }
  var state;
  function show() {
    if (!state || !state.loaded) { est.textContent = ''; return; }
    var p = plan(state.video), orig = state.file.size;
    est.textContent = 'Output: ' + p.w + ' x ' + p.h + ' at about ' + (p.vbps / 1e6).toFixed(1) + ' Mbps. Expect roughly ' + F.bytes(p.bytes) + ' (now ' + F.bytes(orig) + ').' +
      (p.bytes >= orig * 0.95 ? ' That’s not much smaller, so try a lower resolution or the Smallest setting.' : '');
  }
  [res, qual, keepAudio].forEach(function (el) { el.addEventListener('change', show); });

  state = V.tool({
    onLoad: function () { show(); },
    run: async function (s, progress) {
      var v = s.video, p = plan(v);
      var out = await V.record({ video: v, t0: 0, t1: v.duration, width: p.w, height: p.h, audio: keepAudio.checked, vbps: p.vbps, abps: 128000, onProgress: progress });
      var name = s.name + '-compressed.' + out.ext, before = s.file.size, after = out.blob.size;
      return {
        blob: out.blob, name: name,
        text: name + ': ' + p.w + ' x ' + p.h + ', ' + F.bytes(before) + ' to ' + F.bytes(after) + ' (' + F.saving(before, after) + ').',
        note: after >= before ? 'Finished, but it came out bigger than the original, which happens with clips that were already well compressed. Keep your original, or try a lower setting.' : 'Finished. ' + F.saving(before, after) + ' than the original.'
      };
    }
  });
})();
