/* Merge PDF: join several PDFs in a chosen order. */
(function () {
  'use strict';
  var T = window.S4T, $ = T.$;
  var items = [], thumbQueue = Promise.resolve();
  var list = $('list'), st = $('status'), go = $('go'), clear = $('clear'), result = $('result');

  function render() {
    items.forEach(function (m, i) {
      list.appendChild(m.el);
      m.el.querySelector('[data-up]').disabled = i === 0;
      m.el.querySelector('[data-down]').disabled = i === items.length - 1;
    });
    var ready = items.filter(function (m) { return m.pages; });
    var pages = ready.reduce(function (n, m) { return n + m.pages; }, 0);
    go.disabled = ready.length < 2;
    clear.hidden = !items.length;
    if (!items.length) T.status(st, '');
    else if (ready.length < 2) T.status(st, 'Add at least two PDFs to merge.');
    else T.status(st, T.plural(ready.length, 'file') + ', ' + T.plural(pages, 'page') + ' in total. Drag or use the arrows to change the order.');
  }

  async function add(files) {
    if (!T.need(st, ['PDFLib'])) return;
    result.hidden = true;
    var bad = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!T.isPdf(f)) { bad.push(f.name + ' isn’t a PDF'); continue; }
      var item = { key: ++T.keySeq, file: f, bytes: null, pages: 0 };
      var li = document.createElement('li');
      li.className = 'pt-item'; li.draggable = true; li.dataset.key = item.key;
      li.innerHTML = '<span class="pt-handle" aria-hidden="true">' + T.ICON.grip + '</span><span class="pt-mini"></span>' +
        '<span class="pt-meta"><strong>' + T.esc(f.name) + '</strong><span>Reading…</span></span><span class="pt-actions"></span>';
      var up = T.iconBtn('up', 'Move up'), down = T.iconBtn('down', 'Move down'), del = T.iconBtn('x', 'Remove');
      up.dataset.up = ''; down.dataset.down = '';
      li.querySelector('.pt-actions').append(up, down, del);
      (function (item) {
        up.addEventListener('click', function () { var k = items.indexOf(item); T.move(items, k, k - 1); result.hidden = true; render(); });
        down.addEventListener('click', function () { var k = items.indexOf(item); T.move(items, k, k + 1); result.hidden = true; render(); });
        del.addEventListener('click', function () { items.splice(items.indexOf(item), 1); item.el.remove(); result.hidden = true; render(); });
      })(item);
      item.el = li;
      items.push(item);
      render();
      try {
        item.bytes = await T.readBytes(f);
        var doc = await T.loadPdfLib(item.bytes);
        item.pages = doc.getPageCount();
        li.querySelector('.pt-meta span').textContent = T.plural(item.pages, 'page') + ', ' + T.mb(f.size);
        if (window.pdfjsLib) (function (bytes, li) {
          thumbQueue = thumbQueue.then(function () {
            return T.loadPdfJs(bytes).then(function (pd) { return T.renderThumb(pd, 1, 60).then(function (c) { li.querySelector('.pt-mini').appendChild(c); pd.destroy(); }); });
          }).catch(function () {});
        })(item.bytes, li);
      } catch (err) {
        items.splice(items.indexOf(item), 1); li.remove();
        bad.push(f.name + ' was skipped: ' + err.message);
      }
      render();
    }
    if (bad.length) T.status(st, bad.join('. ') + '.', true);
  }

  go.addEventListener('click', async function () {
    var ready = items.filter(function (m) { return m.pages; });
    if (ready.length < 2) return;
    go.disabled = true;
    try {
      var L = window.PDFLib, out = await L.PDFDocument.create();
      for (var i = 0; i < ready.length; i++) {
        T.status(st, 'Adding ' + ready[i].file.name + ' (' + (i + 1) + ' of ' + ready.length + ')…');
        var src = await L.PDFDocument.load(ready[i].bytes);
        var copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach(function (p) { out.addPage(p); });
      }
      var bytes = await out.save();
      T.offer(result, bytes, 'merged.pdf', 'Merged ' + T.plural(ready.length, 'file') + ' into one PDF: ' + T.plural(out.getPageCount(), 'page') + ', ' + T.mb(bytes.length) + '.');
      T.status(st, 'Done.');
    } catch (err) { T.status(st, 'Merging didn’t work: ' + (err.message || err) + '.', true); }
    go.disabled = false;
  });

  T.wireDrop($('file'), add);
  T.sortable(list, function () { return items; }, function () { result.hidden = true; render(); });
  clear.addEventListener('click', function () { items.forEach(function (m) { m.el.remove(); }); items = []; result.hidden = true; render(); });
})();
