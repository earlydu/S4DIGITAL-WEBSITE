/* Split PDF: by custom ranges, every page, or every N pages. Several files come back as a zip. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var st = $('status'), go = $('go'), result = $('result'), opts = $('opts');
  var grid = new T.PageGrid($('pages'), { mode: 'arrange', move: false, rotate: false, remove: false });
  var cur = null;

  function mode() { var r = document.querySelector('input[name="mode"]:checked'); return r ? r.value : 'ranges'; }
  function plan() {
    if (!cur) return { groups: [], errors: [] };
    var n = cur.n, m = mode();
    if (m === 'each') { var g = []; for (var i = 1; i <= n; i++) g.push([i]); return { groups: g, errors: [] }; }
    if (m === 'every') {
      var k = Math.max(1, parseInt($('everyN').value, 10) || 1), out = [];
      for (var s = 1; s <= n; s += k) { var grp = []; for (var j = s; j < s + k && j <= n; j++) grp.push(j); out.push(grp); }
      return { groups: out, errors: [] };
    }
    return T.parseGroups($('ranges').value, n);
  }
  function label(g) { return g.length === 1 ? '' + g[0] : g[0] + '-' + g[g.length - 1]; }
  function sync() {
    $('rangesRow').hidden = mode() !== 'ranges';
    $('everyRow').hidden = mode() !== 'every';
    result.hidden = true;
    if (!cur) return;
    var p = plan();
    go.disabled = !p.groups.length;
    if (p.errors.length) { T.status(st, 'Not sure about “' + p.errors.join(', ') + '”. This PDF has ' + T.plural(cur.n, 'page') + '.', true); return; }
    if (!p.groups.length) { T.status(st, 'Type the ranges you want, for example 1-3, 4-6, 7-.'); return; }
    var names = p.groups.slice(0, 6).map(function (g) { return 'pages ' + label(g); }).join('; ');
    T.status(st, 'This makes ' + T.plural(p.groups.length, 'file') + ': ' + names + (p.groups.length > 6 ? '; and so on.' : '.') + (p.groups.length > 1 ? ' They’ll come as one zip.' : ''));
  }

  T.onePdf({
    input: $('file'), nameEl: $('fileName'), statusEl: st,
    onReset: function () { cur = null; grid.clear(); opts.hidden = true; go.disabled = true; result.hidden = true; },
    onLoad: async function (d) {
      cur = d; opts.hidden = false;
      if (!$('ranges').value) $('ranges').value = d.n > 1 ? '1-' + Math.ceil(d.n / 2) + ', ' + (Math.ceil(d.n / 2) + 1) + '-' + d.n : '1';
      sync();
      await grid.load(d.bytes, d.n);
    }
  });
  document.querySelectorAll('input[name="mode"]').forEach(function (r) { r.addEventListener('change', sync); });
  $('ranges').addEventListener('input', sync);
  $('everyN').addEventListener('input', sync);

  go.addEventListener('click', async function () {
    var p = plan(); if (!cur || !p.groups.length || p.errors.length) return;
    if (p.groups.length > 1 && !T.need(st, ['JSZip'])) return;
    go.disabled = true;
    try {
      var base = T.baseName(cur.file.name), files = [];
      for (var i = 0; i < p.groups.length; i++) {
        T.status(st, 'Making file ' + (i + 1) + ' of ' + p.groups.length + '…');
        var out = await T.copyPages(cur.bytes, p.groups[i].map(function (n) { return n - 1; }));
        files.push({ name: base + '-pages-' + label(p.groups[i]) + '.pdf', data: await out.save() });
        if (i % 10 === 9) await T.tick();
      }
      if (files.length === 1) {
        T.offer(result, files[0].data, files[0].name, 'Saved ' + T.plural(p.groups[0].length, 'page') + ' as a new PDF, ' + T.mb(files[0].data.length) + '.');
      } else {
        T.status(st, 'Zipping ' + files.length + ' files…');
        var zip = await T.zip(files);
        T.offer(result, zip, base + '-split.zip', 'Split into ' + T.plural(files.length, 'PDF') + ', zipped together, ' + T.mb(zip.size) + '.');
      }
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'Splitting didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });
})();
