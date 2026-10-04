/* Crop an image, free or to a fixed ratio. */
(function () {
  'use strict';
  var F = window.FTM, $ = F.$;
  var drop = $('ftDrop'), input = $('ftFile'), host = $('ftPreview'), meta = $('ftMeta');
  var go = $('ftGo'), statusEl = $('ftStatus'), result = $('ftResult'), resultText = $('ftResultText'), dl = $('ftDownload');
  var nums = { x: $('ftX'), y: $('ftY'), w: $('ftCW'), h: $('ftCH') };
  var cropper = null, file = null, img = null, busy = false;
  go.disabled = true;

  function ratioValue() {
    var v = document.querySelector('input[name="ftRatio"]:checked').value;
    if (v === 'free') return 0;
    var p = v.split(':'); return parseFloat(p[0]) / parseFloat(p[1]);
  }
  function fill(r) { nums.x.value = r.x; nums.y.value = r.y; nums.w.value = r.w; nums.h.value = r.h; result.hidden = true; }
  document.querySelectorAll('input[name="ftRatio"]').forEach(function (r) {
    r.addEventListener('change', function () { if (cropper) cropper.setRatio(ratioValue()); });
  });
  Object.keys(nums).forEach(function (k) {
    nums[k].addEventListener('change', function () {
      if (!cropper) return;
      var r = { x: +nums.x.value, y: +nums.y.value, w: +nums.w.value, h: +nums.h.value }, ratio = ratioValue();
      if (ratio) { if (k === 'h') r.w = r.h * ratio; else r.h = r.w / ratio; }
      cropper.set(r);
    });
  });

  F.bindDrop(drop, input, async function (files) {
    if (busy) return;
    F.status(statusEl, 'Opening ' + files[0].name + '…');
    try {
      img = await F.loadImage(files[0]);
      file = files[0];
      host.classList.add('has-crop');
      cropper = new F.Cropper(host, img, { onChange: fill });
      cropper.setRatio(ratioValue());
      if (!ratioValue()) cropper.set({ x: img.naturalWidth * 0.1, y: img.naturalHeight * 0.1, w: img.naturalWidth * 0.8, h: img.naturalHeight * 0.8 });
      meta.textContent = file.name + ': ' + img.naturalWidth + ' x ' + img.naturalHeight + ', ' + F.bytes(file.size);
      go.disabled = false; result.hidden = true;
      F.status(statusEl, 'Drag the box, or a corner, to choose your crop.');
    } catch (err) { F.status(statusEl, err.message, true); }
  });

  go.addEventListener('click', async function () {
    if (!cropper || busy) return;
    busy = true; go.disabled = true;
    try {
      var r = cropper.get();
      var native = /\.(jpe?g|png|webp)$/i.test(file.name) && !F.isHeic(file);
      var type = native ? F.typeFor(file) : 'image/jpeg';
      if (type === 'image/webp' && !F.webpOk) type = 'image/png';
      var c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
      var ctx = c.getContext('2d');
      if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.w, r.h); }
      ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      var blob = await F.canvasToBlob(c, type, 0.92);
      var name = F.baseName(file.name) + '-cropped.' + F.extFor(type);
      F.setDownload(dl, blob, name);
      resultText.textContent = name + ': ' + r.w + ' x ' + r.h + ', ' + F.bytes(blob.size) + '.';
      result.hidden = false;
      F.status(statusEl, 'Done. Your crop’s ready.');
    } catch (err) { F.status(statusEl, err.message, true); }
    busy = false; go.disabled = false;
  });
})();
