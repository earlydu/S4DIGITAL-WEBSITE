/* Images to GIF: order a set of images, pick timing and size, encode with gifenc. */
(function () {
  'use strict';
  var F = window.FTM, $ = F.$;
  var drop = $('ftDrop'), input = $('ftFile'), list = $('ftList'), empty = $('ftEmpty');
  var delayIn = $('ftDelay'), loop = $('ftLoop'), widthIn = $('ftWidth'), bg = $('ftBg');
  var go = $('ftGo'), progWrap = $('ftProgWrap'), prog = $('ftProg'), statusEl = $('ftStatus');
  var result = $('ftResult'), resultText = $('ftResultText'), dl = $('ftDownload'), out = $('ftOut');
  var items = [], busy = false, outUrl = null, goLabel = go.querySelector('span').textContent;

  function fit() { var r = document.querySelector('input[name="ftFit"]:checked'); return r ? r.value : 'contain'; }
  function sync() {
    go.disabled = busy || items.length < 2;
    go.querySelector('span').textContent = busy ? 'Working…' : goLabel;
    empty.hidden = items.length > 0;
    list.hidden = !items.length;
  }
  function icon(path) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>'; }
  function render() {
    list.innerHTML = '';
    items.forEach(function (it, i) {
      var li = document.createElement('li');
      li.className = 'fm-item';
      li.innerHTML = '<div class="fm-item__thumb"></div><div class="fm-item__meta"><strong></strong><span class="fm-item__info"></span></div><div class="fm-item__act"></div>';
      li.querySelector('.fm-item__thumb').appendChild(it.thumb);
      li.querySelector('strong').textContent = (i + 1) + '. ' + it.file.name;
      li.querySelector('.fm-item__info').textContent = it.img.naturalWidth + ' x ' + it.img.naturalHeight;
      var act = li.querySelector('.fm-item__act');
      [['Move up', 'M12 19V5M5 12l7-7 7 7', -1], ['Move down', 'M12 5v14M5 12l7 7 7-7', 1], ['Remove', 'M6 6l12 12M18 6L6 18', 0]].forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'ft-btn ft-btn--icon'; btn.innerHTML = icon(b[1]);
        btn.setAttribute('aria-label', b[0] + ': ' + it.file.name);
        if ((b[2] === -1 && i === 0) || (b[2] === 1 && i === items.length - 1)) btn.disabled = true;
        btn.addEventListener('click', function () {
          if (busy) return;
          if (b[2] === 0) items.splice(i, 1);
          else { var j = i + b[2], t = items[i]; items[i] = items[j]; items[j] = t; }
          render(); sync();
        });
        act.appendChild(btn);
      });
      list.appendChild(li);
    });
  }

  async function add(files) {
    if (busy) return;
    files = files.filter(function (f) { return /^image\//.test(f.type) || F.isHeic(f) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name); });
    files.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
    F.status(statusEl, 'Reading ' + files.length + ' image' + (files.length === 1 ? '' : 's') + '…');
    for (var i = 0; i < files.length; i++) {
      try {
        var img = await F.loadImage(files[i]);
        var w = img.naturalWidth, h = img.naturalHeight, s = 96 / Math.max(w, h);
        items.push({ file: files[i], img: img, thumb: F.drawScaled(img, w, h, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))) });
      } catch (e) { /* skip unreadable */ }
    }
    if (items.length && !widthIn.dataset.touched) widthIn.value = Math.min(800, items[0].img.naturalWidth);
    render(); sync();
    F.status(statusEl, items.length < 2 ? 'Add at least two images.' : items.length + ' images. Reorder them, then make your GIF.');
  }
  F.bindDrop(drop, input, add);
  widthIn.addEventListener('input', function () { widthIn.dataset.touched = '1'; });

  go.addEventListener('click', async function () {
    if (busy || items.length < 2) return;
    busy = true; sync(); result.hidden = true;
    F.progress(progWrap, prog, 0);
    F.status(statusEl, 'Building your GIF…');
    try {
      var first = items[0].img;
      var W = Math.max(16, Math.min(1600, parseInt(widthIn.value, 10) || 600));
      var H = Math.max(2, Math.round(W * first.naturalHeight / first.naturalWidth));
      var delay = Math.max(20, Math.min(60000, parseInt(delayIn.value, 10) || 500));
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      var mode = fit(), frames = [];
      for (var i = 0; i < items.length; i++) {
        var img = items[i].img, iw = img.naturalWidth, ih = img.naturalHeight;
        ctx.fillStyle = bg.value || '#ffffff'; ctx.fillRect(0, 0, W, H);
        var s = mode === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
        var dw = Math.round(iw * s), dh = Math.round(ih * s);
        var scaled = F.drawScaled(img, iw, ih, Math.max(1, dw), Math.max(1, dh));
        ctx.drawImage(scaled, Math.round((W - dw) / 2), Math.round((H - dh) / 2));
        frames.push({ data: ctx.getImageData(0, 0, W, H).data, delay: delay });
        F.progress(progWrap, prog, 0.3 * (i + 1) / items.length);
        await F.tick();
      }
      var blob = await window.FTG.encode(frames, { width: W, height: H, repeat: parseInt(loop.value, 10), onProgress: function (f) { F.progress(progWrap, prog, 0.3 + 0.7 * f); } });
      if (outUrl) URL.revokeObjectURL(outUrl);
      outUrl = URL.createObjectURL(blob);
      out.src = outUrl; out.hidden = false;
      F.setDownload(dl, blob, 'animation.gif');
      resultText.textContent = 'animation.gif: ' + W + ' x ' + H + ', ' + frames.length + ' frames, ' + F.bytes(blob.size) + '.';
      result.hidden = false;
      F.status(statusEl, 'Done. Your GIF’s ready.');
    } catch (err) {
      F.progress(progWrap, prog, null);
      F.status(statusEl, err.message || 'Something went wrong.', true);
    }
    busy = false; sync();
  });
  sync();
})();
