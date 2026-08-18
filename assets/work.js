/* s4digital - renders case study content from /content/work.json.
   That file is the single source of truth and is what the admin at /admin edits.
   Three jobs, each one guarded by the element it needs:
     #featuredWork  the three featured cards on the home page
     #workGrid      the filterable index at /work
     #caseStudy     a single case study at /work/<slug>
*/
(function () {
  'use strict';

  const needs = document.getElementById('featuredWork') || document.getElementById('workGrid') || document.getElementById('caseStudy');
  if (!needs) return;

  fetch('/api/content?file=work', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('work ' + r.status))))
    .then(json => render(json.items || [], json.categories || []))
    .catch(err => {
      console.error('[s4digital] could not load case studies:', err);
      const target = document.getElementById('workGrid') || document.getElementById('caseStudy') || document.getElementById('featuredWork');
      if (target) target.innerHTML = '<p class="wempty">Our work is taking a moment to load. Please refresh the page.</p>';
    });

function render(DATA, CATEGORIES) {
  const url = p => (p && p.charAt(0) === '/' ? p : '/' + p);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // cover.loop is a short muted mp4 standing in for an animated thumbnail.
  // No autoplay attribute: playCoversInView starts them only once they are on screen.
  const cover = c =>
    c.loop
      ? '<video data-loop src="' + esc(url(c.loop)) + '" poster="' + esc(url(c.src)) + '" muted loop playsinline preload="none" aria-label="' + esc(c.alt) + '"></video>'
      : '<img src="' + esc(url(c.src)) + '" alt="' + esc(c.alt) + '" loading="lazy" />';

  // A dozen looping thumbnails decoding at once is wasteful on a phone.
  const playCoversInView = root => {
    const vids = (root || document).querySelectorAll('video[data-loop]');
    if (!vids.length) return;
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) e.target.play().catch(() => {});
        else e.target.pause();
      });
    }, { rootMargin: '200px 0px' });
    vids.forEach(v => io.observe(v));
  };

  const card = w =>
    '<a class="wcard" href="/work/' + esc(w.slug) + '">' +
      '<div class="wcard__media">' + cover(w.cover) + (w.comingSoon ? '<span class="wcard__soon">Coming soon</span>' : '') + '</div>' +
      '<div class="wcard__body">' +
        '<span class="wcard__sector">' + esc(w.sector) + '</span>' +
        '<h3 class="wcard__title">' + esc(w.client) + '</h3>' +
        '<p class="wcard__desc">' + esc(w.summary) + '</p>' +
        '<span class="wcard__more">Read the case study<span class="arrow">&rarr;</span></span>' +
      '</div>' +
    '</a>';

  /* ---------- Home page: featured cards ---------- */
  const featured = document.getElementById('featuredWork');
  if (featured) {
    featured.innerHTML = DATA.filter(w => w.featured).slice(0, 3).map(card).join('');
    playCoversInView(featured);
  }

  /* ---------- /work: filterable index ---------- */
  const grid = document.getElementById('workGrid');
  if (grid) {
    const filters = document.getElementById('workFilters');
    const used = CATEGORIES.filter(c => DATA.some(w => w.categories.indexOf(c) > -1));

    if (filters) {
      filters.innerHTML = ['All work'].concat(used)
        .map((c, i) => '<button type="button" data-cat="' + esc(c) + '"' + (i === 0 ? ' class="is-active"' : '') + '>' + esc(c) + '</button>')
        .join('');
    }

    const draw = cat => {
      const list = cat && cat !== 'All work' ? DATA.filter(w => w.categories.indexOf(cat) > -1) : DATA;
      grid.innerHTML = list.length
        ? list.map(card).join('')
        : '<p class="wempty">Nothing in this category yet.</p>';
      playCoversInView(grid);
    };
    draw();

    if (filters) {
      filters.addEventListener('click', e => {
        const btn = e.target.closest('button[data-cat]');
        if (!btn) return;
        filters.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b === btn));
        draw(btn.dataset.cat);
      });
    }
  }

  /* ---------- /work/<slug>: one case study ---------- */
  const page = document.getElementById('caseStudy');
  if (!page) return;

  const slug = decodeURIComponent(window.location.pathname.replace(/\/$/, '').split('/').pop());
  const w = DATA.find(x => x.slug === slug);

  if (!w) {
    page.innerHTML =
      '<div class="shell" style="padding:120px 0">' +
        '<h1 style="font-weight:900;font-size:clamp(30px,4vw,48px);letter-spacing:-.03em;margin-bottom:16px">We could not find that case study</h1>' +
        '<p style="color:var(--muted);font-size:16px;margin-bottom:26px">It may have been renamed or moved.</p>' +
        '<a class="btn btn--orange" href="/work"><span>See all our work</span><span class="arrow">&rarr;</span></a>' +
      '</div>';
    return;
  }

  document.title = w.client + ' | Case Study | s4digital';
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', w.summary);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', 'https://s4digi.com/work/' + w.slug);

  const list = (items, cls) => '<ul class="' + cls + '">' + items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>';

  // Sections only exist when there is something to put in them.
  const videos = w.videos || (w.video ? [w.video] : []);
  const gallery = w.gallery || [];

  // A carousel is read one slide after another, so it stays on a single line and
  // scrolls sideways. The arrows only appear when there is more than fits.
  const railBtn = (dir) =>
    '<button type="button" class="rail__btn rail__btn--' + dir + '" data-rail="' + dir + '" aria-label="' +
      (dir === 'prev' ? 'Previous slides' : 'Next slides') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
        (dir === 'prev' ? '<polyline points="15 18 9 12 15 6"/>' : '<polyline points="9 18 15 12 9 6"/>') +
      '</svg>' +
    '</button>';

  const figures = gallery.map(g =>
    '<figure><img src="' + esc(url(g.src)) + '" alt="' + esc(g.alt) + '" loading="lazy" /></figure>').join('');

  const galleryBody = w.galleryRow
    ? '<div class="rail">' + railBtn('prev') +
        '<div class="cs__gallery cs__gallery--row" tabindex="0">' + figures + '</div>' +
        railBtn('next') +
      '</div>'
    : '<div class="cs__gallery' + (w.galleryGrid ? ' cs__gallery--grid' : '') + '">' + figures + '</div>';

  const gallerySection = gallery.length
    ? '<section class="sec sec--paper">' +
        '<div class="shell">' +
          '<div class="sec__head"><h2>' + esc(w.galleryHeading || 'Photography') + '</h2>' + (w.galleryNote ? '<p>' + esc(w.galleryNote) + '</p>' : '') + '</div>' +
          galleryBody +
        '</div>' +
      '</section>'
    : '';

  // Extra carousels beyond the first, each one its own rail with its own heading.
  const extraCarousels = (w.carousels || []).map(c =>
    '<section class="sec sec--paper">' +
      '<div class="shell">' +
        '<div class="sec__head"><h2>' + esc(c.heading) + '</h2>' + (c.note ? '<p>' + esc(c.note) + '</p>' : '') + '</div>' +
        '<div class="rail">' + railBtn('prev') +
          '<div class="cs__gallery cs__gallery--row" tabindex="0">' +
            c.slides.map(s => '<figure><img src="' + esc(url(s.src)) + '" alt="' + esc(s.alt) + '" loading="lazy" /></figure>').join('') +
          '</div>' +
          railBtn('next') +
        '</div>' +
      '</div>' +
    '</section>').join('');

  // Vertical cut-downs get their own section. Mixing 9:16 into the same grid as a
  // 16:9 film gives you one tall column and one short one, which reads as a mistake.
  const shortsSection = (w.shorts && w.shorts.items && w.shorts.items.length)
    ? '<section class="sec sec--tight">' +
        '<div class="shell">' +
          '<div class="sec__head"><h2>' + esc(w.shorts.heading || 'The vertical cuts') + '</h2>' +
            (w.shorts.note ? '<p>' + esc(w.shorts.note) + '</p>' : '') + '</div>' +
          // Phone-shaped video does not need half the page. Fixed narrow columns, left
          // aligned, so the row simply ends where it ends.
          '<div class="cs__films cs__films--tall cs__films--mini" style="grid-template-columns:repeat(' +
            Math.min(w.shorts.items.length, 5) + ',minmax(0,248px))">' +
            w.shorts.items.map(v =>
              '<figure class="cs__video cs__video--tall">' +
                '<video controls playsinline preload="metadata" poster="' + esc(url(v.poster)) + '" src="' + esc(url(v.src)) + '"></video>' +
                (v.title ? '<figcaption>' + esc(v.title) + '</figcaption>' : '') +
              '</figure>').join('') +
          '</div>' +
        '</div>' +
      '</section>'
    : '';

  // Stills run along one line like the carousels do, on a wider frame because they
  // are landscape. Arrows appear only once there are more than fit.
  const photosSection = (w.photos && w.photos.items && w.photos.items.length)
    ? '<section class="sec sec--paper">' +
        '<div class="shell">' +
          '<div class="sec__head"><h2>' + esc(w.photos.heading || 'Photography') + '</h2>' +
            (w.photos.note ? '<p>' + esc(w.photos.note) + '</p>' : '') + '</div>' +
          '<div class="rail">' + railBtn('prev') +
            '<div class="cs__gallery cs__gallery--row cs__gallery--wide" tabindex="0">' +
              w.photos.items.map(p =>
                '<figure><img src="' + esc(url(p.src)) + '" alt="' + esc(p.alt) + '" loading="lazy" /></figure>').join('') +
            '</div>' +
            railBtn('next') +
          '</div>' +
        '</div>' +
      '</section>'
    : '';

  // Thumbnails sit in their own row because they are judged side by side.
  const thumbsSection = (w.thumbs && w.thumbs.items && w.thumbs.items.length)
    ? '<section class="sec sec--tight">' +
        '<div class="shell">' +
          '<div class="sec__head"><h2>' + esc(w.thumbs.heading || 'The thumbnails') + '</h2>' +
            (w.thumbs.note ? '<p>' + esc(w.thumbs.note) + '</p>' : '') + '</div>' +
          '<div class="cs__thumbs">' +
            w.thumbs.items.map(t =>
              '<figure><img src="' + esc(url(t.src)) + '" alt="' + esc(t.alt) + '" loading="lazy" />' +
                (t.label ? '<figcaption>' + esc(t.label) + '</figcaption>' : '') +
              '</figure>').join('') +
          '</div>' +
        '</div>' +
      '</section>'
    : '';

  // YouTube films load their player only when clicked, so a page of ten stays light.
  const filmMarkup = v =>
    '<figure class="cs__video' + (v.vertical ? ' cs__video--tall' : '') + '">' +
      (v.youtube || v.vimeo
        ? '<button class="cs__play" type="button" data-yt="' + esc(v.youtube || '') + '" data-vimeo="' + esc(v.vimeo || '') + '" aria-label="Play ' + esc(v.title || 'video') + '">' +
            '<img src="' + esc(url(v.poster)) + '" alt="' + esc(v.title || '') + '" loading="lazy" />' +
            '<span class="cs__play-btn" aria-hidden="true"></span>' +
          '</button>'
        : '<video controls playsinline preload="metadata" poster="' + esc(url(v.poster)) + '" src="' + esc(url(v.src)) + '"></video>') +
    '</figure>';

  const videoSection = videos.length
    ? '<section class="sec sec--tight">' +
        '<div class="shell">' +
          '<div class="sec__head"><h2>' + (videos.length > 1 ? 'Videos' : 'Video') + '</h2>' + (w.videoNote ? '<p>' + esc(w.videoNote) + '</p>' : '') + '</div>' +
          '<div class="cs__films' + (videos.length > 1 ? ' cs__films--multi' : '') + (videos.every(v => v.vertical) ? ' cs__films--tall' : '') + '">' +
            videos.map(filmMarkup).join('') +
          '</div>' +
          (w.videoCta
            ? '<div class="sec__foot">' +
                '<a class="btn btn--ghost btn--lg" href="' + esc(w.videoCta.href) + '" target="_blank" rel="noopener">' +
                  '<span>' + esc(w.videoCta.label) + '</span><span class="arrow">&rarr;</span>' +
                '</a>' +
              '</div>'
            : '') +
        '</div>' +
      '</section>'
    : '';

  // Website work gets a browser frame rather than a photo gallery. One version
  // scrolls slowly on its own; more than one gets a toggle between them.
  const siteSection = (w.website && w.website.versions && w.website.versions.length)
    ? '<section class="sec sec--paper">' +
        '<div class="shell">' +
          '<div class="sec__head sec__head--centre"><h2>' + esc(w.website.heading || 'The site') + '</h2>' +
            (w.website.note ? '<p>' + esc(w.website.note) + '</p>' : '') + '</div>' +
          (w.website.versions.length > 1
            ? '<div class="vswitch" role="group" aria-label="Choose a version">' +
                w.website.versions.map((v, i) =>
                  '<button type="button" data-v="' + i + '"' + (i === w.website.versions.length - 1 ? ' class="is-active"' : '') + '>' + esc(v.label) + '</button>'
                ).join('') +
              '</div>'
            : '') +
          '<div class="mac">' +
            '<div class="mac__bar"><span></span><span></span><span></span></div>' +
            '<div class="mac__screen">' +
              w.website.versions.map((v, i) =>
                '<img class="mac__shot' + (i === w.website.versions.length - 1 ? ' is-on' : '') + '" data-v="' + i + '" src="' + esc(url(v.src)) + '" alt="' + esc(v.alt) + '" loading="lazy" />'
              ).join('') +
            '</div>' +
            '<span class="mac__hint">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 21 6 15"/><polyline points="18 9 12 3 6 9"/></svg>' +
              'Scroll' +
            '</span>' +
          '</div>' +
        '</div>' +
      '</section>'
    : '';

  const quoteSection = w.testimonial
    ? '<section class="sec sec--tight" style="padding-top:0"><div class="shell">' +
        '<blockquote class="quote"><p>&ldquo;' + esc(w.testimonial.quote) + '&rdquo;</p><cite>' + esc(w.testimonial.name) + '</cite></blockquote>' +
      '</div></section>'
    : '';

  page.innerHTML =
    '<section class="phero">' +
      '<span class="ast phero__bg" aria-hidden="true"></span>' +
      '<div class="shell">' +
        '<div class="crumb"><a href="/work">Our Work</a><span>&rsaquo;</span><span>' + esc(w.client) + '</span></div>' +
        '' +
        '<h1>' + esc(w.title) + '</h1>' +
        '<p class="phero__sub">' + esc(w.summary) + '</p>' +
      '</div>' +
    '</section>' +

    '<section class="sec sec--tight" style="padding-top:0">' +
      '<div class="shell">' +
        '<div class="cs__meta">' +
          '<div><span>Client</span><strong>' + esc(w.client) + '</strong></div>' +
          '<div><span>Industry</span><strong>' + esc(w.industry) + '</strong></div>' +
          '<div><span>Categories</span><strong>' + esc(w.categories.join(', ')) + '</strong></div>' +
        '</div>' +

        '<div class="cs__body">' +
          '<div class="prose">' +
            '<h2 style="font-weight:900;font-size:clamp(26px,3vw,38px);letter-spacing:-.03em">Client overview</h2>' +
            '<p>' + esc(w.overview) + '</p>' +
            '<h3>The challenge</h3>' +
            '<p>' + esc(w.challenge) + '</p>' +
            '<h3>What we delivered</h3>' +
            list(w.delivered, '') +
            (w.results ? '<h3>Results</h3>' + list(w.results, '') : '') +
          '</div>' +

          '<aside class="cs__aside">' +
            '<div class="cscta">' +
              '<span class="ast cscta__ast" aria-hidden="true"></span>' +
              '<h3>Want something like this?</h3>' +
              '<p>Tell us what you need and roughly when. We come back within one working day with a clear next step.</p>' +
              '<a class="btn btn--orange btn--lg cscta__btn" href="#" data-quickform="' + esc(w.client) + '"><span>' + esc(w.cta.label) + '</span><span class="arrow">&rarr;</span></a>' +
              '<span class="cscta__note">Three fields. Takes about a minute.</span>' +
            '</div>' +
          '</aside>' +
        '</div>' +
      '</div>' +
    '</section>' +

    // The film first, then how it earns the click, then everything cut from it,
    // then the static formats, then the photography.
    siteSection +
    videoSection +
    thumbsSection +
    shortsSection +
    gallerySection +
    extraCarousels +
    photosSection +
    quoteSection +

    '<section class="sec sec--tight" style="padding-top:0">' +
      '<div class="shell">' +
        '<div class="sec__head"><h2>More work</h2></div>' +
        '<div class="wgrid">' + DATA.filter(x => x.slug !== w.slug).slice(0, 3).map(card).join('') + '</div>' +
      '</div>' +
    '</section>';

  // Sideways rails: the arrows page across roughly one screen at a time, and hide
  // themselves at each end so they never sit there doing nothing.
  page.querySelectorAll('.rail').forEach(rail => {
    const track = rail.querySelector('.cs__gallery--row');
    if (!track) return;

    const sync = () => {
      const far = track.scrollWidth - track.clientWidth;
      rail.classList.toggle('rail--off', far <= 1);
      rail.classList.toggle('at-start', track.scrollLeft <= 1);
      rail.classList.toggle('at-end', track.scrollLeft >= far - 1);
    };

    rail.querySelectorAll('[data-rail]').forEach(btn => {
      btn.addEventListener('click', () => {
        const step = Math.max(240, Math.round(track.clientWidth * 0.85));
        track.scrollBy({ left: btn.dataset.rail === 'prev' ? -step : step, behavior: 'smooth' });
      });
    });

    track.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    if ('ResizeObserver' in window) new ResizeObserver(sync).observe(track);
    sync();
  });

  // The browser frame drifts down the page on its own, but the moment anyone
  // scrolls, drags or tabs into it they take over and it stops fighting them.
  page.querySelectorAll('.mac').forEach(mac => {
    const screen = mac.querySelector('.mac__screen');
    if (!screen) return;

    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let drifting = !calm, visible = false, dir = 1, hold = 0, carry = 0, last = 0, raf = 0;

    const release = () => { drifting = false; mac.classList.add('is-held'); };
    ['wheel', 'pointerdown', 'touchstart', 'keydown'].forEach(ev =>
      screen.addEventListener(ev, release, { passive: true }));
    screen.addEventListener('scroll', () => mac.classList.add('is-held'), { passive: true, once: true });

    const tick = now => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(64, now - last) : 0;
      last = now;
      if (!drifting || !visible || document.hidden) return;
      if (hold > 0) { hold -= dt; return; }

      const far = screen.scrollHeight - screen.clientHeight;
      if (far <= 1) return;
      carry += dt * 0.032 * dir;                 // a shade over 30px a second
      const step = Math.trunc(carry);
      if (!step) return;
      carry -= step;
      screen.scrollTop += step;
      // pause at each end, then come back the other way
      if (dir > 0 && screen.scrollTop >= far - 1) { dir = -1; hold = 1400; }
      else if (dir < 0 && screen.scrollTop <= 0) { dir = 1; hold = 1400; }
    };

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; }),
        { rootMargin: '80px' }).observe(mac);
    } else { visible = true; }
    raf = requestAnimationFrame(tick);
    window.addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });

    // version toggle, scoped to this frame
    const vsw = mac.parentElement && mac.parentElement.querySelector('.vswitch');
    if (vsw) {
      vsw.addEventListener('click', e => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        vsw.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
        mac.querySelectorAll('.mac__shot').forEach(img => img.classList.toggle('is-on', img.dataset.v === b.dataset.v));
        screen.scrollTop = 0;                    // a new version starts at the top
        dir = 1; carry = 0; hold = 700;
      });
    }
  });

  playCoversInView(page);

  // Swap a poster for the real player on click.
  page.querySelectorAll('.cs__play').forEach(btn => {
    btn.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = btn.dataset.vimeo
        ? 'https://player.vimeo.com/video/' + btn.dataset.vimeo + '?autoplay=1'
        : 'https://www.youtube-nocookie.com/embed/' + btn.dataset.yt + '?autoplay=1&rel=0';
      frame.title = btn.getAttribute('aria-label') || 'Video';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.allowFullscreen = true;
      btn.replaceWith(frame);
    });
  });
}
})();
