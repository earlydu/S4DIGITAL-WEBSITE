/* Renders the blog index (#postList) and a single post (#postPage)
   from /api/content?file=posts. Drafts never reach the browser. */
(function () {
  'use strict';

  const list = document.getElementById('postList');
  const page = document.getElementById('postPage');
  if (!list && !page) return;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nice = d => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  fetch('/api/content?file=posts', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('posts ' + r.status))))
    .then(doc => (list ? renderList(doc.items || []) : renderPost(doc.items || [])))
    .catch(err => {
      console.error('[s4digital]', err);
      const target = list || page;
      target.innerHTML = '<div class="shell" style="padding:80px 0"><p class="wempty">Posts are taking a moment to load. Please refresh.</p></div>';
    });

  function renderList(items) {
    if (!items.length) {
      list.innerHTML = '<p class="wempty">Nothing published yet.</p>';
      return;
    }
    list.innerHTML = items.map(p =>
      '<a class="wcard" href="' + esc(p.legacyUrl || '/blog/' + p.slug) + '">' +
        (p.cover ? '<div class="wcard__media"><img src="' + esc(p.cover) + '" alt="' + esc(p.coverAlt) + '" loading="lazy" /></div>' : '') +
        '<div class="wcard__body">' +
          '<span class="wcard__sector">' + esc(p.category || 'Notes') + '</span>' +
          '<h2 class="wcard__title">' + esc(p.title) + '</h2>' +
          '<p class="wcard__desc">' + esc(p.excerpt) + '</p>' +
          '<span class="wcard__more">Read it<span class="arrow">&rarr;</span></span>' +
        '</div>' +
      '</a>'
    ).join('');
  }

  function renderPost(items) {
    const slug = decodeURIComponent(location.pathname.replace(/\/$/, '').split('/').pop());
    const p = items.find(x => x.slug === slug);

    if (!p) {
      page.innerHTML =
        '<section class="phero"><div class="shell">' +
          '<h1>We could not find that post</h1>' +
          '<p class="phero__sub">It may have been unpublished or renamed.</p>' +
          '<div class="phero__ctas"><a class="btn btn--orange" href="/blog"><span>All posts</span><span class="arrow">&rarr;</span></a></div>' +
        '</div></section>';
      return;
    }

    document.title = p.title + ' | s4digital';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', p.excerpt || '');

    page.innerHTML =
      '<section class="phero"><div class="shell article">' +
        '<div class="crumb"><a href="/blog">Notes</a><span>&rsaquo;</span><span>' + esc(p.category || '') + '</span></div>' +
        '<h1 style="max-width:24ch">' + esc(p.title) + '</h1>' +
        '<div class="article__meta"><span>' + esc(nice(p.date)) + '</span><span>&middot;</span>' +
          '<span>' + esc(p.readingTime || 5) + ' min read</span><span>&middot;</span><span>' + esc(p.author || 'Earl Duncan') + '</span></div>' +
      '</div></section>' +
      '<section class="sec" style="padding-top:0"><div class="shell article">' +
        (p.cover ? '<figure class="article__cover"><img src="' + esc(p.cover) + '" alt="' + esc(p.coverAlt) + '" /></figure>' : '') +
        '<div class="article__body">' + (p.body || '') + '</div>' +
      '</div></section>' +
      '<section class="cta"><span class="ast cta__giant" aria-hidden="true"></span><div class="cta__inner">' +
        '<div><h2 style="margin-top:0">Need content like this?</h2>' +
        '<p class="cta__sub">We plan, shoot and edit photography and video for businesses, organisations and personal brands.</p>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px">' +
          '<a class="btn btn--lg" href="/services" style="background:#fff;color:#0d0d0f"><span>Explore our services</span><span class="arrow" style="background:#0d0d0f;color:#fff">&rarr;</span></a>' +
          '<a class="btn btn--lg btn--ghost" href="/work" style="border-color:#fff;color:#fff"><span>See our work</span><span class="arrow" style="background:#fff;color:#0d0d0f">&rarr;</span></a>' +
        '</div></div>' +
      '</div></section>';
  }
})();
