/* GIF reverse: play it backwards, or forwards then backwards (boomerang). */
(function () {
  'use strict';
  var F = window.FTM, G = window.FTG;
  function mode() { return document.querySelector('input[name="ftRevMode"]:checked').value; }
  G.tool({
    run: async function (s, progress) {
      var fr = s.gif.frames, out;
      var back = fr.slice().reverse();
      if (mode() === 'boomerang') out = fr.concat(back.slice(1, back.length - 1));
      else out = back;
      var blob = await G.encode(out, { width: s.gif.width, height: s.gif.height, onProgress: progress });
      var name = F.baseName(s.file.name) + (mode() === 'boomerang' ? '-boomerang' : '-reversed') + '.gif';
      return { blob: blob, name: name, text: name + ': ' + out.length + ' frames, ' + F.bytes(blob.size) + '.' };
    }
  });
})();
