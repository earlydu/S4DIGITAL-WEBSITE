/* Batch image controller shared by compress, resize and convert.
   Markup ids: ftDrop, ftFile, ftList, ftEmpty, ftGo, ftZip, ftClear, ftProgWrap, ftProg, ftStatus. */
(function () {
  'use strict';
  var F = window.FTM;

  function batch(cfg) {
    var $ = F.$;
    var drop = $('ftDrop'), input = $('ftFile'), list = $('ftList'), empty = $('ftEmpty');
    var go = $('ftGo'), zipBtn = $('ftZip'), clearBtn = $('ftClear'), progWrap = $('ftProgWrap'), prog = $('ftProg'), statusEl = $('ftStatus');
    var items = [], busy = false, seq = 0;
    var goLabel = go.querySelector('span').textContent;
    var accept = cfg.accept || /^image\/(jpeg|png|webp|gif|bmp|avif|hei[cf])$/i;

    function sync() {
      var done = items.filter(function (it) { return it.out; });
      go.disabled = busy || !items.length;
      go.querySelector('span').textContent = busy ? 'Working…' : goLabel;
      zipBtn.disabled = busy || done.length < 1;
      if (clearBtn) clearBtn.disabled = busy || !items.length;
      empty.hidden = items.length > 0;
      list.hidden = !items.length;
    }

    function row(it) {
      var li = document.createElement('li');
      li.className = 'fm-item';
      li.innerHTML = '<div class="fm-item__thumb"></div><div class="fm-item__meta"><strong></strong><span class="fm-item__info"></span></div><div class="fm-item__act"></div>';
      li.querySelector('strong').textContent = it.file.name;
      it.el = li; it.info = li.querySelector('.fm-item__info'); it.act = li.querySelector('.fm-item__act');
      var rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'ft-btn ft-btn--icon'; rm.setAttribute('aria-label', 'Remove ' + it.file.name);
      rm.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      rm.addEventListener('click', function () {
        if (busy) return;
        items = items.filter(function (x) { return x !== it; });
        if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
        li.remove(); sync();
      });
      it.rm = rm;
      it.act.appendChild(rm);
      it.info.textContent = F.bytes(it.file.size);
      list.appendChild(li);
    }
    function thumb(it, img) {
      var box = it.el.querySelector('.fm-item__thumb');
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, s = 96 / Math.max(w, h);
      var c = F.drawScaled(img, w, h, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
      box.innerHTML = ''; box.appendChild(c);
    }

    function add(files) {
      if (busy) return;
      var bad = 0;
      files.forEach(function (file) {
        var ok = accept.test(file.type || '') || F.isHeic(file) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name);
        if (!ok) { bad++; return; }
        var it = { id: ++seq, file: file, out: null };
        items.push(it); row(it);
      });
      sync();
      F.status(statusEl, bad ? bad + ' file' + (bad > 1 ? 's weren’t images' : ' wasn’t an image') + ', so we skipped ' + (bad > 1 ? 'them' : 'it') + '.' : items.length + ' image' + (items.length > 1 ? 's' : '') + ' ready.', !!bad);
      if (cfg.onAdd) cfg.onAdd(items);
    }
    F.bindDrop(drop, input, add);

    go.addEventListener('click', async function () {
      if (busy || !items.length) return;
      busy = true; sync();
      var fails = 0, totalIn = 0, totalOut = 0;
      F.progress(progWrap, prog, 0);
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        F.status(statusEl, 'Working on ' + (i + 1) + ' of ' + items.length + '…');
        try {
          if (!it.img) { it.img = await F.loadImage(it.file); thumb(it, it.img); }
          var r = await cfg.process(it.file, it.img);
          it.out = r;
          totalIn += it.file.size; totalOut += r.blob.size;
          var a = it.el.querySelector('a.ft-btn');
          if (!a) {
            a = document.createElement('a'); a.className = 'ft-btn'; a.innerHTML = 'Download';
            it.act.insertBefore(a, it.rm);
          }
          F.setDownload(a, r.blob, r.name);
          it.info.textContent = r.info || (F.bytes(it.file.size) + ' to ' + F.bytes(r.blob.size));
          it.el.classList.remove('is-error');
        } catch (err) {
          fails++;
          it.out = null;
          it.info.textContent = (err && err.message) || 'Couldn’t process this one.';
          it.el.classList.add('is-error');
        }
        F.progress(progWrap, prog, (i + 1) / items.length);
        await F.tick();
      }
      busy = false; sync();
      var done = items.length - fails;
      var msg = done + ' of ' + items.length + ' done.';
      if (cfg.summary && done) msg += ' ' + cfg.summary(totalIn, totalOut);
      F.status(statusEl, msg, fails > 0);
    });

    zipBtn.addEventListener('click', async function () {
      var files = items.filter(function (it) { return it.out; }).map(function (it) { return { name: it.out.name, blob: it.out.blob }; });
      if (!files.length) return;
      if (files.length === 1) { F.download(files[0].blob, files[0].name); return; }
      zipBtn.disabled = true;
      F.status(statusEl, 'Zipping ' + files.length + ' files…');
      try {
        var z = await F.zip(files);
        F.download(z, (cfg.zipName || 'images') + '.zip');
        F.status(statusEl, 'ZIP saved: ' + files.length + ' files, ' + F.bytes(z.size) + '.');
      } catch (err) { F.status(statusEl, err.message, true); }
      zipBtn.disabled = false;
    });
    if (clearBtn) clearBtn.addEventListener('click', function () {
      if (busy) return;
      items = []; list.innerHTML = ''; sync(); F.status(statusEl, '');
    });

    // Re-mark outputs as stale when settings change.
    if (cfg.settings) cfg.settings.forEach(function (el) {
      el.addEventListener('change', function () { if (items.some(function (it) { return it.out; })) F.status(statusEl, 'Settings changed. Press the button again to apply them.'); });
    });
    sync();
    return { items: function () { return items; } };
  }

  F.batch = batch;
})();
