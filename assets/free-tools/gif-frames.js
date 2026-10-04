/* GIF frames: split a GIF into full PNG frames, download one or all as a ZIP. */
(function () {
  'use strict';
  var F = window.FTM, G = window.FTG, $ = F.$;
  var grid = $('ftFrames'), every = $('ftEvery');
  var pngs = [];

  function pad(n, len) { n = String(n); while (n.length < len) n = '0' + n; return n; }

  G.tool({
    onLoad: function () { grid.innerHTML = ''; grid.hidden = true; pngs = []; },
    run: async function (s, progress) {
      var gif = s.gif, step = parseInt(every.value, 10) || 1, base = F.baseName(s.file.name);
      var len = Math.max(3, String(gif.frames.length).length);
      grid.innerHTML = ''; pngs.forEach(function (p) { URL.revokeObjectURL(p.url); }); pngs = [];
      for (var i = 0; i < gif.frames.length; i += step) {
        var c = G.frameCanvas(gif, i);
        var blob = await F.canvasToBlob(c, 'image/png');
        var name = base + '-frame-' + pad(i + 1, len) + '.png';
        var url = URL.createObjectURL(blob);
        pngs.push({ name: name, blob: blob, url: url });
        if (pngs.length <= 300) {
          var a = document.createElement('a');
          a.className = 'fm-frame'; a.href = url; a.download = name;
          a.title = 'Download frame ' + (i + 1);
          a.innerHTML = '<img alt="Frame ' + (i + 1) + '"><span>' + (i + 1) + ' &middot; ' + gif.frames[i].delay + ' ms</span>';
          a.querySelector('img').src = url;
          grid.appendChild(a);
        }
        progress(0.7 * (i + 1) / gif.frames.length);
        if (i % 4 === 3) await F.tick();
      }
      grid.hidden = false;
      var z = await F.zip(pngs.map(function (p) { return { name: p.name, blob: p.blob }; }));
      progress(1);
      var name = base + '-frames.zip';
      return {
        blob: z, name: name,
        text: name + ': ' + pngs.length + ' PNG frames at ' + gif.width + ' x ' + gif.height + ', ' + F.bytes(z.size) + '.',
        note: 'Done. Click any frame below to save just that one.' + (pngs.length > 300 ? ' (Showing the first 300; the ZIP has them all.)' : '')
      };
    }
  });
})();
