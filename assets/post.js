/* Behaviour for the blog index (#postList) and a single post (#postPage).
   The markup itself is rendered on the server (lib/blogssr.mjs), so search engines
   and link previews see the full page. This file only brings it to life. */
(function () {
  'use strict';

  const list = document.getElementById('postList');
  const page = document.getElementById('postPage');
  if (list && list.hasAttribute('data-ssr')) enhanceList();
  if (page && page.hasAttribute('data-ssr')) enhancePost();

  // The pager links are real links. With JavaScript, pages swap in place and scroll to the list instead of reloading.
  function enhanceList() {
    const scrollToList = n => {
      const t = document.getElementById(n === 1 ? 'blogTop' : 'blogRows');
      const nav = document.querySelector('.nav');
      if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - ((nav ? nav.offsetHeight : 0) + 24), behavior: 'smooth' });
    };
    const load = (href, push) => fetch(href, { headers: { Accept: 'text/html' } })
      .then(r => (r.ok ? r.text() : Promise.reject(new Error('blog ' + r.status))))
      .then(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const next = doc.getElementById('postList');
        if (!next) throw new Error('no list');
        list.innerHTML = next.innerHTML;
        list.dataset.page = next.dataset.page;
        document.title = doc.title;
        ['link[rel="canonical"]', 'link[rel="prev"]', 'link[rel="next"]', 'meta[name="description"]', 'meta[property="og:url"]', 'meta[property="og:title"]'].forEach(sel => {
          const old = document.head.querySelector(sel), fresh = doc.head.querySelector(sel);
          if (old && fresh) old.replaceWith(fresh);
          else if (old) old.remove();
          else if (fresh) document.head.appendChild(fresh);
        });
        if (push) history.pushState({ page: +next.dataset.page }, '', href);
        scrollToList(+next.dataset.page || 1);
      })
      .catch(() => { location.href = href; });

    list.addEventListener('click', e => {
      const a = e.target.closest('a[data-page]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
      e.preventDefault();
      load(a.getAttribute('href'), true);
    });
    window.addEventListener('popstate', () => load(location.pathname + location.search, false));
  }

  function enhancePost() {
    const body = page.querySelector('.article__body');

    // site.js fades sections in on scroll. A post has always appeared at once, so its sections opt out.
    page.querySelectorAll('section.reveal').forEach(s => s.classList.remove('reveal'));

    // Charts animate in when they scroll into view, and their big numbers count up from zero.
    page.querySelectorAll('figure.pstat').forEach(fig => {
      fig.querySelectorAll('[data-count]').forEach(el => { el.textContent = '0'; });
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { fig.classList.add('is-in'); countUp(fig); io.disconnect(); } }), { threshold: 0.3 });
        io.observe(fig);
      } else { fig.classList.add('is-in'); countUp(fig); }
    });

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

    // site.js wires the booking modal on load, so links here borrow the nav button's click.
    page.querySelectorAll('[data-book]').forEach(a => a.addEventListener('click', e => {
      const first = document.querySelector('.nav [data-book]');
      if (first && first !== a) { e.preventDefault(); first.click(); }
    }));

    // Embedded films are a still and a play button until someone presses play.
    page.querySelectorAll('.yt[data-yt]').forEach(el => {
      const btn = el.querySelector('.yt__play');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const title = el.dataset.title || 'Film', iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(el.dataset.yt) + '?autoplay=1&rel=0';
        iframe.title = title;
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        iframe.allowFullscreen = true;
        el.replaceChildren(iframe);
      });
    });
  }

  function countUp(root) {
    root.querySelectorAll('[data-count]').forEach(el => {
      const end = parseFloat(el.dataset.count), dec = (String(el.dataset.count).split('.')[1] || '').length, t0 = performance.now();
      const step = now => { const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = (end * e).toFixed(dec); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
})();
