/* Delete pages: mark the pages to remove, save the rest. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), range = $('range'), cur = null;
  var grid = new T.PageGrid($('pages'), { mode: 'select', mark: 'cross', onChange: function () { syncRange(); sync(); } });
  var syncRange = T.linkRange(range, grid, function (errors) { sync(); if (errors.length) T.status(st, 'Not sure about “' + errors.join(', ') + '”. This PDF has ' + T.plural(grid.n, 'page') + '.', true); });

  function sync() {
    result.hidden = true;
    var del = grid.selected();
    go.disabled = !del.length || (cur && del.length >= cur.n);
    if (!cur) return;
    if (!del.length) T.status(st, 'Click the pages you want to remove, or type them above.');
    else if (del.length >= cur.n) T.status(st, 'That’s every page. Leave at least one.', true);
    else T.status(st, 'Removing ' + T.plural(del.length, 'page') + ', keeping ' + (cur.n - del.length) + '.');
  }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; grid.clear(); $('opts').hidden = true; go.disabled = true; result.hidden = true; range.value = ''; },
    onLoad: async function (d) { cur = d; $('opts').hidden = false; sync(); await grid.load(d.bytes, d.n); sync(); }
  });

  go.addEventListener('click', async function () {
    if (!cur) return;
    var del = new Set(grid.selected()), keep = [];
    for (var i = 1; i <= cur.n; i++) if (!del.has(i)) keep.push(i - 1);
    if (!keep.length || !del.size) return;
    go.disabled = true; T.status(st, 'Saving…');
    try {
      var out = await T.copyPages(cur.bytes, keep);
      var bytes = await out.save();
      T.offer(result, bytes, T.baseName(cur.file.name) + '-edited.pdf', 'Removed ' + T.plural(del.size, 'page') + '. The new PDF has ' + T.plural(keep.length, 'page') + ', ' + T.mb(bytes.length) + '.');
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
})();
