// Theme: auto by default, fades between modes based on local time of day. Manual click locks the choice.
(function(){
  const root = document.documentElement;
  const legacy = localStorage.getItem('s4-theme');
  if (legacy && !localStorage.getItem('s4-theme-mode')) { localStorage.setItem('s4-theme-mode', legacy); localStorage.removeItem('s4-theme'); }
  const getMode = () => localStorage.getItem('s4-theme-mode') || 'auto';
  const setMode = (m) => localStorage.setItem('s4-theme-mode', m);
  const SUN = [[8.0,16.25],[7.5,17.0],[6.5,18.0],[6.25,19.83],[5.5,20.5],[4.75,21.25],[5.0,21.25],[5.75,20.5],[6.5,19.5],[7.25,18.5],[7.5,16.5],[8.0,16.0]];
  const isDarkHours = (d = new Date()) => { const [r,s] = SUN[d.getMonth()]; const h = d.getHours()+d.getMinutes()/60; return h<r||h>=s; };
  const fadeTo = (theme) => { if (root.getAttribute('data-theme') === theme) return; root.classList.add('is-themeing'); root.setAttribute('data-theme', theme); setTimeout(() => root.classList.remove('is-themeing'), 700); };
  const mode = getMode();
  if (mode === 'auto') root.setAttribute('data-theme', isDarkHours() ? 'dark' : 'light'); else root.setAttribute('data-theme', mode);
  setInterval(() => { if (getMode() === 'auto') fadeTo(isDarkHours() ? 'dark' : 'light'); }, 5*60*1000);
  document.querySelectorAll('.theme-toggle').forEach(b => b.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    fadeTo(next); setMode(next);
  }));
})();

// Mobile menu drawer
(function(){
  const burger = document.getElementById('navBurger');
  const menu = document.getElementById('mnav');
  const closeBtn = document.getElementById('mnavClose');
  if (!burger || !menu || !closeBtn) return;
  const open = () => { menu.classList.add('is-open'); document.body.classList.add('is-no-scroll'); };
  const close = () => { menu.classList.remove('is-open'); document.body.classList.remove('is-no-scroll'); };
  burger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  menu.querySelectorAll('[data-mnav-link]').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) close(); });
})();

// Year stamp
const yearEl = document.getElementById('year'); if (yearEl) yearEl.textContent = new Date().getFullYear();
