/* Extract pages: pick pages and save them as a new PDF (or one PDF per page, zipped). */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), range = $('range'), cur = null;
  var grid = new T.PageGrid($('pages'), { mode: 'select', mark: 'tick', onChange: function () { syncRange(); sync(); } });
  var syncRange = T.linkRange(range, grid, function (errors) { sync(); if (errors.length) T.status(st, 'Not sure about “' + errors.join(', ') + '”. This PDF has ' + T.plural(grid.n, 'page') + '.', true); });

  function sync() {
    result.hidden = true;
    var list = grid.selected();
    go.disabled = !list.length;
    if (cur) T.status(st, list.length ? T.plural(list.length, 'page') + ' of ' + cur.n + ' selected.' : 'Click pages to select them, or type ranges above.');
  }
  function pick(fn) { if (!cur) return; var s = new Set(); for (var i = 1; i <= cur.n; i++) if (fn(i)) s.add(i); grid.setSelected(s); syncRange(); sync(); }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; grid.clear(); $('opts').hidden = true; go.disabled = true; result.hidden = true; range.value = ''; },
    onLoad: async function (d) { cur = d; $('opts').hidden = false; sync(); await grid.load(d.bytes, d.n); sync(); }
  });
  $('selAll').addEventListener('click', function () { pick(function () { return true; }); });
  $('selOdd').addEventListener('click', function () { pick(function (i) { return i % 2 === 1; }); });
  $('selEven').addEventListener('click', function () { pick(function (i) { return i % 2 === 0; }); });
  $('selNone').addEventListener('click', function () { pick(function () { return false; }); });
  $('separate').addEventListener('change', function () { result.hidden = true; });

  go.addEventListener('click', async function () {
    var list = grid.selected(); if (!cur || !list.length) return;
    var separate = $('separate').checked && list.length > 1;
    if (separate && !T.need(st, ['JSZip'])) return;
    go.disabled = true; T.status(st, 'Building…');
    try {
      var base = T.baseName(cur.file.name);
      if (separate) {
        var files = [];
        for (var i = 0; i < list.length; i++) {
          var one = await T.copyPages(cur.bytes, [list[i] - 1]);
          files.push({ name: base + '-page-' + T.pad(list[i], cur.n) + '.pdf', data: await one.save() });
        }
        var zip = await T.zip(files);
        T.offer(result, zip, base + '-pages.zip', 'Saved ' + T.plural(list.length, 'page') + ' as separate PDFs in one zip, ' + T.mb(zip.size) + '.');
      } else {
        var out = await T.copyPages(cur.bytes, list.map(function (n) { return n - 1; }));
        var bytes = await out.save();
        var label = T.toRanges(list).replace(/, /g, '_');
        if (label.length > 40) label = list.length + '-pages';
        T.offer(result, bytes, base + '-pages-' + label + '.pdf', 'Saved ' + T.plural(list.length, 'page') + ' as a new PDF, ' + T.mb(bytes.length) + '.');
      }
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'That didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
})();
