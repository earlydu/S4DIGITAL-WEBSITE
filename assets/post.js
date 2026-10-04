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
    const href = p => esc(p.legacyUrl || '/blog/' + p.slug);
    const meta = p => '<span class="bmeta">' + esc(nice(p.date)) + ' &middot; ' + esc(p.readingTime || 5) + ' min read</span>';
    const img = p => p.cover ? '<img src="' + esc(p.cover) + '" alt="' + esc(p.coverAlt) + '" loading="lazy" />' : '';
    const PER = 9, pages = Math.max(1, Math.ceil(items.length / PER));
    const pageFromUrl = () => Math.min(pages, Math.max(1, parseInt(new URLSearchParams(location.search).get('page'), 10) || 1));
    const row = p =>
      '<a class="brow" href="' + href(p) + '">' +
        '<div class="brow__img">' + img(p) + '</div>' +
        '<div><h2>' + esc(p.title) + '</h2><p>' + esc(p.excerpt) + '</p>' + meta(p) + '</div>' +
      '</a>';
    const pager = n => {
      if (pages < 2) return '';
      const link = (k, label, cls) => '<a class="bpage' + (cls ? ' ' + cls : '') + '" href="/blog' + (k > 1 ? '?page=' + k : '') + '" data-page="' + k + '"' + (k === n && !cls ? ' aria-current="page"' : '') + '>' + label + '</a>';
      let out = '<nav class="bpager" aria-label="Blog pages">';
      if (n > 1) out += link(n - 1, '&larr; Newer', 'bpage--step');
      for (let k = 1; k <= pages; k++) out += link(k, k);
      if (n < pages) out += link(n + 1, 'Older &rarr;', 'bpage--step');
      return out + '</nav>';
    };

    const draw = (n, scroll) => {
      const [lead, ...rest] = items;
      const slice = items.slice((n - 1) * PER, n * PER);
      list.innerHTML =
        (n === 1 ?
          '<div class="btop" id="blogTop">' +
            '<a class="bfeat" href="' + href(lead) + '"><div class="bfeat__img">' + img(lead) + '</div>' +
              '<h2>' + esc(lead.title) + '</h2><p>' + esc(lead.excerpt) + '</p>' + meta(lead) + '</a>' +
            '<div class="brecent"><h3>Recent</h3>' +
              rest.slice(0, 4).map(p => '<a href="' + href(p) + '"><strong>' + esc(p.title) + '</strong>' + meta(p) + '</a>').join('') +
            '</div>' +
          '</div>' +
          '<a class="breport" href="/guide">' +
            '<div class="breport__img"><img src="/assets/guide/guide-cover.png" alt="Cover of Before the Camera Comes Out, the free brand film playbook" loading="lazy" /></div>' +
            '<div class="breport__body">' +
              '<strong>Before the camera comes out: the free brand film playbook</strong>' +
              '<p>The questions we ask, what films really cost, a brief template, a licensing checklist and a 30-day release plan. Everything we know, free.</p>' +
              '<span class="btn btn--orange"><span>Get the guide</span><span class="arrow">&rarr;</span></span></div>' +
          '</a>' : '') +
        '<div class="brows" id="blogRows"><h3>' + (n === 1 ? 'All posts' : 'All posts &middot; page ' + n + ' of ' + pages) + '</h3>' +
          slice.map(row).join('') +
        '</div>' + pager(n);
      document.title = (n > 1 ? 'Blog, page ' + n + ' | ' : 'Blog | ') + 's4digital, documentary brand films';
      if (scroll) {
        const t = document.getElementById(n === 1 ? 'blogTop' : 'blogRows');
        const nav = document.querySelector('.nav');
        if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - ((nav ? nav.offsetHeight : 0) + 24), behavior: 'smooth' });
      }
    };

    list.addEventListener('click', e => {
      const a = e.target.closest('a[data-page]');
      if (!a) return;
      e.preventDefault();
      const n = +a.dataset.page;
      history.pushState({ page: n }, '', a.getAttribute('href'));
      draw(n, true);
    });
    window.addEventListener('popstate', () => draw(pageFromUrl(), true));
    draw(pageFromUrl(), false);
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
        '<div class="crumb"><a href="/blog">&larr; All posts</a></div>' +
        '<h1 style="max-width:24ch">' + esc(p.title) + '</h1>' +
        '<div class="article__meta"><span>' + esc(nice(p.date)) + '</span><span>&middot;</span>' +
          '<span>' + esc(p.readingTime || 5) + ' min read</span><span>&middot;</span><span>' + esc(p.author || 'Earl Duncan') + '</span></div>' +
      '</div></section>' +
      '<section class="sec" style="padding-top:0"><div class="shell article">' +
        (p.cover ? '<figure class="article__cover"><img src="' + esc(p.cover) + '" alt="' + esc(p.coverAlt) + '" /></figure>' : '') +
        '<div class="article__body">' + (p.body || '') + '</div>' +
      '</div></section>' +
      '<section class="sec" style="padding-top:0"><div class="shell article">' + authorHtml(p) + faqHtml(p) + '</div></section>' +
      morePosts(p, items) +
      '<section class="pband"><div class="shell pband__inner">' +
        '<h2>Got a story <span>worth filming?</span></h2>' +
        '<p>We make documentary-style brand films about businesses that are exceptionally good at what they do. The first conversation is free.</p>' +
        '<div class="pband__ctas"><a class="btn btn--orange btn--lg" data-book href="/contact"><span>Book a discovery call</span><span class="arrow">&rarr;</span></a>' +
        '<a class="btn btn--ghost btn--lg" href="/films"><span>See the films</span><span class="arrow">&rarr;</span></a></div>' +
      '</div></section>' +
      '<aside class="pfloat" id="pFloat" aria-label="Talk to Earl about a film" hidden>' +
        '<button type="button" class="pfloat__x" aria-label="Close">&times;</button>' +
        '<div class="pfloat__head"><img src="/assets/earl/earl-head.png" alt="" /><div><strong>Thinking about a film?</strong><span>Tell me a bit about it and I&rsquo;ll come back within one working day.</span></div></div>' +
        '<form class="pfloat__form" action="https://formsubmit.co/ajax/005f38c83e0554279919ce0dff944657" method="POST">' +
          '<input type="hidden" name="_subject" value="Blog enquiry: ' + esc(p.title) + '">' +
          '<input type="hidden" name="_template" value="table"><input type="hidden" name="_captcha" value="false">' +
          '<input type="text" name="_honey" tabindex="-1" autocomplete="off" class="pfloat__hp" aria-hidden="true">' +
          '<label><span>Name</span><input type="text" name="Name" autocomplete="name" required></label>' +
          '<label><span>Email</span><input type="email" name="Email" autocomplete="email" required></label>' +
          '<label><span>Phone <em>optional</em></span><input type="tel" name="Phone" autocomplete="tel"></label>' +
          '<label><span>What&rsquo;s the story?</span><textarea name="Enquiry" rows="3" required></textarea></label>' +
          '<button type="submit" class="btn btn--orange"><span>Send it to Earl</span><span class="arrow">&rarr;</span></button>' +
          '<p class="pfloat__msg" role="status" aria-live="polite"></p>' +
        '</form>' +
      '</aside>';

    const body = page.querySelector('.article__body');
    const h2s = body ? body.querySelectorAll(':scope > h2') : [];

    // A stat with its source, drawn as a single-series bar chart in the brand blue.
    // A stat with its source. One per post via p.stat, or several via p.stats placed in <div class="pstat-slot" data-stat="id">.
    const makeStat = st => {
      const max = Math.max.apply(null, st.bars.map(b => b.value)) || 1;
      const fig = document.createElement('figure');
      fig.className = 'pstat pstat--' + (st.type || 'bars');
      fig.innerHTML = '<figcaption class="pstat__title">' + esc(st.title) + '</figcaption>' + vizHtml(st, max) +
        (st.takeaway ? '<p class="pstat__take">' + esc(st.takeaway) + '</p>' : '') +
        (st.note ? '<p class="pstat__src">' + esc(st.note) + '</p>' : '') +
        (st.source ? '<p class="pstat__src">Source: ' + (st.source.url ? '<a href="' + esc(st.source.url) + '" target="_blank" rel="noopener">' + esc(st.source.name) + '</a>' : esc(st.source.name)) + '</p>' : '');
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { fig.classList.add('is-in'); countUp(fig); io.disconnect(); } }), { threshold: 0.3 });
        io.observe(fig);
      } else { fig.classList.add('is-in'); countUp(fig); }
      return fig;
    };
    if (p.stat && h2s.length) {
      const at = h2s[Math.min(p.stat.after != null ? p.stat.after : 1, h2s.length - 1)];
      at.parentNode.insertBefore(makeStat(p.stat), at);
    }
    if (Array.isArray(p.stats) && body) {
      body.querySelectorAll('.pstat-slot[data-stat]').forEach(slot => {
        const st = p.stats.find(x => x.id === slot.dataset.stat);
        if (st) slot.replaceWith(makeStat(st)); else slot.remove();
      });
    }

    // One promo break a little past the middle: the free planning guide.
    if (h2s.length > 3) {
      const promo = document.createElement('aside');
      promo.className = 'ppromo';
      promo.innerHTML = '<div class="ppromo__img"><img src="/assets/guide/guide-cover.png" alt="Before the Camera Comes Out, the free s4digital brand film playbook" loading="lazy" /></div>' +
        '<div class="ppromo__body">' +
        '<strong>Before the camera comes out: our free 44-page brand film playbook</strong>' +
        '<p>Find the story, set a budget that makes sense and brief a production company properly. The same questions we ask before every film.</p>' +
        '<a class="btn btn--orange" href="/guide"><span>Get the free guide</span><span class="arrow">&rarr;</span></a></div>';
      const at = h2s[Math.ceil(h2s.length * 0.6)];
      at.parentNode.insertBefore(promo, at);
    }

    // The side panel turns up once the reader is halfway through the article, and gets out of the way at the end.
    const float = document.getElementById('pFloat');
    if (float && body) {
      let closed = false;
      try { closed = sessionStorage.getItem('pfloat') === '1'; } catch (_) {}
      const band = page.querySelector('.pband');
      const check = () => {
        if (closed) { float.hidden = true; return; }
        const r = body.getBoundingClientRect();
        const read = (window.innerHeight - r.top) / r.height;
        const atEnd = band && band.getBoundingClientRect().top < window.innerHeight;
        float.hidden = read < 0.5 || atEnd;
      };
      const shut = () => { closed = true; try { sessionStorage.setItem('pfloat', '1'); } catch (_) {} check(); };
      float.querySelector('.pfloat__x').addEventListener('click', shut);
      window.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check);
      check();

      const form = float.querySelector('form'), msg = float.querySelector('.pfloat__msg');
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = form.querySelector('button');
        btn.disabled = true; msg.textContent = 'Sending...';
        try {
          const r = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
          if (!r.ok) throw new Error(r.status);
          form.innerHTML = '<p class="pfloat__done"><strong>Got it, thanks.</strong> I&rsquo;ll be in touch within one working day.</p>';
          setTimeout(shut, 6000);
        } catch (_) {
          btn.disabled = false;
          msg.innerHTML = 'That didn&rsquo;t send. Email earl@s4digi.com instead and I&rsquo;ll pick it up.';
        }
      });
    }

    // A cinema camera falls down the left margin as you read, and smashes when you reach the end.
    if (body && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const fall = document.createElement('div');
      fall.className = 'pfall';
      fall.setAttribute('aria-hidden', 'true');
      fall.innerHTML = '<span class="pfall__dust"><i></i><i></i><i></i></span>' +
        '<img class="pfall__cam" src="/assets/blog/camera-intact.png" alt="" />' +
        '<img class="pfall__broken" src="/assets/blog/camera-broken.png" alt="" loading="lazy" />';
      document.body.appendChild(fall);
      // It lands on the white page just above "Keep reading", then scrolls away with the page.
      let broken = false;
      const move = () => {
        const gutter = page.querySelector('.article').getBoundingClientRect().left;
        const w = Math.min(230, gutter - 56);
        fall.hidden = w < 140;
        fall.style.width = w + 'px';
        fall.style.left = Math.max(16, (gutter - w) / 2 - 8) + 'px';
        const r = body.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (window.innerHeight * 0.35 - r.top) / r.height));
        const floor = page.querySelector('.pmore') || page.querySelector('.pband');
        const landAt = (floor ? floor.getBoundingClientRect().top + window.scrollY : document.body.scrollHeight) - fall.offsetHeight - 70;
        const yPx = 150 + (window.innerHeight * 0.78 - 150) * t;
        const landed = window.scrollY + yPx >= landAt;
        if (landed) {
          fall.style.position = 'absolute';
          fall.style.setProperty('--y', landAt + 'px');
        } else {
          fall.style.position = '';
          fall.style.setProperty('--y', yPx.toFixed(1) + 'px');
          fall.style.setProperty('--r', (Math.sin(t * Math.PI * 3) * 28 + t * 360).toFixed(1) + 'deg');
        }
        if (landed !== broken) { broken = landed; fall.classList.toggle('is-broken', landed); }
      };
      window.addEventListener('scroll', move, { passive: true });
      window.addEventListener('resize', move);
      move();
    }

    // Gear I actually use: matched automatically from content/gear.json by phrases in the post.
    if (body) fetch('/api/content?file=gear', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(g => {
      if (!g || !g.items) return;
      const text = body.innerText.toLowerCase();
      const hits = g.items.filter(it => (it.match || []).some(m => text.includes(m.toLowerCase())));
      if (!hits.length) return;
      const box = document.createElement('aside');
      box.className = 'pgear';
      let anyAff = false;
      box.innerHTML = hits.map(it => {
        let link = it.affiliate || it.url, aff = !!it.affiliate;
        const pr = g.programmes || {};
        if (!aff && pr.amazon_uk_tag && /^https:\/\/(www\.)?amazon\.co\.uk\//.test(link)) {
          link += (link.includes('?') ? '&' : '?') + 'tag=' + encodeURIComponent(pr.amazon_uk_tag); aff = true;
        }
        if (aff) anyAff = true;
        return '<a class="pgear__item" href="' + esc(link) + '" target="_blank" rel="noopener' + (aff ? ' sponsored' : '') + '">' +
          (it.image ? '<img src="' + esc(it.image) + '" alt="' + esc(it.name) + '" loading="lazy" />' : '') +
          '<span><strong>' + esc(it.name) + '</strong><em>' + esc(it.maker || '') + '</em><span>' + esc(it.why) + '</span>' +
          '<b>' + (aff ? 'See the price' : 'Take a look') + ' &rarr;</b>' + (it.imageCredit ? '<small>' + esc(it.imageCredit) + '</small>' : '') + '</span></a>';
      }).join('') +
        (anyAff ? '<p class="pgear__note">Some links here are affiliate links. If you buy through one I may earn a small commission, at no extra cost to you. I only list kit I use.</p>' : '');
      const h2 = body.querySelectorAll(':scope > h2');
      const at = h2[Math.min(2, h2.length - 1)];
      at ? at.parentNode.insertBefore(box, at) : body.appendChild(box);
    }).catch(() => {});

    // A link to a post that isn't live yet reads as plain text until its publish date.
    if (body) {
      const live = new Set(items.map(x => x.slug));
      body.querySelectorAll('a[href^="/blog/"]').forEach(a => {
        const slug = a.getAttribute('href').replace(/^\/blog\//, '').split(/[?#]/)[0];
        if (slug && !live.has(slug)) { const span = document.createElement('span'); span.textContent = a.textContent; a.replaceWith(span); }
      });
    }

    // Photos in the article open full size when clicked.
    if (body) {
      const imgs = Array.from(body.querySelectorAll('figure img, .pair img')).concat(Array.from(page.querySelectorAll('.article__cover img')));
      if (imgs.length) {
        const lb = document.createElement('div');
        lb.className = 'plb'; lb.hidden = true;
        lb.innerHTML = '<button type="button" class="plb__x" aria-label="Close">&times;</button><img alt="" /><p></p>';
        document.body.appendChild(lb);
        const big = lb.querySelector('img'), cap = lb.querySelector('p');
        const close = () => { lb.hidden = true; document.body.style.overflow = ''; };
        imgs.forEach(im => {
          im.classList.add('is-zoomable');
          im.addEventListener('click', () => {
            big.src = im.currentSrc || im.src; big.alt = im.alt;
            const fc = im.closest('figure') && im.closest('figure').querySelector('figcaption');
            cap.textContent = fc ? fc.textContent : '';
            lb.hidden = false; document.body.style.overflow = 'hidden';
          });
        });
        lb.addEventListener('click', e => { if (e.target !== big) close(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) close(); });
      }
    }

    // The FAQ keeps one answer open at a time.
    page.querySelectorAll('.pfaq details').forEach(d => d.addEventListener('toggle', () => {
      if (d.open) page.querySelectorAll('.pfaq details').forEach(o => { if (o !== d) o.open = false; });
    }));

    // site.js wires the booking modal on load, so links added here borrow the nav button's click.
    page.querySelectorAll('[data-book]').forEach(a => a.addEventListener('click', e => {
      const first = document.querySelector('.nav [data-book]');
      if (first && first !== a) { e.preventDefault(); first.click(); }
    }));

    // Embedded films load as a still and a play button, and only fetch YouTube once someone presses play.
    page.querySelectorAll('.yt[data-yt]').forEach(el => {
      const id = el.dataset.yt, title = el.dataset.title || 'Film';
      el.innerHTML = '<img src="' + esc(el.dataset.poster || ('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg')) + '" alt="" loading="lazy" />' +
        '<button type="button" class="yt__play" aria-label="Play ' + esc(title) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></button>' +
        '<span class="yt__label">' + esc(title) + '</span>';
      el.querySelector('button').addEventListener('click', () => {
        el.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0" title="' + esc(title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
      });
    });

    // Article data for search engines and AI answer engines.
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      headline: p.title, description: p.excerpt || '', datePublished: p.date,
      author: { '@type': 'Person', name: p.author || 'Earl Duncan', url: 'https://s4digi.com/about' },
      publisher: { '@type': 'Organization', name: 's4digital', url: 'https://s4digi.com' },
      image: p.cover ? 'https://s4digi.com' + p.cover : undefined,
      mainEntityOfPage: 'https://s4digi.com/blog/' + p.slug
    });
    document.head.appendChild(ld);
    if (p.faqs && p.faqs.length) {
      const fq = document.createElement('script');
      fq.type = 'application/ld+json';
      fq.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: p.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
      document.head.appendChild(fq);
    }
  }

  // Every post carries a real author with a way to check who they are.
  const AUTHORS = {
    'Earl Duncan': {
      img: '/assets/earl/earl-head.png',
      role: 'Founder and director, s4digital',
      bio: 'Earl makes documentary-style brand films about people who are exceptionally good at what they do, from shoemakers and cheesemongers to world champion fighters. He is currently making Manxinha, a feature documentary about the founder of London Fight Factory.',
      links: [['Instagram', 'https://www.instagram.com/earlduncan'], ['LinkedIn', 'https://www.linkedin.com/in/earlcan/'], ['About Earl', '/about']]
    }
  };

  function authorHtml(p) {
    const a = AUTHORS[p.author || 'Earl Duncan'];
    if (!a) return '';
    return '<aside class="pauthor"><img src="' + esc(a.img) + '" alt="' + esc(p.author || 'Earl Duncan') + '" />' +
      '<div><span class="pauthor__kicker">Written by</span><strong>' + esc(p.author || 'Earl Duncan') + '</strong>' +
      '<span class="pauthor__role">' + esc(a.role) + '</span><p>' + esc(a.bio) + '</p>' +
      '<div class="pauthor__links">' + a.links.map(l => '<a href="' + esc(l[1]) + '"' + (/^https?:/.test(l[1]) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l[0]) + '</a>').join('') + '</div></div></aside>';
  }

  function countUp(root) {
    root.querySelectorAll('[data-count]').forEach(el => {
      const end = parseFloat(el.dataset.count), dec = (String(el.dataset.count).split('.')[1] || '').length, t0 = performance.now();
      const step = now => { const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = (end * e).toFixed(dec); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  // Six ways to show a number, so every post's data doesn't look the same.
  function vizHtml(st, max) {
    const u = esc(st.unit || ''), bars = st.bars || [];
    const ring = (v, size) => {
      const r = 42, c = 2 * Math.PI * r;
      return '<svg class="pstat__ring" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true">' +
        '<circle cx="50" cy="50" r="' + r + '" class="pstat__ringbg"/>' +
        '<circle cx="50" cy="50" r="' + r + '" class="pstat__ringfg" style="--c:' + c.toFixed(1) + ';--o:' + (c * (1 - v / 100)).toFixed(1) + '" transform="rotate(-90 50 50)"/></svg>';
    };
    switch (st.type) {
      case 'paired': {
        const names = (st.series || []).map(x => x.name), mx = Math.max.apply(null, bars.map(b => Math.max.apply(null, b.values))) || 1;
        return '<div class="pstat__legendrow">' + names.map((n, i) => '<span class="s' + i + '"><i></i>' + esc(n) + '</span>').join('') + '</div>' +
          '<div class="pstat__paired">' + bars.map(b => '<div class="pstat__pgroup"><span class="pstat__label">' + esc(b.label) + '</span>' +
            b.values.map((v, i) => '<div class="pstat__prow s' + i + '"><span class="pstat__track"><span class="pstat__bar" style="--w:' + (v / mx * 100).toFixed(1) + '%"></span></span><span class="pstat__val">' + esc(v) + u + '</span></div>').join('') +
          '</div>').join('') + '</div>';
      }
      case 'rings':
        return '<div class="pstat__rings">' + bars.map(b => '<div class="pstat__ringitem"><div class="pstat__ringwrap">' + ring(b.value, 120) +
          '<span class="pstat__ringval">' + esc(b.value) + u + '</span></div><span class="pstat__label">' + esc(b.label) + '</span></div>').join('') + '</div>';
      case 'big':
        return '<div class="pstat__bigs">' + bars.map(b => '<div><span class="pstat__big" data-count="' + esc(b.value) + '">0</span><span class="pstat__bigu">' + u + '</span>' +
          '<span class="pstat__label">' + esc(b.label) + '</span></div>').join('') + '</div>';
      case 'people': {
        const b = bars[bars.length - 1], n = Math.round(b.value);
        let dots = '';
        for (let i = 0; i < 100; i++) dots += '<i class="' + (i < n ? 'on' : '') + '" style="--d:' + (i * 8) + 'ms"></i>';
        return '<div class="pstat__people"><div class="pstat__grid" role="img" aria-label="' + n + ' in 100 people">' + dots + '</div>' +
          '<div><span class="pstat__big" data-count="' + n + '">0</span><span class="pstat__bigu">in 100</span><span class="pstat__label">' + esc(b.label) + '</span>' +
          (bars.length > 1 ? '<span class="pstat__trend">' + bars.map(x => esc(x.label) + ': ' + esc(x.value) + u).join(' &middot; ') + '</span>' : '') + '</div></div>';
      }
      case 'compare': {
        const [a, b] = bars, up = ((b.value - a.value) / a.value * 100).toFixed(0);
        return '<div class="pstat__compare"><div><span class="pstat__label">' + esc(a.label) + '</span><span class="pstat__cnum">' + esc(st.prefix || '') + esc(a.value) + esc(st.suffix || '') + '</span></div>' +
          '<div class="pstat__arrow" aria-hidden="true"><svg viewBox="0 0 120 40"><path d="M4 20h100M90 6l16 14-16 14"/></svg><span>' + (up > 0 ? '+' : '') + up + '%</span></div>' +
          '<div class="is-now"><span class="pstat__label">' + esc(b.label) + '</span><span class="pstat__cnum">' + esc(st.prefix || '') + esc(b.value) + esc(st.suffix || '') + '</span></div></div>';
      }
      case 'donut': {
        const total = bars.reduce((t, b) => t + b.value, 0) || 1, r = 40, c = 2 * Math.PI * r;
        let off = 0;
        const segs = bars.map((b, i) => {
          const len = b.value / total * c, seg = '<circle cx="50" cy="50" r="' + r + '" class="pstat__seg' + (i === 0 ? ' is-lead' : '') + '" style="--o:' + (-off).toFixed(2) + '" stroke-dasharray="' + Math.max(0, len - 1.2).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 50 50)"/>';
          off += len; return seg;
        }).join('');
        return '<div class="pstat__donut"><div class="pstat__ringwrap"><svg viewBox="0 0 100 100" width="220" height="220" aria-hidden="true">' + segs + '</svg>' +
          '<span class="pstat__ringval">' + esc(bars[0].value) + u + '</span></div><ul class="pstat__legend">' +
          bars.map((b, i) => '<li class="' + (i === 0 ? 'is-lead' : '') + '"><i></i>' + esc(b.label) + '<b>' + esc(b.value) + u + '</b></li>').join('') + '</ul></div>';
      }
      default:
        return '<div class="pstat__bars" role="table" aria-label="' + esc(st.title) + '">' +
          bars.map(b => '<div class="pstat__row" role="row" title="' + esc(b.label) + ': ' + esc(b.value) + u + '">' +
            '<span class="pstat__label" role="cell">' + esc(b.label) + '</span>' +
            '<span class="pstat__track" role="presentation"><span class="pstat__bar" style="--w:' + (b.value / max * 100).toFixed(1) + '%"></span></span>' +
            '<span class="pstat__val" role="cell">' + esc(b.value) + u + '</span></div>').join('') + '</div>';
    }
  }

  function faqHtml(p) {
    if (!p.faqs || !p.faqs.length) return '';
    return '<section class="pfaq"><h2>Questions people ask</h2>' +
      p.faqs.map(f => '<details><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>').join('') + '</section>';
  }

  function morePosts(p, items) {
    const others = items.filter(x => x.slug !== p.slug);
    const pick = others.filter(x => x.category === p.category).concat(others.filter(x => x.category !== p.category)).slice(0, 3);
    if (!pick.length) return '';
    return '<section class="sec pmore"><div class="shell"><h2>Keep reading</h2><div class="pmore__grid">' +
      pick.map(x => '<a class="pmore__card" href="/blog/' + esc(x.slug) + '">' +
        (x.cover ? '<div class="pmore__img"><img src="' + esc(x.cover) + '" alt="' + esc(x.coverAlt) + '" loading="lazy" /></div>' : '') +
        '<strong>' + esc(x.title) + '</strong><span>' + esc(x.readingTime || 5) + ' min read</span></a>').join('') +
      '</div><a class="pmore__all" href="/blog">All posts &rarr;</a></div></section>';
  }
})();
