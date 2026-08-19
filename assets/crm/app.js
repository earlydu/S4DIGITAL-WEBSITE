// The shell: sign in, theme, lock, global search and keyboard shortcuts.
// Routing lives in nav.js so the views can reach it without loading a second
// copy of this module. See the note at the top of that file.

import { api, state, onSignedOut, loadSettings } from './api.js';
import { $, $$, esc, toast, closeModal, closeDrawer, drawerOpen } from './ui.js';
import { go, routeFromUrl, refreshFollowUpDot } from './nav.js';

let idleTimer = null;

window.addEventListener('popstate', () => go(routeFromUrl(), { push: false }));

/* -------------------------------------------------------------- gate flow */

const SCREENS = ['gate', 'setup', 'lock', 'app', 'forgot', 'reset'];
const show = which => {
  for (const id of SCREENS) $(`#${id}`).hidden = id !== which;
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

  // A reset link lands on /sales/reset?token=… and has to be handled before
  // anything else, because the whole point is that you cannot sign in.
  const token = new URLSearchParams(location.search).get('token');
  if (token && location.pathname.replace(/\/$/, '').endsWith('/reset')) {
    const { valid, email } = await api('reset-check', { token }).catch(() => ({ valid: false }));
    if (valid) {
      resetToken = token;
      $('#resetWho').textContent = `For ${email}. The link stops working once you use it.`;
      show('reset');
      return;
    }
    $('#gateErr').textContent = 'That reset link has expired or has already been used. Ask for a new one.';
  }

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

/* -------------------------------------------------------- password reset */

let resetToken = '';

$('#forgotLink').addEventListener('click', () => {
  $('#fEmail').value = $('#email').value;
  $('#forgotMsg').textContent = '';
  show('forgot');
  setTimeout(() => $('#fEmail').focus(), 40);
});

$('#forgotBack').addEventListener('click', () => show('gate'));

$('#forgotForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#forgotForm .gate__go');
  const msg = $('#forgotMsg');
  msg.style.color = '';
  msg.textContent = '';
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  try {
    const out = await api('forgot', { email: $('#fEmail').value });
    msg.style.color = 'var(--green)';
    msg.textContent = out.message;
  } catch (ex) {
    msg.textContent = ex.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send the link';
  }
});

$('#resetForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#resetErr');
  err.textContent = '';
  const pass = $('#rPass').value;
  if (pass !== $('#rPass2').value) { err.textContent = 'Those two do not match.'; return; }
  try {
    const out = await api('reset', { token: resetToken, password: pass });
    state.user = out.user;
    history.replaceState({}, '', '/sales');
    await startApp();
    toast('Password changed. You are signed in.', 'good');
  } catch (ex) {
    err.textContent = ex.message;
  }
});

/* ------------------------------------------------------------------ theme */

/**
 * Light or dark, and nothing else. Your system preference picks the very first
 * visit and then your own choice sticks, so the button always does the one
 * obvious thing rather than cycling through a third state nobody wanted.
 */
const THEME_KEY = 's4crm-theme';

const currentTheme = () =>
  (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
  $('#themeToggle').title = t === 'dark' ? 'Dark mode. Click for light.' : 'Light mode. Click for dark.';
}

export function cycleTheme() {
  // No toast: the icon and the whole page changing is the feedback.
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
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
  location.href = '/sales';
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
