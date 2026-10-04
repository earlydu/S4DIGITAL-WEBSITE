/* Extract audio: decode the sound from a video file and save it as a WAV.
   Uses the browser's own decoder, so it's fast and doesn't play through. */
(function () {
  'use strict';
  var F = window.FTM, V = window.FTV, $ = F.$;
  var rate = $('ftRate'), chans = $('ftChannels'), player = $('ftAudioOut');
  var outUrl = null;

  function wav(buffer, t0, t1, mono) {
    var sr = buffer.sampleRate, a = Math.floor(t0 * sr), b = Math.min(buffer.length, Math.ceil(t1 * sr));
    var len = Math.max(0, b - a), nc = mono ? 1 : Math.min(2, buffer.numberOfChannels);
    var chs = [];
    for (var c = 0; c < buffer.numberOfChannels; c++) chs.push(buffer.getChannelData(c));
    var out = new DataView(new ArrayBuffer(44 + len * nc * 2));
    function str(o, s) { for (var i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); out.setUint32(4, 36 + len * nc * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, nc, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * nc * 2, true); out.setUint16(32, nc * 2, true); out.setUint16(34, 16, true);
    str(36, 'data'); out.setUint32(40, len * nc * 2, true);
    var o = 44;
    for (var i = a; i < b; i++) {
      for (var k = 0; k < nc; k++) {
        var v;
        if (mono) { v = 0; for (var m = 0; m < chs.length; m++) v += chs[m][i]; v /= chs.length; }
        else v = chs[Math.min(k, chs.length - 1)][i];
        v = Math.max(-1, Math.min(1, v));
        out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
      }
    }
    return new Blob([out], { type: 'audio/wav' });
  }

  V.tool({
    needsRecorder: false,
    run: async function (s, progress) {
      var r = s.range();
      if (s.file.size > 1.5e9) throw new Error('That file’s too big to decode in the browser. Trim it first, or try a smaller file.');
      progress(0.1);
      var buf = await s.file.arrayBuffer();
      progress(0.3);
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var sr = parseInt(rate.value, 10) || 48000;
      var ctx = new OAC(2, sr, sr);
      var audio;
      try { audio = await ctx.decodeAudioData(buf); }
      catch (e) { throw new Error('No sound we can read in that file. It may have no audio track, or use a codec this browser can’t decode.'); }
      progress(0.8);
      var blob = wav(audio, r[0], r[1], chans.value === 'mono');
      if (outUrl) URL.revokeObjectURL(outUrl);
      outUrl = URL.createObjectURL(blob);
      player.src = outUrl; player.hidden = false;
      var name = s.name + '.wav';
      return { blob: blob, name: name, text: name + ': ' + (r[1] - r[0]).toFixed(1) + ' seconds, ' + (sr / 1000) + ' kHz, ' + (chans.value === 'mono' ? 'mono' : (audio.numberOfChannels > 1 ? 'stereo' : 'mono')) + ', ' + F.bytes(blob.size) + '.', note: 'Done. Your WAV’s ready.' };
    }
  });
})();
