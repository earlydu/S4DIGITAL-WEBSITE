/* GIF helpers: decode (gifuct-js), encode (gifenc), lossless delay patching,
   and a standard controller for the one-GIF-in, one-GIF-out tools. */
(function () {
  'use strict';
  var F = window.FTM;

  // Browsers show delays under 20 ms as 100 ms, so we treat them the same way.
  function realDelay(ms) { return !ms || ms < 20 ? 100 : ms; }

  // ---------- decode to full composited RGBA frames ----------
  function decode(buffer) {
    return F.lib.gifuct().then(function (g) {
      var parsed;
      try { parsed = g.parseGIF(buffer); } catch (e) { throw new Error('That file doesn’t look like a valid GIF.'); }
      var raw = g.decompressFrames(parsed, true).filter(Boolean);
      if (!raw.length) throw new Error('That GIF has no frames we can read.');
      var W = parsed.lsd.width, H = parsed.lsd.height;
      if (W * H * raw.length > 400e6) throw new Error('That GIF is too big to edit in the browser (' + W + ' x ' + H + ', ' + raw.length + ' frames).');
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      var pc = document.createElement('canvas'), pctx = pc.getContext('2d');
      var frames = [];
      raw.forEach(function (f) {
        var d = f.dims, restore = null;
        if (f.disposalType === 3) restore = ctx.getImageData(0, 0, W, H);
        if (d.width > 0 && d.height > 0) {
          pc.width = d.width; pc.height = d.height;
          pctx.putImageData(new ImageData(f.patch, d.width, d.height), 0, 0);
          ctx.drawImage(pc, d.left, d.top);
        }
        frames.push({ data: ctx.getImageData(0, 0, W, H).data, delay: realDelay(f.delay) });
        if (f.disposalType === 2) ctx.clearRect(d.left, d.top, d.width, d.height);
        else if (f.disposalType === 3 && restore) ctx.putImageData(restore, 0, 0);
      });
      return { width: W, height: H, frames: frames, duration: frames.reduce(function (s, f) { return s + f.delay; }, 0) };
    });
  }

  function hasAlpha(frames) {
    for (var i = 0; i < frames.length; i++) {
      var d = frames[i].data;
      for (var p = 3; p < d.length; p += 4) if (d[p] < 128) return true;
    }
    return false;
  }

  // ---------- encode ----------
  // frames: [{ data: RGBA (width*height*4), delay: ms }]
  // opts: { width, height, colors (2..256), repeat (0 forever, -1 once, n), tolerance (0 lossless), onProgress(frac) }
  function encode(frames, opts) {
    return F.lib.gifenc().then(async function (G) {
      var W = opts.width, H = opts.height, n = W * H;
      var maxColors = Math.max(2, Math.min(256, opts.colors || 256));
      var tol = opts.tolerance || 0;
      var repeat = opts.repeat == null ? 0 : opts.repeat;
      var alpha = hasAlpha(frames);
      var enc = G.GIFEncoder();
      var prev = null;
      // Keep cumulative timing exact in GIF centiseconds.
      var t = 0, tcs = 0;
      for (var i = 0; i < frames.length; i++) {
        var d = frames[i].data;
        t += Math.max(20, frames[i].delay || 100);
        var endCs = Math.round(t / 10), delayMs = Math.max(2, endCs - tcs) * 10;
        tcs = endCs;
        var palette, index;
        if (alpha) {
          palette = G.quantize(d, maxColors, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true, clearAlphaThreshold: 127 });
          index = G.applyPalette(d, palette, 'rgba4444');
          var ti = -1;
          for (var k = 0; k < palette.length; k++) if (palette[k][3] === 0) { ti = k; break; }
          enc.writeFrame(index, W, H, { palette: palette, delay: delayMs, repeat: repeat, transparent: ti >= 0, transparentIndex: ti, dispose: 2 });
        } else if (i === 0 || opts.diff === false) {
          palette = G.quantize(d, maxColors, { format: 'rgb565' });
          index = G.applyPalette(d, palette, 'rgb565');
          enc.writeFrame(index, W, H, { palette: palette, delay: delayMs, repeat: repeat, dispose: 1 });
          prev = new Uint8Array(n * 3);
          for (var p = 0; p < n; p++) { var c = palette[index[p]]; prev[p * 3] = c[0]; prev[p * 3 + 1] = c[1]; prev[p * 3 + 2] = c[2]; }
        } else {
          // Pixels that look the same as what's already on screen become transparent,
          // which compresses far better. With tolerance 0 this is lossless.
          palette = G.quantize(d, maxColors - 1, { format: 'rgb565' });
          index = G.applyPalette(d, palette, 'rgb565');
          var tIdx = palette.length;
          palette.push([0, 0, 0]);
          for (var q = 0; q < n; q++) {
            var col = palette[index[q]], o = q * 3, same;
            if (tol) {
              var s = q * 4;
              same = Math.abs(d[s] - prev[o]) <= tol && Math.abs(d[s + 1] - prev[o + 1]) <= tol && Math.abs(d[s + 2] - prev[o + 2]) <= tol;
            } else {
              same = col[0] === prev[o] && col[1] === prev[o + 1] && col[2] === prev[o + 2];
            }
            if (same) index[q] = tIdx;
            else { prev[o] = col[0]; prev[o + 1] = col[1]; prev[o + 2] = col[2]; }
          }
          enc.writeFrame(index, W, H, { palette: palette, delay: delayMs, transparent: true, transparentIndex: tIdx, dispose: 1 });
        }
        if (opts.onProgress) opts.onProgress((i + 1) / frames.length);
        if (i % 2 === 1) await F.tick();
      }
      enc.finish();
      return new Blob([enc.bytes()], { type: 'image/gif' });
    });
  }

  // ---------- lossless delay patching (no re-encode) ----------
  // Returns { count, gce: [byte offset of delay or -1 per frame] }
  function walk(b) {
    if (b.length < 13 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) throw new Error('That file doesn’t look like a valid GIF.');
    var p = 13, packed = b[10];
    if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
    var gce = [], pending = -1, guard = 0;
    while (p < b.length && guard++ < 5e6) {
      var t = b[p];
      if (t === 0x21) {
        if (b[p + 1] === 0xF9) pending = p + 4;
        p += 2;
        while (p < b.length && b[p] !== 0) p += b[p] + 1;
        p++;
      } else if (t === 0x2C) {
        var pk = b[p + 9];
        p += 10;
        if (pk & 0x80) p += 3 * (1 << ((pk & 7) + 1));
        p++;
        while (p < b.length && b[p] !== 0) p += b[p] + 1;
        p++;
        gce.push(pending); pending = -1;
      } else if (t === 0x3B) break;
      else break; // trailing junk: stop, the frames we found are what browsers show
    }
    return { count: gce.length, gce: gce };
  }
  function readDelays(b) {
    var w = walk(b);
    return w.gce.map(function (o) { return o < 0 ? 100 : realDelay((b[o] | (b[o + 1] << 8)) * 10); });
  }
  // fn(oldMs, i) -> newMs. Returns a new Uint8Array, or null if a frame has no timing block.
  function patchDelays(b, fn) {
    var w = walk(b);
    if (!w.count || w.gce.some(function (o) { return o < 0; })) return null;
    var out = new Uint8Array(b);
    w.gce.forEach(function (o, i) {
      var old = realDelay((b[o] | (b[o + 1] << 8)) * 10);
      var cs = Math.max(2, Math.min(65535, Math.round(fn(old, i) / 10)));
      out[o] = cs & 255; out[o + 1] = cs >> 8;
    });
    return out;
  }

  // ---------- frame helpers ----------
  function frameCanvas(gif, i) {
    var c = document.createElement('canvas');
    c.width = gif.width; c.height = gif.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(gif.frames[i].data), gif.width, gif.height), 0, 0);
    return c;
  }
  // Map every frame through a canvas painter: paint(ctx, frameCanvas, i) on a W x H canvas.
  async function mapFrames(gif, W, H, paint, onProgress) {
    var src = document.createElement('canvas'); src.width = gif.width; src.height = gif.height;
    var sctx = src.getContext('2d', { willReadFrequently: true });
    var dst = document.createElement('canvas'); dst.width = W; dst.height = H;
    var dctx = dst.getContext('2d', { willReadFrequently: true });
    dctx.imageSmoothingEnabled = true; dctx.imageSmoothingQuality = 'high';
    var out = [];
    for (var i = 0; i < gif.frames.length; i++) {
      sctx.putImageData(new ImageData(new Uint8ClampedArray(gif.frames[i].data), gif.width, gif.height), 0, 0);
      dctx.clearRect(0, 0, W, H);
      paint(dctx, src, i);
      out.push({ data: dctx.getImageData(0, 0, W, H).data, delay: gif.frames[i].delay });
      if (onProgress) onProgress((i + 1) / gif.frames.length);
      if (i % 8 === 7) await F.tick();
    }
    return out;
  }
  function scaleFrames(gif, W, H, onProgress) {
    if (W === gif.width && H === gif.height) return Promise.resolve(gif.frames);
    return mapFrames(gif, W, H, function (ctx, src) {
      var s = F.drawScaled(src, gif.width, gif.height, W, H);
      ctx.drawImage(s, 0, 0);
    }, onProgress);
  }

  // Animated preview on a canvas, with an optional overlay painter.
  function Player(canvas, gif, overlay) {
    var self = this;
    this.canvas = canvas; this.gif = gif; this.overlay = overlay; this.i = 0; this.timer = 0;
    canvas.width = gif.width; canvas.height = gif.height;
    this.ctx = canvas.getContext('2d');
    this.frames = gif.frames.map(function (f) { return new ImageData(new Uint8ClampedArray(f.data), gif.width, gif.height); });
    (function step() {
      self.draw();
      self.timer = setTimeout(function () { self.i = (self.i + 1) % self.frames.length; step(); }, gif.frames[self.i].delay);
    })();
  }
  Player.prototype.draw = function () {
    this.ctx.putImageData(this.frames[this.i], 0, 0);
    if (this.overlay) this.overlay(this.ctx, this.gif.width, this.gif.height);
  };
  Player.prototype.stop = function () { clearTimeout(this.timer); };

  // ---------- standard one-GIF tool controller ----------
  // Page markup ids: ftDrop, ftFile, ftPreview, ftEmpty, ftMeta, ftGo, ftProgWrap, ftProg, ftStatus,
  // ftResult, ftResultText, ftDownload, ftOut (output preview img).
  // cfg: { needDecode (default true), onLoad(state), run(state, progress) -> Promise<{blob, name, note}> }
  function tool(cfg) {
    var $ = F.$;
    var drop = $('ftDrop'), input = $('ftFile'), preview = $('ftPreview'), empty = $('ftEmpty'), meta = $('ftMeta');
    var go = $('ftGo'), progWrap = $('ftProgWrap'), prog = $('ftProg'), statusEl = $('ftStatus');
    var result = $('ftResult'), resultText = $('ftResultText'), dl = $('ftDownload'), out = $('ftOut');
    var state = { file: null, bytes: null, gif: null, busy: false, outUrl: null };
    var goLabel = go.querySelector('span').textContent;
    go.disabled = true;

    function setBusy(on) {
      state.busy = on;
      go.disabled = on || !state.file;
      go.querySelector('span').textContent = on ? 'Working…' : goLabel;
    }
    function showPreview(blob) {
      var img = preview.querySelector('img.fm-src');
      if (!img) { img = document.createElement('img'); img.className = 'fm-src'; img.alt = 'Your GIF'; preview.appendChild(img); }
      if (state.srcUrl) URL.revokeObjectURL(state.srcUrl);
      state.srcUrl = URL.createObjectURL(blob);
      img.src = state.srcUrl;
      if (empty) empty.hidden = true;
    }

    async function load(file) {
      if (state.busy) return;
      if (!/gif$/i.test(file.type) && !/\.gif$/i.test(file.name)) { F.status(statusEl, 'That isn’t a GIF. Choose a .gif file.', true); return; }
      result.hidden = true;
      F.status(statusEl, 'Reading ' + file.name + '…');
      setBusy(true);
      try {
        state.file = file;
        state.bytes = new Uint8Array(await file.arrayBuffer());
        state.gif = null;
        if (cfg.needDecode !== false) state.gif = await decode(state.bytes.buffer.slice(0));
        var frames = state.gif ? state.gif.frames.length : walk(state.bytes).count;
        var dims = state.gif ? state.gif.width + ' x ' + state.gif.height + ', ' : '';
        var dur = state.gif ? ', ' + (state.gif.duration / 1000).toFixed(2) + 's' : '';
        meta.textContent = file.name + ': ' + dims + frames + ' frame' + (frames === 1 ? '' : 's') + dur + ', ' + F.bytes(file.size);
        if (cfg.showSource !== false) showPreview(file);
        if (cfg.onLoad) await cfg.onLoad(state);
        F.status(statusEl, 'Ready.');
      } catch (err) {
        state.file = null;
        F.status(statusEl, err.message || 'Couldn’t read that GIF.', true);
      }
      setBusy(false);
    }
    F.bindDrop(drop, input, function (files) { load(files[0]); });

    go.addEventListener('click', async function () {
      if (!state.file || state.busy) return;
      setBusy(true);
      result.hidden = true;
      F.progress(progWrap, prog, 0);
      F.status(statusEl, 'Working on it…');
      try {
        var r = await cfg.run(state, function (f) { F.progress(progWrap, prog, f); });
        F.setDownload(dl, r.blob, r.name);
        if (out) {
          if (state.outUrl) URL.revokeObjectURL(state.outUrl);
          state.outUrl = URL.createObjectURL(r.blob);
          out.src = state.outUrl; out.hidden = false;
        }
        resultText.textContent = r.text || (r.name + ', ' + F.bytes(r.blob.size) + '.');
        result.hidden = false;
        F.progress(progWrap, prog, 1);
        F.status(statusEl, r.note || 'Done. Your GIF’s ready.');
      } catch (err) {
        F.progress(progWrap, prog, null);
        F.status(statusEl, (err && err.message) || 'Something went wrong.', true);
      }
      setBusy(false);
    });
    return state;
  }

  window.FTG = { decode: decode, encode: encode, walk: walk, readDelays: readDelays, patchDelays: patchDelays, frameCanvas: frameCanvas, mapFrames: mapFrames, scaleFrames: scaleFrames, Player: Player, tool: tool, realDelay: realDelay };
})();
