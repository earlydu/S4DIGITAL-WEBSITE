/* GIF crop: pick a box on the first frame, cut every frame to it. */
(function () {
  'use strict';
  var F = window.FTM, G = window.FTG, $ = F.$;
  var host = $('ftPreview'), empty = $('ftEmpty');
  var nums = { x: $('ftX'), y: $('ftY'), w: $('ftCW'), h: $('ftCH') };
  var cropper = null, gif = null;

  function ratioValue() {
    var v = document.querySelector('input[name="ftRatio"]:checked').value;
    if (v === 'free') return 0;
    var p = v.split(':'); return parseFloat(p[0]) / parseFloat(p[1]);
  }
  function fill(r) { nums.x.value = r.x; nums.y.value = r.y; nums.w.value = r.w; nums.h.value = r.h; }
  document.querySelectorAll('input[name="ftRatio"]').forEach(function (r) {
    r.addEventListener('change', function () { if (cropper) cropper.setRatio(ratioValue()); });
  });
  Object.keys(nums).forEach(function (k) {
    nums[k].addEventListener('change', function () {
      if (!cropper) return;
      var r = { x: +nums.x.value, y: +nums.y.value, w: +nums.w.value, h: +nums.h.value };
      var ratio = ratioValue();
      if (ratio) { if (k === 'h') r.w = r.h * ratio; else r.h = r.w / ratio; }
      cropper.set(r);
    });
  });

  G.tool({
    showSource: false,
    onLoad: function (s) {
      gif = s.gif;
      if (empty) empty.hidden = true;
      host.classList.add('has-crop');
      cropper = new F.Cropper(host, G.frameCanvas(gif, 0), { onChange: fill });
      cropper.setRatio(ratioValue());
      if (!ratioValue()) cropper.set({ x: gif.width * 0.1, y: gif.height * 0.1, w: gif.width * 0.8, h: gif.height * 0.8 });
      fill(cropper.get());
    },
    run: async function (s, progress) {
      var r = cropper.get();
      var frames = await G.mapFrames(gif, r.w, r.h, function (ctx, src) { ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); }, function (f) { progress(0.25 * f); });
      var blob = await G.encode(frames, { width: r.w, height: r.h, onProgress: function (f) { progress(0.25 + 0.75 * f); } });
      var name = F.baseName(s.file.name) + '-cropped.gif';
      return { blob: blob, name: name, text: name + ': ' + r.w + ' x ' + r.h + ', ' + frames.length + ' frames, ' + F.bytes(blob.size) + '.' };
    }
  });
})();
