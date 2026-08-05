/* s4digital admin.
   Talks to /api/admin. No build step, no framework, no dependencies. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const api = async (action, body) => {
    const res = await fetch('/api/admin?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  };

  let toastTimer = 0;
  const toast = (msg, bad) => {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('is-bad', !!bad);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 2600);
  };

  const state = { posts: [], work: [], categories: [], workCategories: [], media: [], editing: null, editingWork: null };

  /* ------------------------------------------------------------- sign in */

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('gateErr').textContent = '';
    try {
      await api('login', { password: $('pw').value });
      $('pw').value = '';
      start();
    } catch (err) {
      $('gateErr').textContent = err.message;
    }
  });

  $('logout').addEventListener('click', async () => {
    await api('logout').catch(() => {});
    location.reload();
  });

  async function boot() {
    try {
      const me = await api('me');
      $('driverPill').textContent = me.driver;
      if (!me.canWrite) {
        const n = $('notice');
        n.hidden = false;
        n.textContent = 'Editing is switched off on this deployment because the filesystem is read only. ' +
          'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the environment to turn saving on.';
      }
      if (me.signedIn) start();
    } catch (err) {
      $('gateErr').textContent = err.message;
    }
  }

  async function start() {
    $('gate').hidden = true;
    $('app').hidden = false;
    await Promise.all([loadPosts(), loadWork(), loadMedia()]);
  }

  /* --------------------------------------------------------------- tabs */

  document.querySelectorAll('.bar__tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bar__tabs button').forEach(b => b.classList.toggle('is-active', b === btn));
      document.querySelectorAll('.tab').forEach(p => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
    });
  });

  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => { b.closest('.sheet').hidden = true; }));

  /* -------------------------------------------------------------- posts */

  async function loadPosts() {
    const doc = await api('get', { doc: 'posts' });
    state.posts = doc.items || [];
    state.categories = doc.categories || [];
    $('catList').innerHTML = state.categories.map(c => '<option value="' + esc(c) + '">').join('');
    renderPosts();
  }

  function renderPosts() {
    const rows = $('postRows');
    rows.innerHTML = '';
    if (!state.posts.length) { rows.appendChild(el('p', 'mempty', 'No posts yet. Start one.')); return; }

    state.posts.forEach(p => {
      const item = el('div', 'row-item');
      item.innerHTML =
        (p.cover ? '<img class="row-item__thumb" src="' + esc(p.cover) + '" alt="" />' : '<div class="row-item__thumb"></div>') +
        '<div class="row-item__main"><h3>' + esc(p.title || '(untitled)') + '</h3>' +
        '<div class="row-item__meta">' +
          '<span class="badge ' + (p.status === 'published' ? 'badge--live">Published' : 'badge--draft">Draft') + '</span>' +
          '<span>' + esc(p.date || '') + '</span><span>' + esc(p.category || '') + '</span>' +
          '<span>/blog/' + esc(p.slug) + '</span>' +
          (p.legacyUrl ? '<span>original page</span>' : '') +
        '</div></div>';

      const actions = el('div', 'row-item__actions');
      const view = el('a', 'ghost', 'View');
      view.href = p.legacyUrl || ('/blog/' + p.slug);
      view.target = '_blank';
      actions.appendChild(view);

      const toggle = el('button', 'ghost', p.status === 'published' ? 'Unpublish' : 'Publish');
      toggle.addEventListener('click', async () => {
        try {
          await api('set-status', { slug: p.slug, status: p.status === 'published' ? 'draft' : 'published' });
          await loadPosts();
          toast('Saved');
        } catch (err) { toast(err.message, true); }
      });
      actions.appendChild(toggle);

      const edit = el('button', 'ghost', 'Edit');
      edit.addEventListener('click', () => openPost(p));
      actions.appendChild(edit);

      const del = el('button', 'ghost danger', 'Delete');
      del.addEventListener('click', async () => {
        if (!confirm('Delete "' + (p.title || p.slug) + '"? This cannot be undone.')) return;
        try { await api('delete-post', { slug: p.slug }); await loadPosts(); toast('Deleted'); }
        catch (err) { toast(err.message, true); }
      });
      actions.appendChild(del);

      item.appendChild(actions);
      rows.appendChild(item);
    });
  }

  $('newPost').addEventListener('click', () => openPost(null));

  function openPost(p) {
    state.editing = p ? { ...p } : { status: 'draft', date: new Date().toISOString().slice(0, 10), author: 'Earl Duncan', category: 'Content' };
    const s = state.editing;
    $('postSheetTitle').textContent = p ? 'Edit post' : 'New post';
    $('pTitle').value = s.title || '';
    $('pSlug').value = s.slug || '';
    $('pDate').value = s.date || '';
    $('pCategory').value = s.category || '';
    $('pAuthor').value = s.author || 'Earl Duncan';
    $('pExcerpt').value = s.excerpt || '';
    $('pCover').value = s.cover || '';
    $('pCoverAlt').value = s.coverAlt || '';
    paintCover('pCoverBox', s.cover);
    $('pBody').innerHTML = s.body || '';
    if (p && p.legacyUrl && !s.body) {
      $('pBody').innerHTML = '<p><em>This post was written as its own page before the admin existed. ' +
        'Its content still lives at ' + esc(p.legacyUrl) + '. Paste the text here to bring it under the admin, ' +
        'or leave it and keep using the original page.</em></p>';
    }
    $('postSheet').hidden = false;
  }

  const collectPost = status => ({
    originalSlug: state.editing && state.editing.slug,
    slug: $('pSlug').value,
    title: $('pTitle').value,
    date: $('pDate').value,
    category: $('pCategory').value,
    author: $('pAuthor').value,
    excerpt: $('pExcerpt').value,
    cover: $('pCover').value,
    coverAlt: $('pCoverAlt').value,
    body: $('pBody').innerHTML,
    status,
  });

  const savePost = async status => {
    try {
      await api('save-post', { post: collectPost(status) });
      $('postSheet').hidden = true;
      await loadPosts();
      toast(status === 'published' ? 'Published' : 'Saved as draft');
    } catch (err) { toast(err.message, true); }
  };
  $('savePostDraft').addEventListener('click', () => savePost('draft'));
  $('savePostPublish').addEventListener('click', () => savePost('published'));

  $('pTitle').addEventListener('blur', () => {
    if (!$('pSlug').value) {
      $('pSlug').value = $('pTitle').value.toLowerCase().replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    }
  });
  $('pCoverClear').addEventListener('click', () => { $('pCover').value = ''; paintCover('pCoverBox', ''); });

  function paintCover(boxId, url) {
    const box = $(boxId);
    box.innerHTML = url ? '<img src="' + esc(url) + '" alt="" />' : '<span>No cover chosen</span>';
  }

  /* --------------------------------------------------------- rich text */

  const editor = $('pBody');
  let savedRange = null;
  const remember = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0);
  };
  editor.addEventListener('keyup', remember);
  editor.addEventListener('mouseup', remember);
  editor.addEventListener('blur', remember);

  const restore = () => {
    editor.focus();
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  };

  const insert = html => {
    restore();
    document.execCommand('insertHTML', false, html);
    remember();
  };

  $('toolbar').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.cmd) { restore(); document.execCommand(btn.dataset.cmd, false, null); remember(); return; }
    if (btn.dataset.block) { restore(); document.execCommand('formatBlock', false, btn.dataset.block); remember(); return; }

    if (btn.hasAttribute('data-link')) {
      const url = prompt('Link address', 'https://');
      if (!url) return;
      restore();
      document.execCommand('createLink', false, url);
      remember();
      return;
    }

    if (btn.hasAttribute('data-embed')) {
      const url = prompt('Paste a YouTube or Vimeo link');
      if (!url) return;
      const yt = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/);
      const vm = url.match(/vimeo\.com\/(\d+)/);
      if (yt) insert('<iframe src="https://www.youtube-nocookie.com/embed/' + yt[1] + '" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" loading="lazy"></iframe><p><br></p>');
      else if (vm) insert('<iframe src="https://player.vimeo.com/video/' + vm[1] + '" title="Video" allow="autoplay; fullscreen; picture-in-picture" loading="lazy"></iframe><p><br></p>');
      else toast('That does not look like a YouTube or Vimeo link.', true);
      return;
    }

    if (btn.dataset.pick) openPicker(btn.dataset.pick);
  });

  /* ------------------------------------------------------------- media */

  async function loadMedia() {
    try {
      const res = await api('media');
      state.media = res.items || [];
    } catch { state.media = []; }
    paintMedia($('mediaGrid'), false);
  }

  function paintMedia(grid, picking) {
    grid.innerHTML = '';
    if (!state.media.length) { grid.appendChild(el('p', 'mempty', 'Nothing uploaded yet.')); return; }
    state.media.forEach(m => {
      const card = el('div', 'mcard');
      card.innerHTML =
        (m.type === 'video'
          ? '<video src="' + esc(m.url) + '" muted playsinline preload="metadata"></video>'
          : '<img src="' + esc(m.url) + '" alt="" loading="lazy" />') +
        '<div class="mcard__name">' + esc(m.name) + '</div>';

      if (picking) {
        const hit = el('button', 'mcard__pick', '');
        hit.setAttribute('aria-label', 'Use ' + m.name);
        hit.addEventListener('click', () => choose(m));
        card.appendChild(hit);
      } else {
        const del = el('button', 'mcard__del', '&times;');
        del.title = 'Delete';
        del.addEventListener('click', async () => {
          if (!confirm('Delete ' + m.name + '?')) return;
          try { await api('delete-media', { name: m.name }); await loadMedia(); toast('Deleted'); }
          catch (err) { toast(err.message, true); }
        });
        card.appendChild(del);
      }
      grid.appendChild(card);
    });
  }

  async function upload(file) {
    const info = await api('upload-url', { filename: file.name, contentType: file.type });
    if (info.mode === 'signed') {
      const put = await fetch(info.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error('Upload failed (' + put.status + ')');
      return info.url;
    }
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const saved = await api('upload-inline', { name: info.name, base64 });
    return saved.url;
  }

  const handleFiles = async files => {
    for (const f of files) {
      try { await upload(f); toast('Uploaded ' + f.name); }
      catch (err) { toast(err.message, true); }
    }
    await loadMedia();
    if (!$('pickSheet').hidden) paintMedia($('pickGrid'), true);
  };

  $('mediaUpload').addEventListener('change', e => { handleFiles(Array.from(e.target.files)); e.target.value = ''; });
  $('pickUpload').addEventListener('change', e => { handleFiles(Array.from(e.target.files)); e.target.value = ''; });

  /* ------------------------------------------------------------- picker */

  let pickMode = null;
  function openPicker(mode) {
    pickMode = mode;
    paintMedia($('pickGrid'), true);
    $('pickSheet').hidden = false;
  }

  function choose(m) {
    $('pickSheet').hidden = true;
    if (pickMode === 'cover') { $('pCover').value = m.url; paintCover('pCoverBox', m.url); return; }
    if (pickMode === 'wcover') { $('wCover').value = m.url; paintCover('wCoverBox', m.url); return; }
    if (pickMode === 'wgallery') {
      state.editingWork.gallery = (state.editingWork.gallery || []).concat([{ src: m.url, alt: '' }]);
      paintGallery();
      return;
    }
    if (pickMode === 'image') { insert('<img src="' + esc(m.url) + '" alt="" loading="lazy" /><p><br></p>'); return; }
    if (pickMode === 'video') { insert('<video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video><p><br></p>'); return; }
  }

  /* -------------------------------------------------------- case studies */

  async function loadWork() {
    const doc = await api('get', { doc: 'work' });
    state.work = doc.items || [];
    state.workCategories = doc.categories || [];
    renderWork();
  }

  function renderWork() {
    const rows = $('workRows');
    rows.innerHTML = '';
    state.work.forEach((w, i) => {
      const item = el('div', 'row-item');
      item.innerHTML =
        '<img class="row-item__thumb" src="' + esc((w.cover && w.cover.src) || '') + '" alt="" />' +
        '<div class="row-item__main"><h3>' + esc(w.client) + '</h3>' +
        '<div class="row-item__meta">' +
          (w.featured ? '<span class="badge badge--live">On home page</span>' : '') +
          '<span>/work/' + esc(w.slug) + '</span><span>' + esc((w.categories || []).join(', ')) + '</span>' +
        '</div></div>';

      const actions = el('div', 'row-item__actions');
      const view = el('a', 'ghost', 'View');
      view.href = '/work/' + w.slug;
      view.target = '_blank';
      actions.appendChild(view);

      const up = el('button', 'ghost', '↑');
      up.title = 'Move up';
      up.addEventListener('click', () => reorder(i, -1));
      actions.appendChild(up);

      const down = el('button', 'ghost', '↓');
      down.title = 'Move down';
      down.addEventListener('click', () => reorder(i, 1));
      actions.appendChild(down);

      const edit = el('button', 'ghost', 'Edit');
      edit.addEventListener('click', () => openWork(w));
      actions.appendChild(edit);

      const del = el('button', 'ghost danger', 'Delete');
      del.addEventListener('click', async () => {
        if (!confirm('Delete the ' + w.client + ' case study?')) return;
        state.work = state.work.filter(x => x.slug !== w.slug);
        await persistWork('Deleted');
      });
      actions.appendChild(del);

      item.appendChild(actions);
      rows.appendChild(item);
    });
  }

  async function reorder(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.work.length) return;
    const copy = state.work.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    state.work = copy;
    await persistWork('Order saved');
  }

  async function persistWork(msg) {
    try { await api('save-work', { items: state.work }); await loadWork(); toast(msg || 'Saved'); }
    catch (err) { toast(err.message, true); }
  }

  $('newWork').addEventListener('click', () => openWork(null));

  function openWork(w) {
    state.editingWork = w
      ? JSON.parse(JSON.stringify(w))
      : { slug: '', client: '', title: '', industry: '', sector: '', categories: [], gallery: [], outputs: [], delivered: [], cta: { label: 'Book a Discovery Call', href: '/contact' }, cover: { src: '', alt: '' } };
    const s = state.editingWork;
    $('workSheetTitle').textContent = w ? 'Edit case study' : 'New case study';
    $('wClient').value = s.client || '';
    $('wSlug').value = s.slug || '';
    $('wTitle').value = s.title || '';
    $('wIndustry').value = s.industry || '';
    $('wSector').value = s.sector || '';
    $('wSummary').value = s.summary || '';
    $('wOverview').value = s.overview || '';
    $('wChallenge').value = s.challenge || '';
    $('wDelivered').value = (s.delivered || []).join('\n');
    $('wOutputs').value = (s.outputs || []).map(o => o.value + ' | ' + o.label).join('\n');
    $('wResults').value = (s.results || []).join('\n');
    $('wCover').value = (s.cover && s.cover.src) || '';
    $('wCoverAlt').value = (s.cover && s.cover.alt) || '';
    $('wGalleryNote').value = s.galleryNote || '';
    $('wCtaLabel').value = (s.cta && s.cta.label) || '';
    $('wCtaHref').value = (s.cta && s.cta.href) || '';
    $('wFeatured').checked = !!s.featured;
    paintCover('wCoverBox', $('wCover').value);
    paintCats();
    paintGallery();
    $('workSheet').hidden = false;
  }

  function paintCats() {
    const box = $('wCats');
    box.innerHTML = '';
    state.workCategories.forEach(c => {
      const b = el('button', (state.editingWork.categories || []).includes(c) ? 'is-on' : '', esc(c));
      b.type = 'button';
      b.addEventListener('click', () => {
        const list = state.editingWork.categories || [];
        state.editingWork.categories = list.includes(c) ? list.filter(x => x !== c) : list.concat([c]);
        paintCats();
      });
      box.appendChild(b);
    });
  }

  function paintGallery() {
    const box = $('wGallery');
    box.innerHTML = '';
    (state.editingWork.gallery || []).forEach((g, i) => {
      const fig = el('figure', '', '<img src="' + esc(g.src) + '" alt="" />');
      const x = el('button', '', '&times;');
      x.type = 'button';
      x.addEventListener('click', () => {
        state.editingWork.gallery.splice(i, 1);
        paintGallery();
      });
      fig.appendChild(x);
      box.appendChild(fig);
    });
  }

  $('saveWork').addEventListener('click', async () => {
    const s = state.editingWork;
    const slug = ($('wSlug').value || $('wClient').value).toLowerCase()
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) { toast('A case study needs a client name.', true); return; }

    const next = {
      ...s,
      slug,
      client: $('wClient').value,
      title: $('wTitle').value,
      industry: $('wIndustry').value,
      sector: $('wSector').value,
      summary: $('wSummary').value,
      overview: $('wOverview').value,
      challenge: $('wChallenge').value,
      delivered: $('wDelivered').value.split('\n').map(x => x.trim()).filter(Boolean),
      outputs: $('wOutputs').value.split('\n').map(x => x.trim()).filter(Boolean).map(line => {
        const bits = line.split('|');
        return { value: (bits[0] || '').trim(), label: (bits.slice(1).join('|') || '').trim() };
      }),
      results: $('wResults').value.split('\n').map(x => x.trim()).filter(Boolean),
      cover: { src: $('wCover').value, alt: $('wCoverAlt').value },
      galleryNote: $('wGalleryNote').value,
      cta: { label: $('wCtaLabel').value, href: $('wCtaHref').value },
      featured: $('wFeatured').checked,
    };
    if (!next.results.length) delete next.results;

    const at = state.work.findIndex(x => x.slug === (s.slug || slug));
    if (at > -1) state.work[at] = next; else state.work.push(next);

    $('workSheet').hidden = true;
    await persistWork('Saved');
  });

  boot();
})();
