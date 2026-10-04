/* Video helpers: load a clip into a <video>, pick a range, and re-record it through
   <canvas> + Web Audio + MediaRecorder. Plays through in real time. Nothing is uploaded. */
(function () {
  'use strict';
  var F = window.FTM;

  var CANDIDATES = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1.4D0028,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  var mime = '';
  if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
    for (var i = 0; i < CANDIDATES.length; i++) if (MediaRecorder.isTypeSupported(CANDIDATES[i])) { mime = CANDIDATES[i]; break; }
  }
  var supported = !!(window.MediaRecorder && mime && HTMLCanvasElement.prototype.captureStream);
  var isMp4 = mime.indexOf('mp4') > -1;
  function formatNote() {
    return !supported ? 'Your browser can’t record video, so this tool won’t work here. Try the latest Chrome, Edge, Safari or Firefox.' :
      (isMp4 ? 'Your browser will save MP4 (H.264).' : 'Your browser will save WebM, not MP4. Chrome, Edge and Safari save MP4.');
  }

  function even(n) { n = Math.max(2, Math.round(n)); return n % 2 ? n - 1 : n; }

  function seek(video, t) {
    return new Promise(function (resolve) {
      if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) { resolve(); return; }
      var done = function () { clearTimeout(to); video.removeEventListener('seeked', done); resolve(); };
      var to = setTimeout(done, 3000);
      video.addEventListener('seeked', done);
      video.currentTime = t;
    });
  }

  var audioGraphs = new WeakMap();
  function audioFor(video) {
    if (audioGraphs.has(video)) return audioGraphs.get(video);
    var AC = window.AudioContext || window.webkitAudioContext, g = null;
    if (AC) {
      try {
        var ac = new AC(), src = ac.createMediaElementSource(video), speakers = ac.createGain(), dest = ac.createMediaStreamDestination();
        src.connect(speakers); speakers.connect(ac.destination); src.connect(dest);
        g = { ctx: ac, speakers: speakers, dest: dest };
      } catch (e) { g = null; }
    }
    audioGraphs.set(video, g);
    return g;
  }

  // opts: { video, t0, t1, width, height, audio (bool), vbps, abps, onProgress(frac) }
  async function record(o) {
    if (!supported) throw new Error('This browser can’t record video.');
    var video = o.video, canvas = document.createElement('canvas');
    canvas.width = o.width; canvas.height = o.height;
    var ctx = canvas.getContext('2d');
    var draw = function () { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); };
    var a = o.audio ? audioFor(video) : null;
    var wasMuted = video.muted, hadControls = video.controls;
    video.pause();
    video.controls = false;
    if (a) { a.speakers.gain.value = 0; if (a.ctx.state === 'suspended') await a.ctx.resume(); }
    else video.muted = true;
    await seek(video, o.t0);
    draw();
    var stream = canvas.captureStream(30);
    var tracks = stream.getVideoTracks();
    if (a) tracks = tracks.concat(a.dest.stream.getAudioTracks());
    var rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: o.vbps || 6000000, audioBitsPerSecond: o.abps || 160000 });
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    var stopped = new Promise(function (res, rej) { rec.onstop = res; rec.onerror = function (e) { rej(e.error || new Error('The recorder stopped unexpectedly.')); }; });
    var raf = 0, vfc = 0, len = Math.max(0.1, o.t1 - o.t0);
    try {
      rec.start(1000);
      await video.play();
      await new Promise(function (resolve) {
        var finished = false;
        var finish = function () { if (finished) return; finished = true; video.removeEventListener('ended', finish); cancelAnimationFrame(raf); resolve(); };
        video.addEventListener('ended', finish);
        var step = function () {
          if (finished) return;
          draw();
          if (o.onProgress) o.onProgress((video.currentTime - o.t0) / len);
          if (video.currentTime >= o.t1) { finish(); return; }
          if (video.requestVideoFrameCallback) vfc = video.requestVideoFrameCallback(step);
          else raf = requestAnimationFrame(step);
        };
        step();
      });
      video.pause();
      draw();
      await new Promise(function (r) { setTimeout(r, 150); });
      rec.stop();
      await stopped;
    } finally {
      try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
      stream.getTracks().forEach(function (t) { t.stop(); });
      if (a) a.speakers.gain.value = 1;
      video.muted = wasMuted;
      video.controls = hadControls;
      video.pause();
    }
    var type = (rec.mimeType || mime).split(';')[0];
    var blob = new Blob(chunks, { type: type });
    if (!blob.size) throw new Error('The recording came out empty.');
    return { blob: blob, ext: type.indexOf('mp4') > -1 ? 'mp4' : 'webm' };
  }

  // Standard controller. Markup ids: ftDrop, ftFile, ftVideo, ftEmpty, ftMeta, ftStart, ftEnd, ftSetStart, ftSetEnd,
  // ftGo, ftProgWrap, ftProg, ftStatus, ftResult, ftResultText, ftDownload, ftFormat (optional).
  // cfg: { needsRecorder (default true), onLoad(state), run(state, progress) -> Promise<{blob, name, text, note}> }
  function tool(cfg) {
    var $ = F.$;
    var drop = $('ftDrop'), input = $('ftFile'), video = $('ftVideo'), empty = $('ftEmpty'), meta = $('ftMeta');
    var startIn = $('ftStart'), endIn = $('ftEnd'), setStart = $('ftSetStart'), setEnd = $('ftSetEnd');
    var go = $('ftGo'), progWrap = $('ftProgWrap'), prog = $('ftProg'), statusEl = $('ftStatus');
    var result = $('ftResult'), resultText = $('ftResultText'), dl = $('ftDownload'), fmtEl = $('ftFormat');
    var needsRec = cfg.needsRecorder !== false;
    var state = { file: null, video: video, loaded: false, busy: false, srcUrl: null };
    var goLabel = go.querySelector('span').textContent;
    if (fmtEl && needsRec) fmtEl.textContent = formatNote();
    var trimEls = [startIn, endIn, setStart, setEnd].filter(Boolean);

    function enable() {
      var on = state.loaded && !state.busy;
      trimEls.forEach(function (el) { el.disabled = !on; });
      go.disabled = !on || (needsRec && !supported);
      go.querySelector('span').textContent = state.busy ? 'Working…' : goLabel;
    }
    enable();
    state.range = function () {
      var d = video.duration || 0;
      if (!startIn) return [0, d];
      var s = Math.max(0, Math.min(parseFloat(startIn.value) || 0, d));
      var e = parseFloat(endIn.value);
      if (!isFinite(e) || e <= 0 || e > d) e = d;
      return [s, e];
    };

    function load(file) {
      if (state.busy) return;
      if (file.type && file.type.indexOf('video/') !== 0) { F.status(statusEl, 'That doesn’t look like a video file.', true); return; }
      result.hidden = true;
      state.loaded = false; enable();
      state.file = file;
      if (state.srcUrl) URL.revokeObjectURL(state.srcUrl);
      state.srcUrl = URL.createObjectURL(file);
      state.name = F.baseName(file.name);
      F.status(statusEl, 'Opening ' + file.name + '…');
      video.src = state.srcUrl;
      video.load();
    }
    video.addEventListener('loadedmetadata', async function () {
      if (!video.videoWidth && !cfg.audioOnly) {
        F.status(statusEl, 'That file has no picture this browser can show. Try a standard MP4 (H.264).', true);
        return;
      }
      state.loaded = true;
      if (empty) empty.hidden = true;
      video.hidden = false;
      if (startIn) {
        startIn.max = endIn.max = video.duration.toFixed(1);
        startIn.value = 0; endIn.value = video.duration.toFixed(1);
      }
      meta.textContent = state.file.name + ': ' + (video.videoWidth ? video.videoWidth + ' x ' + video.videoHeight + ', ' : '') + F.fmtTime(video.duration) + ', ' + F.bytes(state.file.size);
      enable();
      if (cfg.onLoad) await cfg.onLoad(state);
      F.status(statusEl, 'Ready.');
    });
    video.addEventListener('error', function () {
      if (!video.getAttribute('src')) return;
      state.loaded = false; enable();
      F.status(statusEl, 'This browser can’t open that file. iPhone HEVC clips often won’t play in Chrome on Windows. Convert it to a standard MP4 (H.264) first.', true);
    });
    F.bindDrop(drop, input, function (files) { load(files[0]); });

    function check() {
      var r = state.range();
      if (r[1] - r[0] < 0.2) { F.status(statusEl, 'The end needs to be after the start.', true); return false; }
      F.status(statusEl, 'Using ' + F.fmtTime(r[0]) + ' to ' + F.fmtTime(r[1]) + ' (' + (r[1] - r[0]).toFixed(1) + ' seconds).');
      if (cfg.onRange) cfg.onRange(state);
      return true;
    }
    if (setStart) setStart.addEventListener('click', function () { startIn.value = video.currentTime.toFixed(1); check(); });
    if (setEnd) setEnd.addEventListener('click', function () { endIn.value = video.currentTime.toFixed(1); check(); });
    if (startIn) { startIn.addEventListener('change', check); endIn.addEventListener('change', check); }

    go.addEventListener('click', async function () {
      if (!state.loaded || state.busy) return;
      if (startIn && !check()) return;
      state.busy = true; enable();
      result.hidden = true;
      F.progress(progWrap, prog, 0);
      F.status(statusEl, needsRec ? 'Recording. Keep this tab open and in view.' : 'Working on it…');
      try {
        var r = await cfg.run(state, function (f) { F.progress(progWrap, prog, f); });
        F.setDownload(dl, r.blob, r.name);
        resultText.textContent = r.text || (r.name + ', ' + F.bytes(r.blob.size) + '.');
        result.hidden = false;
        F.progress(progWrap, prog, 1);
        F.status(statusEl, r.note || 'Finished. Your file’s ready.');
      } catch (err) {
        F.progress(progWrap, prog, null);
        F.status(statusEl, ((err && err.message) || 'Something went wrong') + (needsRec ? ' Try a shorter clip, or another browser.' : ''), true);
      }
      state.busy = false; enable();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.busy && needsRec) F.status(statusEl, 'This tab is in the background, which can freeze the picture. Bring it back to the front.', true);
      else if (!document.hidden && state.busy && needsRec) F.status(statusEl, 'Recording. Keep this tab open and in view.');
    });
    window.addEventListener('beforeunload', function (e) { if (state.busy) { e.preventDefault(); e.returnValue = ''; } });
    if (needsRec && !supported) F.status(statusEl, formatNote(), true);
    return state;
  }

  window.FTV = { record: record, tool: tool, seek: seek, even: even, supported: supported, isMp4: isMp4, mime: mime, formatNote: formatNote };
})();
