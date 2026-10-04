/* GIF to MP4. First choice: WebCodecs H.264 + mp4-muxer (fast, exact timing, real MP4).
   Fallback: MediaRecorder, which plays through in real time and may give WebM. */
(function () {
  'use strict';
  var F = window.FTM, G = window.FTG, $ = F.$;
  var sizeSel = $('ftSize'), loopsSel = $('ftLoops'), bg = $('ftBg'), outVideo = $('ftOutVideo'), methodEl = $('ftMethod');
  var FPS = 30, outUrl = null;

  var hasCodecs = !!(window.VideoEncoder && window.VideoFrame);
  methodEl.textContent = hasCodecs ? 'Your browser can build a real MP4 (H.264) quickly.' :
    (window.FTV.supported ? 'Your browser can’t encode MP4 directly, so it records the GIF as it plays, in real time. ' + window.FTV.formatNote() : window.FTV.formatNote());

  function even(n) { return window.FTV.even(n); }
  function dims(gif) {
    var w = sizeSel.value === 'orig' ? gif.width : parseInt(sizeSel.value, 10);
    var h = w * gif.height / gif.width;
    return { w: even(Math.max(16, w)), h: even(Math.max(16, h)) };
  }
  // Pre-render each GIF frame onto the background at the output size.
  function frameCanvases(gif, W, H) {
    return gif.frames.map(function (f, i) {
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var ctx = c.getContext('2d');
      ctx.fillStyle = bg.value || '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(G.frameCanvas(gif, i), 0, 0, W, H);
      return c;
    });
  }
  function timeline(gif, loops) {
    var starts = [], t = 0;
    gif.frames.forEach(function (f) { starts.push(t); t += f.delay; });
    return { starts: starts, loopMs: t, totalMs: t * loops };
  }
  function frameAt(tl, ms) {
    var m = ms % tl.loopMs, i = tl.starts.length - 1;
    while (i > 0 && tl.starts[i] > m) i--;
    return i;
  }

  async function viaCodecs(gif, W, H, loops, progress) {
    var M = await F.lib.mp4muxer();
    var bitrate = Math.round(Math.max(3e5, Math.min(10e6, W * H * FPS * 0.08)));
    var config = null, codecs = ['avc1.640033', 'avc1.640028', 'avc1.4d0028', 'avc1.42001f'];
    for (var i = 0; i < codecs.length; i++) {
      var c = { codec: codecs[i], width: W, height: H, bitrate: bitrate, framerate: FPS, avc: { format: 'avc' } };
      try { var sup = await VideoEncoder.isConfigSupported(c); if (sup.supported) { config = c; break; } } catch (e) {}
    }
    if (!config) return null;
    var muxer = new M.Muxer({ target: new M.ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H }, fastStart: 'in-memory' });
    var failure = null;
    var enc = new VideoEncoder({ output: function (chunk, meta) { muxer.addVideoChunk(chunk, meta); }, error: function (e) { failure = e; } });
    enc.configure(config);
    var frames = frameCanvases(gif, W, H), tl = timeline(gif, loops);
    var n = Math.max(1, Math.round(tl.totalMs / 1000 * FPS)), dur = 1e6 / FPS;
    for (var k = 0; k < n; k++) {
      if (failure) throw failure;
      var vf = new VideoFrame(frames[frameAt(tl, k * 1000 / FPS)], { timestamp: Math.round(k * dur), duration: Math.round(dur) });
      enc.encode(vf, { keyFrame: k % (FPS * 2) === 0 });
      vf.close();
      if (enc.encodeQueueSize > 8) await new Promise(function (r) { setTimeout(r, 5); });
      if (k % 10 === 0) { progress(k / n); await F.tick(); }
    }
    await enc.flush();
    if (failure) throw failure;
    enc.close();
    muxer.finalize();
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', frames: n };
  }

  async function viaRecorder(gif, W, H, loops, progress) {
    if (!window.FTV.supported) throw new Error('This browser can’t make video files. Try the latest Chrome, Edge or Safari.');
    var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var frames = frameCanvases(gif, W, H), tl = timeline(gif, loops);
    ctx.drawImage(frames[0], 0, 0);
    var stream = canvas.captureStream(FPS);
    var rec = new MediaRecorder(stream, { mimeType: window.FTV.mime.replace(/,mp4a[^"]*$/, '').replace(/,opus$/, ''), videoBitsPerSecond: 6000000 });
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    var stopped = new Promise(function (r) { rec.onstop = r; });
    rec.start(500);
    var t0 = performance.now();
    await new Promise(function (resolve) {
      (function loop() {
        var el = performance.now() - t0;
        if (el >= tl.totalMs) { resolve(); return; }
        ctx.drawImage(frames[frameAt(tl, el)], 0, 0);
        progress(el / tl.totalMs);
        requestAnimationFrame(loop);
      })();
    });
    await new Promise(function (r) { setTimeout(r, 120); });
    rec.stop(); await stopped;
    stream.getTracks().forEach(function (t) { t.stop(); });
    var type = (rec.mimeType || 'video/webm').split(';')[0];
    return { blob: new Blob(chunks, { type: type }), ext: type.indexOf('mp4') > -1 ? 'mp4' : 'webm' };
  }

  G.tool({
    run: async function (s, progress) {
      var d = dims(s.gif), loops = parseInt(loopsSel.value, 10) || 1, r = null;
      if (hasCodecs) r = await viaCodecs(s.gif, d.w, d.h, loops, progress);
      var slow = !r;
      if (!r) r = await viaRecorder(s.gif, d.w, d.h, loops, progress);
      if (outUrl) URL.revokeObjectURL(outUrl);
      outUrl = URL.createObjectURL(r.blob);
      outVideo.src = outUrl; outVideo.hidden = false;
      var name = F.baseName(s.file.name) + '.' + r.ext;
      var secs = (timeline(s.gif, loops).totalMs / 1000).toFixed(1);
      return {
        blob: r.blob, name: name,
        text: name + ': ' + d.w + ' x ' + d.h + ', ' + secs + 's, ' + F.bytes(r.blob.size) + ', ' + r.ext.toUpperCase() + '.',
        note: r.ext === 'webm' ? 'Done. Your browser could only make WebM, not MP4. Most sites accept it; for MP4, use Chrome, Edge or Safari.' : (slow ? 'Done. Recorded in real time.' : 'Done. Your MP4’s ready.')
      };
    }
  });
})();
