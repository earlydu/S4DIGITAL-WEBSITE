// The shell: sign in, theme, lock, global search and keyboard shortcuts.
// Routing lives in nav.js so the views can reach it without loading a second
// copy of this module. See the note at the top of that file.

import { api, state, onSignedOut, loadSettings } from './api.js';
import { $, $$, esc, toast, closeModal, closeDrawer, drawerOpen } from './ui.js';
import { go, routeFromUrl, refreshFollowUpDot } from './nav.js';

let idleTimer = null;

window.addEventListener('popstate', () => go(routeFromUrl(), { push: false }));

/* -------------------------------------------------------------- gate flow */

const show = which => {
  for (const id of ['gate', 'setup', 'lock', 'app']) $(`#${id}`).hidden = id !== which;
};

async function boot() {
  let status;
  try {
    status = await api('status');
  } catch (err) {
    document.body.innerHTML =
      `<div class="empty" style="padding-top:120px"><h3>The sales area is not available</h3><p>${esc(err.message)}</p></div>`;
    return;
  }

  state.driver = status.driver;
  state.durable = status.durable;
  state.today = status.today;

  if (!status.hasUsers) { show('setup'); return; }
  if (!status.signedIn) { show('gate'); return; }

  state.user = status.user;
  await startApp();
}

async function startApp() {
  show('app');
  if (!state.durable) {
    const n = $('#notice');
    n.innerHTML = '<b>Nothing will save.</b> This deployment has no database configured, so the CRM is running on a temporary one. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';
    n.hidden = false;
  }
  try { await loadSettings(); } catch { /* the view will report it */ }
  await go(routeFromUrl(), { push: false });
  refreshFollowUpDot();
  armIdleLock();
}

setInterval(refreshFollowUpDot, 60 * 60 * 1000);

/* ------------------------------------------------------------------ forms */

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginForm .gate__go');
  const err = $('#gateErr');
  err.textContent = '';
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  try {
    const out = await api('login', { email: $('#email').value, password: $('#password').value });
    state.user = out.user;
    $('#password').value = '';
    await startApp();
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('#setupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#setupErr');
  err.textContent = '';
  try {
    const out = await api('bootstrap', {
      setupKey: $('#sKey').value,
      email: $('#sEmail').value,
      name: $('#sName').value,
      password: $('#sPass').value,
      pin: $('#sPin').value || null,
    });
    state.user = out.user;
    await startApp();
    toast('Account created. You are signed in.', 'good');
  } catch (ex) {
    err.textContent = ex.message;
  }
});

/* ------------------------------------------------------------------ theme */

/**
 * Three states, deliberately: an explicit choice wins, and with no choice the
 * system preference decides and keeps deciding. Cycling goes
 * system -> light -> dark -> system so you can get back to following the OS.
 */
const THEME_KEY = 's4crm-theme';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'system';
}

function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
    try { localStorage.removeItem(THEME_KEY); } catch { /* private mode */ }
  } else {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  }
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const showing = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  $('#themeToggle').title = theme === 'system'
    ? `Following your system (${showing}). Click for light.`
    : `${showing[0].toUpperCase()}${showing.slice(1)} mode. Click for ${theme === 'light' ? 'dark' : 'system'}.`;
}

export function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(currentTheme() === 'system' ? 'system' : currentTheme()) + 1) % order.length];
  applyTheme(next);
  toast(next === 'system' ? 'Following your system theme' : `${next[0].toUpperCase()}${next.slice(1)} mode`);
}

$('#themeToggle').addEventListener('click', cycleTheme);
applyTheme(currentTheme());

/* ------------------------------------------------------------------- lock */

function lockScreen() {
  if (!state.user) return;
  if (!state.user.hasPin) return;          // nothing to unlock with
  closeModal();
  closeDrawer();
  $('#lockWho').textContent = `${state.user.name || state.user.email}. Enter your PIN.`;
  $('#pin').value = '';
  show('lock');
  setTimeout(() => $('#pin').focus(), 50);
}

$('#lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#lockErr');
  err.textContent = '';
  try {
    await api('unlock', { pin: $('#pin').value });
    show('app');
    armIdleLock();
  } catch (ex) {
    err.textContent = ex.message;
    $('#pin').value = '';
  }
});

$('#lockOut').addEventListener('click', () => signOut());
$('#lockNow').addEventListener('click', () => {
  if (state.user && state.user.hasPin) lockScreen();
  else toast('Set a PIN in Settings to use the lock screen.');
});

/** Locks after the idle window from Settings, but only if a PIN exists. */
function armIdleLock() {
  clearTimeout(idleTimer);
  if (!state.user || !state.user.hasPin) return;
  const minutes = state.user.lockMinutes || 30;
  idleTimer = setTimeout(lockScreen, minutes * 60 * 1000);
}
['pointerdown', 'keydown', 'wheel'].forEach(ev =>
  document.addEventListener(ev, () => { if (!$('#app').hidden) armIdleLock(); }, { passive: true }));

/* --------------------------------------------------------------- sign out */

export async function signOut() {
  try { await api('logout'); } catch { /* going anyway */ }
  state.user = null;
  state.settings = null;
  location.href = '/crm';
}
$('#signOut').addEventListener('click', signOut);

onSignedOut(() => {
  state.user = null;
  show('gate');
  $('#gateErr').textContent = 'Your session ended. Please sign in again.';
});

/* ---------------------------------------------------------------- tabs */

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (b) go(b.dataset.view);
});
$('#burger').addEventListener('click', () => $('#tabs').classList.toggle('is-open'));

/* -------------------------------------------------------- global search */

const searchBox = $('#globalSearch');
const searchOut = $('#searchOut');
let searchTimer = null;
let searchIndex = -1;

searchBox.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchBox.value.trim();
  if (q.length < 2) { searchOut.hidden = true; return; }
  searchTimer = setTimeout(async () => {
    try {
      const { items } = await api('search', { q });
      searchIndex = -1;
      if (!items.length) {
        searchOut.innerHTML = '<p class="find__none">Nothing matches that.</p>';
      } else {
        searchOut.innerHTML = items.map(c => `
          <button class="find__row" data-id="${esc(c.id)}">
            <b>${esc(c.name)}</b>
            <span>${[c.contact && [c.contact.first_name, c.contact.last_name].filter(Boolean).join(' '),
                     c.location, c.main_phone, c.stage].filter(Boolean).map(esc).join(' &middot; ')}</span>
          </button>`).join('');
      }
      searchOut.hidden = false;
    } catch (err) { toast(err.message, 'bad'); }
  }, 180);
});

searchBox.addEventListener('keydown', e => {
  const rows = $$('.find__row', searchOut);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    searchIndex = Math.max(0, Math.min(rows.length - 1, searchIndex + (e.key === 'ArrowDown' ? 1 : -1)));
    rows.forEach((r, i) => r.classList.toggle('is-on', i === searchIndex));
    return;
  }
  if (e.key === 'Enter' && rows[searchIndex]) { e.preventDefault(); rows[searchIndex].click(); }
  if (e.key === 'Escape') { searchOut.hidden = true; searchBox.blur(); }
});

searchOut.addEventListener('click', async e => {
  const b = e.target.closest('.find__row');
  if (!b) return;
  searchOut.hidden = true;
  searchBox.value = '';
  const { openProspect } = await import('./record.js');
  openProspect(b.dataset.id);
});

document.addEventListener('click', e => {
  if (!e.target.closest('.find')) searchOut.hidden = true;
});

/* ------------------------------------------------------ keyboard shortcuts */

document.addEventListener('keydown', e => {
  if ($('#app').hidden) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

  if (e.key === '/' && !typing) { e.preventDefault(); searchBox.focus(); return; }
  if (e.key.toLowerCase() === 'l' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); lockScreen(); return; }
  if (e.key.toLowerCase() === 'j' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cycleTheme(); return; }
  if (e.key === 'Escape' && !typing && drawerOpen()) { closeDrawer(); return; }

  // g then a letter jumps between screens, the way most tools do it.
  if (!typing && e.key === 'g') {
    const once = ev => {
      const map = { d: 'dashboard', t: 'today', p: 'pipeline', r: 'prospects', f: 'followups', i: 'import', s: 'settings' };
      if (map[ev.key]) { ev.preventDefault(); go(map[ev.key]); }
      document.removeEventListener('keydown', once, true);
    };
    document.addEventListener('keydown', once, true);
    setTimeout(() => document.removeEventListener('keydown', once, true), 1200);
  }
});

boot();
