/* Add text to a GIF: meme-style captions drawn onto every frame, with a live preview. */
(function () {
  'use strict';
  var F = window.FTM, G = window.FTG, $ = F.$;
  var topIn = $('ftTop'), botIn = $('ftBottom'), size = $('ftSize'), color = $('ftColor'), stroke = $('ftStroke');
  var outline = $('ftOutline'), font = $('ftFont'), upper = $('ftUpper'), margin = $('ftMargin');
  var canvas = $('ftLive'), player = null;

  function lines(ctx, text, maxW) {
    var words = text.split(/\s+/).filter(Boolean), out = [], line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    });
    if (line) out.push(line);
    return out;
  }
  function paint(ctx, W, H) {
    var px = Math.max(8, Math.round(H * (parseFloat(size.value) || 12) / 100));
    var m = Math.round(H * (parseFloat(margin.value) || 4) / 100);
    ctx.save();
    ctx.font = '900 ' + px + 'px ' + font.value;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.fillStyle = color.value;
    ctx.strokeStyle = stroke.value;
    ctx.lineWidth = Math.max(2, px / 7);
    var lh = Math.round(px * 1.08);
    function block(text, where) {
      text = (text || '').trim();
      if (!text) return;
      if (upper.checked) text = text.toUpperCase();
      var ls = lines(ctx, text, W * 0.92);
      var y = where === 'top' ? m + px * 0.85 : H - m - (ls.length - 1) * lh - px * 0.18;
      ls.forEach(function (l, i) {
        if (outline.checked) ctx.strokeText(l, W / 2, y + i * lh);
        ctx.fillText(l, W / 2, y + i * lh);
      });
    }
    block(topIn.value, 'top');
    block(botIn.value, 'bottom');
    ctx.restore();
  }
  [topIn, botIn, size, color, stroke, outline, font, upper, margin].forEach(function (el) {
    el.addEventListener('input', function () { if (player) player.draw(); });
    el.addEventListener('change', function () { if (player) player.draw(); });
  });

  G.tool({
    showSource: false,
    onLoad: function (s) {
      if (player) player.stop();
      $('ftEmpty').hidden = true;
      canvas.hidden = false;
      player = new G.Player(canvas, s.gif, paint);
    },
    run: async function (s, progress) {
      if (!topIn.value.trim() && !botIn.value.trim()) throw new Error('Type some text first.');
      var gif = s.gif;
      var frames = await G.mapFrames(gif, gif.width, gif.height, function (ctx, src) { ctx.drawImage(src, 0, 0); paint(ctx, gif.width, gif.height); }, function (f) { progress(0.25 * f); });
      var blob = await G.encode(frames, { width: gif.width, height: gif.height, onProgress: function (f) { progress(0.25 + 0.75 * f); } });
      var name = F.baseName(s.file.name) + '-text.gif';
      return { blob: blob, name: name, text: name + ': ' + gif.width + ' x ' + gif.height + ', ' + frames.length + ' frames, ' + F.bytes(blob.size) + '.' };
    }
  });
})();
