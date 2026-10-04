/* YouTube thumbnail grabber: works out the video ID, then fetches the public
   thumbnail sizes straight from i.ytimg.com (which allows cross-origin reads). */
(function () {
  'use strict';
  var F = window.FTM, $ = F.$;
  var form = $('ytForm'), input = $('ytUrl'), grid = $('ytGrid'), statusEl = $('ftStatus');
  var SIZES = [
    { key: 'maxresdefault', label: 'Max resolution', dims: '1280 x 720' },
    { key: 'sddefault', label: 'Standard', dims: '640 x 480' },
    { key: 'hqdefault', label: 'High quality', dims: '480 x 360' },
    { key: 'mqdefault', label: 'Medium', dims: '320 x 180' }
  ];
  var urls = [];

  function videoId(raw) {
    var s = (raw || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    var host = u.hostname.replace(/^(www|m|music)\./, '');
    var m;
    if (host === 'youtu.be') m = /^\/([\w-]{11})/.exec(u.pathname);
    else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
      var v = u.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return v;
      m = /^\/(?:shorts|embed|live|v|e)\/([\w-]{11})/.exec(u.pathname);
    }
    return m ? m[1] : null;
  }

  function card(id, size) {
    var el = document.createElement('figure');
    el.className = 'fm-yt__card is-loading';
    el.innerHTML = '<div class="fm-yt__img"><span>Loading…</span></div><figcaption><strong></strong><span></span></figcaption><div class="fm-yt__act"></div>';
    el.querySelector('strong').textContent = size.label;
    el.querySelector('figcaption span').textContent = size.dims;
    grid.appendChild(el);
    var src = 'https://i.ytimg.com/vi/' + id + '/' + size.key + '.jpg';
    return fetch(src, { mode: 'cors' }).then(function (res) {
      if (!res.ok) throw new Error('missing');
      return res.blob();
    }).then(function (blob) {
      return F.blobToImage(blob).then(function (img) {
        // A 120 x 90 grey placeholder means YouTube has no real image at this size.
        if (img.naturalWidth <= 120) throw new Error('missing');
        var u = URL.createObjectURL(blob); urls.push(u);
        var box = el.querySelector('.fm-yt__img');
        box.innerHTML = '';
        var shown = document.createElement('img');
        shown.src = u; shown.alt = size.label + ' thumbnail for video ' + id; shown.loading = 'lazy';
        box.appendChild(shown);
        el.querySelector('figcaption span').textContent = img.naturalWidth + ' x ' + img.naturalHeight + ', ' + F.bytes(blob.size);
        var a = document.createElement('a');
        a.className = 'btn'; a.href = u; a.download = id + '-' + size.key + '.jpg';
        a.innerHTML = '<span>Download</span><span class="arrow">&darr;</span>';
        el.querySelector('.fm-yt__act').appendChild(a);
        el.classList.remove('is-loading');
        return true;
      });
    }).catch(function () {
      el.classList.remove('is-loading');
      el.classList.add('is-missing');
      el.querySelector('.fm-yt__img').innerHTML = '<span>Not available for this video</span>';
      return false;
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = videoId(input.value);
    grid.innerHTML = ''; urls.forEach(URL.revokeObjectURL); urls = [];
    if (!id) { grid.hidden = true; F.status(statusEl, 'That doesn’t look like a YouTube link. Paste the full address from the browser or the Share button.', true); return; }
    grid.hidden = false;
    F.status(statusEl, 'Fetching thumbnails for ' + id + '…');
    Promise.all(SIZES.map(function (s) { return card(id, s); })).then(function (ok) {
      var n = ok.filter(Boolean).length;
      if (!n) F.status(statusEl, 'No thumbnails found. The video may be private, deleted, or the link may be wrong.', true);
      else if (!ok[0]) F.status(statusEl, 'Found ' + n + ' sizes. This video has no max resolution thumbnail, which is normal for older or lower resolution uploads.');
      else F.status(statusEl, 'Found ' + n + ' sizes.');
    });
  });
  window.FTYT = { videoId: videoId };
})();
