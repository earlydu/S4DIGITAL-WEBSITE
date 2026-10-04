/* Rotate PDF (rotate-pdf) and Organise PDF (organise-pdf) share this file. data-mode on the grid decides which controls show. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), cur = null;
  var organise = $('pages').dataset.mode === 'organise';
  var grid = new T.PageGrid($('pages'), {
    mode: 'arrange', move: organise, remove: organise, rotate: true,
    onChange: function () { result.hidden = true; sync(); }
  });

  function sync() {
    if (!cur) return;
    go.disabled = !grid.items.length;
    if (!grid.items.length) { T.status(st, 'You’ve removed every page. Press Reset to start again.', true); return; }
    T.status(st, T.plural(grid.items.length, 'page') + (grid.isChanged() ? '. Changes ready to save.' : '. Nothing changed yet.'));
  }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; grid.clear(); $('opts').hidden = true; go.disabled = true; result.hidden = true; },
    onLoad: async function (d) { cur = d; $('opts').hidden = false; await grid.load(d.bytes, d.n); sync(); }
  });
  $('rotAllL').addEventListener('click', function () { grid.rotateAll(270); });
  $('rotAllR').addEventListener('click', function () { grid.rotateAll(90); });
  $('reset').addEventListener('click', function () { grid.reset(); });
  if ($('reverse')) $('reverse').addEventListener('click', function () { grid.items.reverse(); grid.render(); grid.changed(); });

  go.addEventListener('click', async function () {
    if (!cur || !grid.items.length) return;
    go.disabled = true; T.status(st, 'Saving…');
    try {
      var out = await T.copyPages(cur.bytes, grid.items);
      var bytes = await out.save();
      var name = T.baseName(cur.file.name) + (organise ? '-organised.pdf' : '-rotated.pdf');
      T.offer(result, bytes, name, 'Saved ' + T.plural(grid.items.length, 'page') + ', ' + T.mb(bytes.length) + '.');
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'Saving didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
})();
