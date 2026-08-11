/* s4digital - shared site behaviour.
   Every block is guarded so the same file can be dropped on any page. */

(function () {
  'use strict';

  /* ---------- Footer year ---------- */
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Back to top ---------- */
  (function () {
    const btn = document.getElementById('toTop');
    if (!btn) return;
    const onScroll = () => btn.classList.toggle('is-visible', window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    onScroll();
  })();

  /* ---------- Mobile menu drawer ---------- */
  (function () {
    const burger = document.getElementById('navBurger');
    const menu = document.getElementById('mnav');
    const closeBtn = document.getElementById('mnavClose');
    if (!burger || !menu || !closeBtn) return;
    const open = () => {
      menu.classList.add('is-open');
      menu.setAttribute('aria-hidden', 'false');
      burger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('is-no-scroll');
    };
    const close = () => {
      menu.classList.remove('is-open');
      menu.setAttribute('aria-hidden', 'true');
      burger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('is-no-scroll');
    };
    burger.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    menu.querySelectorAll('[data-mnav-link]').forEach(a => a.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) close(); });
  })();

  /* ---------- Theme: auto by local daylight, manual override sticks ---------- */
  (function () {
    const root = document.documentElement;

    const legacy = localStorage.getItem('s4-theme');
    if (legacy && !localStorage.getItem('s4-theme-mode')) {
      localStorage.setItem('s4-theme-mode', legacy);
      localStorage.removeItem('s4-theme');
    }
    const getMode = () => localStorage.getItem('s4-theme-mode') || 'auto';
    const setMode = m => localStorage.setItem('s4-theme-mode', m);

    // Approximate sunrise/sunset by month (London local time, BST adjusted).
    const SUN = [
      [8.0, 16.25], [7.5, 17.0], [6.5, 18.0], [6.25, 19.83],
      [5.5, 20.5], [4.75, 21.25], [5.0, 21.25], [5.75, 20.5],
      [6.5, 19.5], [7.25, 18.5], [7.5, 16.5], [8.0, 16.0]
    ];
    const isDarkHours = (d = new Date()) => {
      const [rise, set] = SUN[d.getMonth()];
      const hour = d.getHours() + d.getMinutes() / 60;
      return hour < rise || hour >= set;
    };
    const fadeTo = theme => {
      if (root.getAttribute('data-theme') === theme) return;
      root.classList.add('is-themeing');
      root.setAttribute('data-theme', theme);
      window.setTimeout(() => root.classList.remove('is-themeing'), 700);
    };

    const mode = getMode();
    root.setAttribute('data-theme', mode === 'auto' ? (isDarkHours() ? 'dark' : 'light') : mode);
    window.setInterval(() => { if (getMode() === 'auto') fadeTo(isDarkHours() ? 'dark' : 'light'); }, 5 * 60 * 1000);

    const buttons = document.querySelectorAll('.theme-toggle');
    if (!buttons.length) return;
    const syncBtns = () => {
      const isDark = root.getAttribute('data-theme') === 'dark';
      buttons.forEach(b => {
        b.setAttribute('aria-pressed', String(isDark));
        b.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      });
    };
    syncBtns();
    buttons.forEach(b => b.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      fadeTo(next);
      setMode(next);
      syncBtns();
    }));
  })();

  /* ---------- Booking modal (Cal.com iframe, opened by any [data-book]) ---------- */
  (function () {
    const modal = document.getElementById('bookModal');
    const iframe = document.getElementById('bookIframe');
    const closeBtn = document.getElementById('bookClose');
    if (!modal || !iframe || !closeBtn) return;
    const url = modal.getAttribute('data-cal-url');
    const open = e => {
      if (e) e.preventDefault();
      const themed = url + (url.includes('?') ? '&' : '?') + 'theme=' + (document.documentElement.getAttribute('data-theme') || 'light');
      if (iframe.src === 'about:blank' || !iframe.src.startsWith(url)) iframe.src = themed;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('is-no-scroll');
    };
    const close = () => {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-no-scroll');
    };
    document.querySelectorAll('[data-book]').forEach(el => el.addEventListener('click', open));
    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('is-open')) close(); });
  })();

  /* ---------- Cookie consent ---------- */
  (function () {
    const banner = document.getElementById('cookieBanner');
    if (!banner) return;
    if (!localStorage.getItem('s4-cookies')) setTimeout(() => banner.classList.add('is-open'), 800);
    const dismiss = choice => {
      localStorage.setItem('s4-cookies', choice);
      banner.classList.remove('is-open');
    };
    const accept = document.getElementById('cookieAccept');
    const reject = document.getElementById('cookieReject');
    if (accept) accept.addEventListener('click', () => dismiss('accepted'));
    if (reject) reject.addEventListener('click', () => dismiss('essential'));
  })();

  /* ---------- Asterisk cursor follower (desktop only) ---------- */
  (function () {
    if (matchMedia('(hover:none)').matches || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const dot = document.getElementById('cursorAst');
    if (!dot) return;
    let mx = -100, my = -100, x = -100, y = -100, rot = 0;
    document.addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      dot.classList.add('is-active');
      dot.classList.toggle('is-pointer', !!e.target.closest('a,button,.svc__row,.qa__row,.vcard,.pcard__cta,.wcard,.iphone,.iphone__deck,[role="button"]'));
      dot.classList.toggle('is-on-dark', !!e.target.closest('.cta,.lead__card,.footer,.iphone__screen'));
    }, { passive: true });
    document.addEventListener('mouseleave', () => dot.classList.remove('is-active'));
    const tick = () => {
      x += (mx - x) * 0.18;
      y += (my - y) * 0.18;
      rot += 0.4;
      dot.style.transform = 'translate3d(' + (x - 18) + 'px,' + (y - 18) + 'px,0) rotate(' + rot + 'deg)';
      requestAnimationFrame(tick);
    };
    tick();
  })();

  /* ---------- Seamless marquees ---------- */
  [['logoTrack', '.strip__logos'], ['svcBandTrack', '.svc-band__list']].forEach(([id, sel]) => {
    const track = document.getElementById(id);
    if (!track) return;
    const set = track.querySelector(sel);
    if (set) track.appendChild(set.cloneNode(true));
  });

  /* ---------- Accordions ---------- */
  document.querySelectorAll('.svc').forEach(el => {
    const row = el.querySelector('.svc__row');
    if (!row) return;
    row.addEventListener('click', () => {
      const wasOpen = el.classList.contains('is-open');
      el.closest('.services__list').querySelectorAll('.svc').forEach(s => s.classList.remove('is-open'));
      if (!wasOpen) el.classList.add('is-open');
    });
  });
  document.querySelectorAll('.qa').forEach(el => {
    const row = el.querySelector('.qa__row');
    if (row) row.addEventListener('click', () => el.classList.toggle('is-open'));
  });

  /* ---------- YouTube client-story cards ---------- */
  document.querySelectorAll('.vcard[data-yt]').forEach(card => {
    const play = () => {
      if (card.classList.contains('is-playing')) return;
      const iframe = document.createElement('iframe');
      iframe.className = 'vcard__iframe';
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + card.getAttribute('data-yt') + '?autoplay=1&rel=0';
      iframe.title = 'Client story';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      card.appendChild(iframe);
      card.classList.add('is-playing');
    };
    card.addEventListener('click', play);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
  });

  /* ---------- Vertical video deck (short-form showcase) ---------- */
  (function () {
    const deck = document.getElementById('reelDeck');
    const dotsWrap = document.getElementById('reelDots');
    const btn = document.getElementById('reelMute');
    if (!deck || !dotsWrap || !btn) return;
    const videos = Array.from(deck.querySelectorAll('video'));
    const dots = Array.from(dotsWrap.querySelectorAll('button'));
    let muted = true;

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const v = e.target;
        if (e.intersectionRatio > 0.6) v.play().catch(() => {});
        else { v.pause(); v.currentTime = 0; }
      });
    }, { root: deck, threshold: [0, 0.6, 1] });
    videos.forEach(v => io.observe(v));

    videos.forEach(v => v.addEventListener('click', () => { if (v.paused) v.play().catch(() => {}); else v.pause(); }));

    const goTo = i => {
      const idx = Math.max(0, Math.min(videos.length - 1, i));
      deck.scrollTo({ left: idx * deck.clientWidth, behavior: 'smooth' });
    };
    dots.forEach(d => d.addEventListener('click', () => goTo(parseInt(d.dataset.i, 10))));

    const prev = document.getElementById('reelPrev');
    const next = document.getElementById('reelNext');
    if (prev) prev.addEventListener('click', () => goTo(Math.round(deck.scrollLeft / deck.clientWidth) - 1));
    if (next) next.addEventListener('click', () => goTo(Math.round(deck.scrollLeft / deck.clientWidth) + 1));

    let raf = 0;
    const updateNav = () => {
      const i = Math.round(deck.scrollLeft / deck.clientWidth);
      dots.forEach((d, idx) => d.classList.toggle('is-active', idx === i));
      if (prev) prev.disabled = i <= 0;
      if (next) next.disabled = i >= videos.length - 1;
    };
    deck.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateNav);
    }, { passive: true });
    updateNav();

    btn.addEventListener('click', () => {
      muted = !muted;
      videos.forEach(v => { v.muted = muted; });
      btn.classList.toggle('is-unmuted', !muted);
      btn.setAttribute('aria-pressed', String(!muted));
      btn.setAttribute('aria-label', muted ? 'Unmute videos' : 'Mute videos');
      if (!muted) {
        const i = Math.round(deck.scrollLeft / deck.clientWidth);
        if (videos[i]) videos[i].play().catch(() => {});
      }
    });
  })();

  /* ---------- Featured film carousel (manifest driven) ---------- */
  (function () {
    const track = document.getElementById('galTrack');
    if (!track) return;
    const prev = document.getElementById('galPrev');
    const next = document.getElementById('galNext');
    const mute = document.getElementById('galMute');
    const posEl = document.getElementById('galPos');
    const totalEl = document.getElementById('galTotal');
    let muted = true, inView = false;

    const cards = () => Array.from(track.querySelectorAll('.gal-card'));
    const videos = () => Array.from(track.querySelectorAll('.gal-card video'));

    const setActive = i => {
      const cs = cards();
      i = Math.max(0, Math.min(cs.length - 1, i));
      cs.forEach((c, idx) => c.classList.toggle('is-active', idx === i));
      if (posEl) posEl.textContent = i + 1;
      if (prev) prev.disabled = i <= 0;
      if (next) next.disabled = i >= cs.length - 1;
    };
    const goTo = i => {
      const c = cards()[i];
      if (!c) return;
      track.scrollTo({ left: Math.max(0, c.offsetLeft + c.offsetWidth / 2 - track.clientWidth / 2), behavior: 'smooth' });
    };

    const render = data => {
      if (totalEl) totalEl.textContent = data.length;
      track.innerHTML = data.map((it, i) => {
        const eager = i < 2;
        const srcAttr = eager ? 'src="' + it.src + '"' : '';
        return '<article class="gal-card" data-aspect="' + (it.aspect || '16x9') + '" data-i="' + i + '">' +
          '<div class="gal-card__caption"><span class="client">' + (it.client || '') + '</span><span>' + (it.title || '') + '</span></div>' +
          '<span class="gal-card__hint"><span class="pulse"></span>Now playing</span>' +
          '<img class="gal-card__poster" src="' + it.poster + '" alt="' + (it.alt || '') + '" loading="lazy" />' +
          '<video preload="' + (eager ? 'auto' : 'metadata') + '" playsinline muted loop controls poster="' + it.poster + '" ' + srcAttr + ' data-src="' + it.src + '"></video>' +
          '</article>';
      }).join('');
      bind();
    };

    const bind = () => {
      cards().forEach(c => c.addEventListener('click', e => {
        const v = c.querySelector('video');
        if (v && e.target === v && e.clientY > v.getBoundingClientRect().bottom - 50) return;
        goTo(parseInt(c.dataset.i, 10));
      }));

      let raf = 0;
      track.addEventListener('scroll', () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const cs = cards();
          const centre = track.scrollLeft + track.clientWidth / 2;
          let best = 0, bestDist = Infinity;
          cs.forEach((c, idx) => {
            const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - centre);
            if (dist < bestDist) { bestDist = dist; best = idx; }
          });
          videos().forEach((v, idx) => {
            const distance = Math.abs(idx - best);
            if (idx === best) {
              if (!v.src && v.dataset.src) v.src = v.dataset.src;
              v.preload = 'auto';
              v.muted = muted;
              if (inView) v.play().catch(() => {}); else v.pause();
            } else if (distance === 1) {
              if (!v.src && v.dataset.src) v.src = v.dataset.src;
              v.preload = 'auto';
              v.pause();
            } else {
              v.pause();
              if (v.src) v.preload = 'metadata';
            }
          });
          setActive(best);
        });
      }, { passive: true });

      let isDown = false, startX = 0, startScroll = 0, moved = 0;
      track.addEventListener('mousedown', e => {
        if (e.target.tagName === 'VIDEO' && e.clientY > e.target.getBoundingClientRect().bottom - 50) return;
        isDown = true; moved = 0;
        startX = e.clientX; startScroll = track.scrollLeft;
        track.style.scrollSnapType = 'none';
        track.style.scrollBehavior = 'auto';
      });
      window.addEventListener('mousemove', e => {
        if (!isDown) return;
        moved = Math.abs(e.clientX - startX);
        track.scrollLeft = startScroll - (e.clientX - startX);
      });
      window.addEventListener('mouseup', () => {
        if (!isDown) return;
        isDown = false;
        track.style.scrollSnapType = '';
        track.style.scrollBehavior = '';
        if (moved > 30) {
          const dir = track.scrollLeft > startScroll ? 1 : -1;
          goTo(cards().findIndex(c => c.classList.contains('is-active')) + dir);
        }
      });

      if (prev) prev.addEventListener('click', () => goTo(cards().findIndex(c => c.classList.contains('is-active')) - 1));
      if (next) next.addEventListener('click', () => goTo(cards().findIndex(c => c.classList.contains('is-active')) + 1));

      setActive(0);
      setTimeout(() => track.dispatchEvent(new Event('scroll')), 100);
    };

    const setMuteUI = m => {
      if (!mute) return;
      const off = mute.querySelector('.icon-off');
      const on = mute.querySelector('.icon-on');
      mute.classList.toggle('is-on', !m);
      mute.setAttribute('aria-pressed', String(!m));
      mute.setAttribute('aria-label', m ? 'Unmute videos' : 'Mute videos');
      if (off && on) { off.style.display = m ? '' : 'none'; on.style.display = m ? 'none' : ''; }
    };
    if (mute) mute.addEventListener('click', () => {
      muted = !muted;
      videos().forEach(v => { v.muted = muted; });
      setMuteUI(muted);
      if (!muted) {
        const v = videos()[cards().findIndex(c => c.classList.contains('is-active'))];
        if (v) v.play().catch(() => {});
      }
    });

    const sectionEl = track.closest('section');
    if (sectionEl && 'IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        entries.forEach(e => {
          inView = e.isIntersecting;
          if (!inView) {
            videos().forEach(v => v.pause());
            if (!muted) { muted = true; videos().forEach(v => { v.muted = true; }); setMuteUI(true); }
          } else {
            const v = videos()[cards().findIndex(c => c.classList.contains('is-active'))];
            if (v) { v.muted = muted; v.play().catch(() => {}); }
          }
        });
      }, { threshold: 0.15 }).observe(sectionEl);
    }

    fetch('/video_content/gallery/manifest.json', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(render)
      .catch(() => { track.innerHTML = '<div class="gal__loading">Films are loading. Please refresh in a moment.</div>'; });
  })();

  /* ---------- In-page smooth scrolling ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    if (a.hasAttribute('data-book')) return;
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      const nav = document.querySelector('.nav');
      const top = t.getBoundingClientRect().top + window.scrollY - ((nav ? nav.getBoundingClientRect().height : 0) + 8);
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* ---------- /contact keeps working as a clean URL on the home page ---------- */
  (function () {
    const path = (window.location.pathname || '').replace(/\/$/, '');
    if (path !== '/contact') return;
    const el = document.getElementById('contact');
    if (!el) return;
    requestAnimationFrame(() => {
      const nav = document.querySelector('.nav');
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - ((nav ? nav.getBoundingClientRect().height : 0) + 8) });
    });
  })();

  /* ---------- Reveal on scroll ---------- */
  (function () {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -80px 0px', threshold: 0.1 });
    document.querySelectorAll('section, .strip').forEach(el => { el.classList.add('reveal'); io.observe(el); });
  })();
})();

/* ------------------------------------------------------------------ overlay
   One overlay, borrowed by whatever needs it. Injected rather than repeated
   in the markup of every page. */
(function () {
  'use strict';

  let ovl, panel, lastFocus;

  const build = () => {
    if (ovl) return ovl;
    ovl = document.createElement('div');
    ovl.className = 'ovl';
    ovl.setAttribute('role', 'dialog');
    ovl.setAttribute('aria-modal', 'true');
    ovl.innerHTML =
      '<span class="ovl__veil" data-ovl-close></span>' +
      '<div class="ovl__panel">' +
        '<button class="ovl__close" type="button" data-ovl-close aria-label="Close">&times;</button>' +
        '<div class="ovl__body"></div>' +
      '</div>';
    document.body.appendChild(ovl);
    panel = ovl.querySelector('.ovl__body');
    ovl.addEventListener('click', e => { if (e.target.closest('[data-ovl-close]')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ovl.classList.contains('is-open')) close(); });
    return ovl;
  };

  const open = (html, label) => {
    build();
    lastFocus = document.activeElement;
    panel.innerHTML = html;
    ovl.setAttribute('aria-label', label || 'Dialog');
    ovl.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const first = panel.querySelector('input, button, textarea');
    if (first) setTimeout(() => first.focus(), 60);
  };

  const close = () => {
    if (!ovl) return;
    ovl.classList.remove('is-open');
    panel.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  window.s4Overlay = { open, close };

  /* ----------------------------------------------------- quick enquiry form
     Three fields and a send. Anything longer belongs on the contact section. */
  const FORM =
    '<h2>Tell us what you need</h2>' +
    '<p>The basics are enough. We come back within one working day.</p>' +
    '<form class="qform" novalidate>' +
      '<input type="text" name="Name" placeholder="Your name" required autocomplete="name" />' +
      '<input type="email" name="Email" placeholder="Email address" required autocomplete="email" />' +
      '<textarea name="Message" placeholder="What do you need content for?"></textarea>' +
      '<input type="text" name="_honey" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />' +
      '<button type="submit"><span>Send</span><span class="arrow">&rarr;</span></button>' +
      '<p class="qform__note">No newsletter, no list. Just a reply.</p>' +
    '</form>';

  const quickForm = source => {
    open(FORM, 'Quick enquiry');
    const form = panel.querySelector('.qform');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (form._honey.value) return;                       // bot
      if (!form.Name.value.trim() || !form.Email.checkValidity()) {
        (form.Name.value.trim() ? form.Email : form.Name).focus();
        return;
      }
      const btn = form.querySelector('button');
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Sending';
      try {
        await fetch('https://formsubmit.co/ajax/earl@s4digi.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            _subject: 'Quick enquiry from ' + (source || 'the site'),
            _template: 'table',
            _captcha: 'false',
            Name: form.Name.value.trim(),
            Email: form.Email.value.trim(),
            Message: form.Message.value.trim(),
            Page: location.pathname
          })
        });
        panel.innerHTML =
          '<div class="qform__done"><strong>Thanks, that is with us.</strong>' +
          '<p>We come back within one working day with a clear next step.</p></div>';
      } catch (err) {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Send';
        form.insertAdjacentHTML('beforeend',
          '<p class="qform__note" style="color:#e5484d">That did not send. Email us at earl@s4digi.com and we will pick it up.</p>');
      }
    });
  };

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-quickform]');
    if (!t) return;
    e.preventDefault();
    quickForm(t.getAttribute('data-quickform') || document.title);
  });

  /* ---------------------------------------------------------- minesweeper
     Two boards, easy and hard. The first click is always safe: mines are laid
     after it, avoiding that cell and its neighbours. Winning times are kept in
     the browser, five per board, filed under three initials. */
  const MS_LEVELS = [
    { key: 'easy', label: 'Easy', note: '9 by 9, 10 mines',   w: 9,  h: 9,  mines: 10 },
    { key: 'hard', label: 'Hard', note: '16 by 16, 40 mines', w: 16, h: 16, mines: 40 }
  ];
  const MS_KEY = 's4-minesweeper-scores';
  const MS_NAME_KEY = 's4-minesweeper-initials';
  const MS_TOP = 5;

  const msClock = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const msInitials = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);

  /* Read is defensive on purpose: it is user editable storage, so anything odd
     in there is dropped rather than trusted. Initials are stripped to letters
     and digits, which is also what makes them safe to write as markup. */
  const msScores = () => {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(MS_KEY)) || {}; } catch (err) { raw = {}; }
    const out = {};
    MS_LEVELS.forEach(l => {
      out[l.key] = (Array.isArray(raw[l.key]) ? raw[l.key] : [])
        .filter(r => r && typeof r.secs === 'number' && isFinite(r.secs) && r.secs >= 0)
        .map(r => ({ name: msInitials(r.name) || 'YOU', secs: Math.round(r.secs), at: String(r.at || '').slice(0, 10) }))
        .sort((a, b) => a.secs - b.secs)
        .slice(0, MS_TOP);
    });
    return out;
  };

  const msStore = all => {
    try { localStorage.setItem(MS_KEY, JSON.stringify(all)); return true; } catch (err) { return false; }
  };

  const minesweeper = () => {
    open(
      '<h2>Minesweeper</h2>' +
      '<p>Clear every square that is not a mine. Left click to clear, right click to flag.</p>' +
      '<div class="ms" id="msRoot">' +
        '<div class="ms__levels" role="group" aria-label="Difficulty">' +
          MS_LEVELS.map((l, i) =>
            '<button class="ms__lvl' + (i ? '' : ' is-on') + '" type="button" data-lvl="' + l.key + '"' +
              ' aria-pressed="' + (i ? 'false' : 'true') + '">' +
              '<strong>' + l.label + '</strong><span>' + l.note + '</span>' +
            '</button>').join('') +
        '</div>' +
        '<div class="ms__bar">' +
          '<span class="ms__count" id="msLeft"><span class="ast"></span>10</span>' +
          '<button class="ms__reset" id="msReset" type="button" aria-label="New game">&#8635;</button>' +
          '<span class="ms__count" id="msTime">0:00</span>' +
        '</div>' +
        '<div class="ms__board"><div class="ms__grid" id="msGrid"></div></div>' +
        '<p class="ms__msg" id="msMsg"></p>' +
        '<form class="ms__save" id="msSave" hidden>' +
          '<label for="msName">That is a top five time. Put your initials to it.</label>' +
          '<div class="ms__saverow">' +
            '<input id="msName" type="text" maxlength="3" inputmode="latin" autocomplete="off" ' +
              'spellcheck="false" placeholder="ABC" aria-label="Your initials" />' +
            '<button type="submit">Save</button>' +
          '</div>' +
        '</form>' +
        '<p class="ms__hint">On a phone, press and hold to flag.</p>' +
        '<button class="ms__link" id="msShow" type="button">Best times</button>' +
      '</div>' +
      '<div class="ms__scores" id="msScores" hidden></div>', 'Minesweeper');

    const root   = panel.querySelector('#msRoot');
    const grid   = panel.querySelector('#msGrid');
    const left   = panel.querySelector('#msLeft');
    const time   = panel.querySelector('#msTime');
    const msg    = panel.querySelector('#msMsg');
    const saveEl = panel.querySelector('#msSave');
    const nameEl = panel.querySelector('#msName');
    const scores = panel.querySelector('#msScores');

    let level = MS_LEVELS[0];
    let W = level.w, H = level.h, MINES = level.mines;
    let cells, started, over, flags, timer, secs;

    const idx = (x, y) => y * W + x;
    const near = (x, y) => {
      const out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) out.push(idx(nx, ny));
      }
      return out;
    };

    const reset = () => {
      cells = Array.from({ length: W * H }, () => ({ mine: false, open: false, flag: false, n: 0 }));
      started = false; over = false; flags = 0; secs = 0;
      clearInterval(timer);
      time.textContent = '0:00';
      msg.textContent = ''; msg.className = 'ms__msg';
      saveEl.hidden = true;
      left.innerHTML = '<span class="ast"></span>' + MINES;
      grid.style.setProperty('--ms-cols', W);
      grid.innerHTML = cells.map((_, i) =>
        '<button class="ms__c" type="button" data-i="' + i + '" aria-label="Cell"></button>').join('');
    };

    const lay = safe => {
      const banned = new Set([safe, ...near(safe % W, Math.floor(safe / W))]);
      const pool = cells.map((_, i) => i).filter(i => !banned.has(i));
      for (let k = 0; k < MINES && pool.length; k++) {
        const p = Math.floor(Math.random() * pool.length);
        cells[pool[p]].mine = true;
        pool.splice(p, 1);
      }
      cells.forEach((c, i) => {
        c.n = near(i % W, Math.floor(i / W)).filter(j => cells[j].mine).length;
      });
    };

    const tick = () => {
      timer = setInterval(() => {
        if (!grid.isConnected) return clearInterval(timer);   // overlay closed under us
        secs++;
        time.textContent = msClock(secs);
      }, 1000);
    };

    const paint = i => {
      const c = cells[i], el = grid.children[i];
      el.classList.toggle('is-flag', c.flag && !c.open);
      el.classList.toggle('is-open', c.open);
      if (c.open && c.mine) { el.classList.add('is-mine'); el.textContent = ''; return; }
      if (c.open && c.n) { el.textContent = c.n; el.dataset.n = c.n; }
      else if (c.open) el.textContent = '';
    };

    const flood = start => {
      const q = [start];
      while (q.length) {
        const i = q.pop(), c = cells[i];
        if (c.open || c.flag) continue;
        c.open = true; paint(i);
        if (!c.n) near(i % W, Math.floor(i / W)).forEach(j => { if (!cells[j].open) q.push(j); });
      }
    };

    /* ------------------------------------------------------------- scores */

    const qualifies = t => {
      const rows = msScores()[level.key];
      return rows.length < MS_TOP || t < rows[rows.length - 1].secs;
    };

    const showScores = mark => {
      const all = msScores();
      scores.innerHTML =
        '<h3 class="ms__scoresh">Best times</h3>' +
        MS_LEVELS.map(l => {
          const rows = all[l.key];
          return '<div class="ms__table">' +
            '<h4>' + l.label + '<span>' + l.note + '</span></h4>' +
            (rows.length
              ? '<ol>' + rows.map((r, i) => {
                  const isNew = mark && mark.key === l.key && mark.name === r.name && mark.secs === r.secs;
                  return '<li' + (isNew ? ' class="is-new"' : '') + '>' +
                    '<span class="ms__pos">' + (i + 1) + '</span>' +
                    '<span class="ms__who">' + r.name + '</span>' +
                    '<span class="ms__secs">' + msClock(r.secs) + '</span>' +
                  '</li>';
                }).join('') + '</ol>'
              : '<p class="ms__empty">Nothing here yet. Go and win one.</p>') +
          '</div>';
        }).join('') +
        '<div class="ms__scoresfoot">' +
          '<button class="ms__back" id="msBack" type="button">Back to the game</button>' +
          '<button class="ms__link" id="msClear" type="button">Clear the board</button>' +
        '</div>';

      scores.querySelector('#msBack').addEventListener('click', () => view('game'));

      // Two taps to wipe, because one tap on a leaderboard is a bad afternoon.
      const clear = scores.querySelector('#msClear');
      let armed = false;
      clear.addEventListener('click', () => {
        if (!armed) { armed = true; clear.textContent = 'Tap again to wipe them'; clear.classList.add('is-armed'); return; }
        msStore({});
        showScores();
      });
    };

    const view = (which, mark) => {
      const onScores = which === 'scores';
      if (onScores) showScores(mark);
      root.hidden = onScores;
      scores.hidden = !onScores;
    };

    const record = t => {
      const name = msInitials(nameEl.value) || 'YOU';
      const all = msScores();
      const row = { name: name, secs: t, at: new Date().toISOString().slice(0, 10) };
      all[level.key] = all[level.key].concat([row]).sort((a, b) => a.secs - b.secs).slice(0, MS_TOP);
      if (!msStore(all)) {
        msg.textContent = 'Your browser will not let us save that time';
        msg.className = 'ms__msg lose';
        saveEl.hidden = true;
        return;
      }
      try { localStorage.setItem(MS_NAME_KEY, name); } catch (err) { /* private mode, no matter */ }
      saveEl.hidden = true;
      view('scores', { key: level.key, name: name, secs: t });
    };

    const finish = won => {
      over = true; clearInterval(timer);
      if (!won) cells.forEach((c, i) => { if (c.mine) { c.open = true; paint(i); } });
      msg.textContent = won ? 'Cleared it in ' + msClock(secs) : 'That was a mine';
      msg.className = 'ms__msg ' + (won ? 'win' : 'lose');
      if (!won || !qualifies(secs)) return;

      const t = secs;                                   // the time this form is for
      saveEl.hidden = false;
      saveEl.onsubmit = e => { e.preventDefault(); record(t); };
      try { nameEl.value = localStorage.getItem(MS_NAME_KEY) || ''; } catch (err) { nameEl.value = ''; }
      setTimeout(() => { nameEl.focus(); nameEl.select(); }, 40);
    };

    const check = () => {
      if (cells.every(c => c.mine || c.open)) finish(true);
    };

    const reveal = i => {
      if (over || cells[i].open || cells[i].flag) return;
      if (!started) { started = true; lay(i); tick(); }
      if (cells[i].mine) { cells[i].open = true; paint(i); return finish(false); }
      flood(i); check();
    };

    const flag = i => {
      if (over || cells[i].open) return;
      cells[i].flag = !cells[i].flag;
      flags += cells[i].flag ? 1 : -1;
      left.innerHTML = '<span class="ast"></span>' + Math.max(0, MINES - flags);
      paint(i);
    };

    grid.addEventListener('click', e => {
      const b = e.target.closest('.ms__c'); if (b) reveal(+b.dataset.i);
    });
    grid.addEventListener('contextmenu', e => {
      const b = e.target.closest('.ms__c'); if (!b) return;
      e.preventDefault(); flag(+b.dataset.i);
    });

    // press and hold on touch
    let held;
    grid.addEventListener('touchstart', e => {
      const b = e.target.closest('.ms__c'); if (!b) return;
      held = setTimeout(() => { flag(+b.dataset.i); held = null; }, 420);
    }, { passive: true });
    grid.addEventListener('touchend', () => { if (held) clearTimeout(held); });
    grid.addEventListener('touchmove', () => { if (held) { clearTimeout(held); held = null; } });

    panel.querySelector('#msReset').addEventListener('click', reset);
    panel.querySelector('#msShow').addEventListener('click', () => view('scores'));

    nameEl.addEventListener('input', () => { nameEl.value = msInitials(nameEl.value); });

    panel.querySelector('.ms__levels').addEventListener('click', e => {
      const b = e.target.closest('.ms__lvl'); if (!b) return;
      const next = MS_LEVELS.filter(l => l.key === b.dataset.lvl)[0];
      if (!next || next.key === level.key) return;
      level = next; W = level.w; H = level.h; MINES = level.mines;
      panel.querySelectorAll('.ms__lvl').forEach(x => {
        const on = x === b;
        x.classList.toggle('is-on', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      root.classList.toggle('is-dense', W > 12);
      reset();
    });

    reset();
  };

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-minesweeper]');
    if (!t) return;
    e.preventDefault();
    minesweeper();
  });
})();
