/* Video resizer: <video> -> <canvas> -> captureStream + WebAudio -> MediaRecorder. Nothing leaves the browser. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var video = $('vrVideo'), canvas = $('vrCanvas'), ctx = canvas.getContext('2d');
  var fileInput = $('vrFile'), drop = $('vrDrop'), empty = $('vrEmpty');
  var playBtn = $('vrPlay'), scrub = $('vrScrub'), timeEl = $('vrTime'), nameEl = $('vrFileName');
  var fx = $('vrFx'), fy = $('vrFy'), focusRow = $('vrFocus'), focusHint = $('vrFocusHint');
  var startIn = $('vrStart'), endIn = $('vrEnd'), setStart = $('vrSetStart'), setEnd = $('vrSetEnd');
  var exportBtn = $('vrExport'), statusEl = $('vrStatus'), progWrap = $('vrProgressWrap'), prog = $('vrProgress');
  var result = $('vrResult'), resultText = $('vrResultText'), dl = $('vrDownload'), fmtEl = $('vrFormat');

  var SIZES = { '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '16:9': [1920, 1080] };
  var state = { ratio: '9:16', mode: 'fill', fx: 0.5, fy: 0.5, loaded: false, exporting: false, name: 'video', srcUrl: null, outUrl: null };
  var blurCanvas = document.createElement('canvas'), blurCtx = blurCanvas.getContext('2d');
  var canFilter = typeof ctx.filter === 'string';
  var audio = null; // { ctx, source, speakers, dest } built once, on first play or export

  // ---------- output format detection ----------
  var MIME_CANDIDATES = [
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
    for (var i = 0; i < MIME_CANDIDATES.length; i++) {
      if (MediaRecorder.isTypeSupported(MIME_CANDIDATES[i])) { mime = MIME_CANDIDATES[i]; break; }
    }
  }
  var isMp4 = mime.indexOf('mp4') > -1;
  var supported = !!(window.MediaRecorder && canvas.captureStream && mime);
  fmtEl.textContent = !supported ? 'Your browser can’t record video, so export won’t work here' :
    (isMp4 ? 'Your browser will export MP4 (H.264)' : 'Your browser will export WebM');

  // ---------- helpers ----------
  function fmt(t) {
    if (!isFinite(t)) t = 0;
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function setStatus(msg, isErr) { statusEl.textContent = msg || ''; statusEl.classList.toggle('is-error', !!isErr); }
  function outSize() { return SIZES[state.ratio]; }
  function trimRange() {
    var d = video.duration || 0;
    var s = Math.max(0, Math.min(parseFloat(startIn.value) || 0, d));
    var e = parseFloat(endIn.value);
    if (!isFinite(e) || e <= 0 || e > d) e = d;
    return [s, e];
  }
  function setEnabled(on) {
    [playBtn, scrub, startIn, endIn, setStart, setEnd].forEach(function (el) { el.disabled = !on; });
    exportBtn.disabled = !on || !supported;
  }

  // ---------- drawing ----------
  function draw() {
    var size = outSize(), W = size[0], H = size[1];
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!state.loaded || !vw || !vh) return;

    if (state.mode === 'fill') {
      var s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
      ctx.drawImage(video, (W - dw) * state.fx, (H - dh) * state.fy, dw, dh);
      return;
    }

    // Blurred background: draw small (cheap), blur, scale back up.
    var bw = Math.max(16, Math.round(W / 8)), bh = Math.max(16, Math.round(H / 8));
    if (blurCanvas.width !== bw || blurCanvas.height !== bh) { blurCanvas.width = bw; blurCanvas.height = bh; }
    var bs = Math.max(bw / vw, bh / vh) * 1.15, bdw = vw * bs, bdh = vh * bs;
    if (canFilter) blurCtx.filter = 'blur(4px)';
    blurCtx.drawImage(video, (bw - bdw) / 2, (bh - bdh) / 2, bdw, bdh);
    if (canFilter) blurCtx.filter = 'none';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(blurCanvas, -W * 0.04, -H * 0.04, W * 1.08, H * 1.08);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(0, 0, W, H);

    var c = Math.min(W / vw, H / vh), cw = vw * c, ch = vh * c;
    ctx.drawImage(video, (W - cw) / 2, (H - ch) / 2, cw, ch);
  }

  var previewRaf = 0;
  function previewLoop() {
    draw();
    updateTime();
    if (!video.paused && !video.ended && !state.exporting) previewRaf = requestAnimationFrame(previewLoop);
  }
  function updateTime() {
    timeEl.textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
    if (!scrubbing) scrub.value = video.currentTime;
  }

  // ---------- audio graph ----------
  function ensureAudio() {
    if (audio) return audio;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      var ac = new AC();
      var source = ac.createMediaElementSource(video);
      var speakers = ac.createGain();
      var dest = ac.createMediaStreamDestination();
      source.connect(speakers); speakers.connect(ac.destination);
      source.connect(dest);
      audio = { ctx: ac, source: source, speakers: speakers, dest: dest };
    } catch (err) {
      audio = null;
    }
    return audio;
  }

  // ---------- loading ----------
  function loadFile(file) {
    if (!file) return;
    if (state.exporting) { setStatus('Wait for the export to finish first.', true); return; }
    if (file.type && file.type.indexOf('video/') !== 0) { setStatus('That doesn’t look like a video file.', true); return; }
    setStatus('Opening ' + file.name + '…');
    result.hidden = true;
    state.loaded = false;
    setEnabled(false);
    if (state.srcUrl) URL.revokeObjectURL(state.srcUrl);
    state.srcUrl = URL.createObjectURL(file);
    state.name = file.name.replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'video';
    nameEl.textContent = file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB)';
    video.src = state.srcUrl;
    video.load();
  }

  video.addEventListener('loadedmetadata', function () {
    if (!video.videoWidth) {
      setStatus('That file has no picture this browser can show. Try a standard MP4 (H.264).', true);
      return;
    }
    state.loaded = true;
    empty.hidden = true;
    scrub.max = video.duration;
    startIn.max = endIn.max = video.duration.toFixed(1);
    startIn.value = 0;
    endIn.value = video.duration.toFixed(1);
    setEnabled(true);
    var note = video.duration > 600 ? ' It’s a long clip, so export will take as long as it plays. Trimming first helps.' : '';
    setStatus('Loaded: ' + video.videoWidth + ' x ' + video.videoHeight + ', ' + fmt(video.duration) + '.' + note);
    // Nudge off zero so the first frame decodes everywhere.
    try { video.currentTime = Math.min(0.05, video.duration / 2); } catch (e) {}
  });
  video.addEventListener('loadeddata', draw);
  video.addEventListener('seeked', function () { if (!state.exporting) { draw(); updateTime(); } });
  video.addEventListener('error', function () {
    if (!video.src) return;
    state.loaded = false; setEnabled(false);
    setStatus('This browser can’t open that file. iPhone HEVC clips often won’t play in Chrome on Windows. Convert it to a standard MP4 (H.264) and try again.', true);
  });
  video.addEventListener('play', function () { setPlayIcon(true); cancelAnimationFrame(previewRaf); previewLoop(); });
  video.addEventListener('pause', function () { setPlayIcon(false); draw(); });
  video.addEventListener('ended', function () { setPlayIcon(false); });

  fileInput.addEventListener('change', function () { loadFile(fileInput.files[0]); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

  // ---------- transport ----------
  function setPlayIcon(playing) {
    playBtn.innerHTML = playing ?
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>' :
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>';
    playBtn.setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
  }
  playBtn.addEventListener('click', function () {
    if (state.exporting) return;
    if (video.paused) {
      var a = ensureAudio();
      if (a) { a.speakers.gain.value = 1; if (a.ctx.state === 'suspended') a.ctx.resume(); }
      if (video.ended || video.currentTime >= video.duration - 0.05) video.currentTime = 0;
      video.play().catch(function (err) { setStatus('Couldn’t play: ' + err.message, true); });
    } else video.pause();
  });
  var scrubbing = false;
  scrub.addEventListener('input', function () { scrubbing = true; video.currentTime = parseFloat(scrub.value); timeEl.textContent = fmt(parseFloat(scrub.value)) + ' / ' + fmt(video.duration); });
  scrub.addEventListener('change', function () { scrubbing = false; });
  setStart.addEventListener('click', function () { startIn.value = video.currentTime.toFixed(1); validateTrim(); });
  setEnd.addEventListener('click', function () { endIn.value = video.currentTime.toFixed(1); validateTrim(); });
  function validateTrim() {
    var r = trimRange();
    if (r[1] - r[0] < 0.2) { setStatus('The end needs to be after the start.', true); exportBtn.disabled = true; return false; }
    exportBtn.disabled = !supported || state.exporting;
    setStatus('Exporting ' + fmt(r[0]) + ' to ' + fmt(r[1]) + ' (' + (r[1] - r[0]).toFixed(1) + ' seconds).');
    return true;
  }
  startIn.addEventListener('change', validateTrim);
  endIn.addEventListener('change', validateTrim);

  // ---------- options ----------
  function syncMode() {
    var fill = state.mode === 'fill';
    focusRow.hidden = !fill;
    focusHint.textContent = fill ? 'Drag the preview, or use the sliders, to choose which part of the frame stays in shot.' :
      'The whole frame stays in, centred, over a blurred copy of itself.';
    canvas.classList.toggle('is-draggable', fill);
  }
  document.querySelectorAll('input[name="vrRatio"]').forEach(function (r) {
    r.addEventListener('change', function () { if (state.exporting) return; state.ratio = r.value; draw(); });
  });
  document.querySelectorAll('input[name="vrMode"]').forEach(function (r) {
    r.addEventListener('change', function () { if (state.exporting) return; state.mode = r.value; syncMode(); draw(); });
  });
  fx.addEventListener('input', function () { state.fx = fx.value / 100; draw(); });
  fy.addEventListener('input', function () { state.fy = fy.value / 100; draw(); });
  syncMode();

  // Drag the preview to move the crop.
  var drag = null;
  canvas.addEventListener('pointerdown', function (e) {
    if (state.mode !== 'fill' || !state.loaded || state.exporting) return;
    drag = { x: e.clientX, y: e.clientY, fx: state.fx, fy: state.fy };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var rect = canvas.getBoundingClientRect(), size = outSize(), W = size[0], H = size[1];
    var k = W / rect.width; // css px -> output px
    var vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh);
    var overX = vw * s - W, overY = vh * s - H;
    if (overX > 1) state.fx = Math.min(1, Math.max(0, drag.fx - (e.clientX - drag.x) * k / overX));
    if (overY > 1) state.fy = Math.min(1, Math.max(0, drag.fy - (e.clientY - drag.y) * k / overY));
    fx.value = Math.round(state.fx * 100); fy.value = Math.round(state.fy * 100);
    draw();
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { drag = null; canvas.classList.remove('is-dragging'); });
  });

  // ---------- export ----------
  function seek(t) {
    return new Promise(function (resolve) {
      var done = function () { video.removeEventListener('seeked', done); resolve(); };
      video.addEventListener('seeked', done);
      video.currentTime = t;
    });
  }
  function lockUi(on) {
    state.exporting = on;
    document.querySelectorAll('input[name="vrRatio"],input[name="vrMode"]').forEach(function (r) { r.disabled = on; });
    [fileInput, fx, fy, playBtn, scrub, startIn, endIn, setStart, setEnd].forEach(function (el) { el.disabled = on; });
    exportBtn.disabled = on;
    exportBtn.querySelector('span').textContent = on ? 'Exporting…' : 'Export video';
  }

  async function exportVideo() {
    if (!state.loaded || state.exporting) return;
    if (!supported) { setStatus('This browser can’t record video. Try the latest Chrome, Edge, Safari or Firefox.', true); return; }
    if (!validateTrim()) return;
    var r = trimRange(), t0 = r[0], t1 = r[1], len = t1 - t0;
    var recorder, chunks = [], raf = 0, stream;
    lockUi(true);
    result.hidden = true;
    progWrap.hidden = false; prog.style.width = '0%';
    setStatus('Getting ready…');
    try {
      video.pause();
      var a = ensureAudio();
      if (a) { a.speakers.gain.value = 0; if (a.ctx.state === 'suspended') await a.ctx.resume(); }
      await seek(t0);
      draw();
      stream = canvas.captureStream(30);
      var tracks = stream.getVideoTracks();
      if (a) tracks = tracks.concat(a.dest.stream.getAudioTracks());
      var combined = new MediaStream(tracks);
      recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 8000000, audioBitsPerSecond: 160000 });
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      var stopped = new Promise(function (resolve, reject) {
        recorder.onstop = resolve;
        recorder.onerror = function (e) { reject(e.error || new Error('The recorder stopped unexpectedly.')); };
      });

      recorder.start(1000);
      await video.play();
      setStatus('Recording. Keep this tab open and in view.');

      await new Promise(function (resolve) {
        var finish = function () { video.removeEventListener('ended', finish); cancelAnimationFrame(raf); resolve(); };
        video.addEventListener('ended', finish);
        (function tick() {
          draw();
          var p = Math.min(1, Math.max(0, (video.currentTime - t0) / len));
          prog.style.width = (p * 100).toFixed(1) + '%';
          timeEl.textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
          if (video.currentTime >= t1) { finish(); return; }
          raf = requestAnimationFrame(tick);
        })();
      });

      video.pause();
      draw();
      // let the last frame land in the stream before stopping
      await new Promise(function (res) { setTimeout(res, 120); });
      recorder.stop();
      await stopped;
      stream.getTracks().forEach(function (t) { t.stop(); });
      if (a) a.speakers.gain.value = 1;

      var type = (recorder.mimeType || mime).split(';')[0];
      var blob = new Blob(chunks, { type: type });
      if (!blob.size) throw new Error('The recording came out empty.');
      if (state.outUrl) URL.revokeObjectURL(state.outUrl);
      state.outUrl = URL.createObjectURL(blob);
      var ext = type.indexOf('mp4') > -1 ? 'mp4' : 'webm';
      var fname = state.name + '-' + state.ratio.replace(':', 'x') + '.' + ext;
      dl.href = state.outUrl;
      dl.download = fname;
      dl.dataset.size = blob.size;
      resultText.textContent = fname + ', ' + (blob.size / 1048576).toFixed(1) + ' MB, ' + ext.toUpperCase() + '.';
      result.hidden = false;
      prog.style.width = '100%';
      setStatus('Finished. Your file’s ready.');
    } catch (err) {
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch (e) {}
      try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      video.pause();
      setStatus('Export didn’t work: ' + (err && err.message ? err.message : 'unknown error') + '. Try a shorter clip, or another browser.', true);
      progWrap.hidden = true;
    } finally {
      lockUi(false);
      if (audio) audio.speakers.gain.value = 1;
    }
  }
  exportBtn.addEventListener('click', exportVideo);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state.exporting) setStatus('This tab is in the background, which can freeze the picture. Bring it back to the front.', true);
    else if (!document.hidden && state.exporting) setStatus('Recording. Keep this tab open and in view.');
  });
  window.addEventListener('beforeunload', function (e) { if (state.exporting) { e.preventDefault(); e.returnValue = ''; } });

  draw();
  if (!supported) setStatus('Heads up: this browser can’t record video, so you can preview but not export.', true);
})();
