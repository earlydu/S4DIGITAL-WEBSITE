// Small helpers shared by every view. No framework, no build step, same as the
// rest of this site. Everything that puts user data into HTML goes through esc().

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = s => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Attribute-safe URL. Anything that is not http(s) or mailto/tel is dropped. */
export const safeUrl = u => {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:)/i.test(s)) return esc(s);
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return esc('https://' + s);
  return '';
};

export const telHref = p => 'tel:' + String(p || '').replace(/[^0-9+]/g, '');

/* -------------------------------------------------------------- toasts */

export function toast(message, kind = '') {
  const wrap = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast${kind ? ' toast--' + kind : ''}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, kind === 'bad' ? 4200 : 2200);
}

/* --------------------------------------------------------------- modal */

let modalResolve = null;

/**
 * Opens a modal. `render` returns HTML; `onMount(root, close)` wires it up.
 * Resolves with whatever close() was called with, or null if dismissed.
 */
export function modal({ html, onMount, wide = false }) {
  const host = $('#modal');
  host.innerHTML = `<div class="modal__c${wide ? ' modal__c--wide' : ''}">${html}</div>`;
  host.hidden = false;

  return new Promise(resolve => {
    modalResolve = resolve;
    const close = value => {
      if (!modalResolve) return;
      const done = modalResolve;
      modalResolve = null;
      host.hidden = true;
      host.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      done(value === undefined ? null : value);
    };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey);
    host.onclick = e => { if (e.target === host) close(null); };
    $$('[data-close]', host).forEach(b => { b.onclick = () => close(null); });
    if (onMount) onMount(host.firstElementChild, close);
    const focus = $('[autofocus], input, textarea, select', host);
    if (focus) setTimeout(() => focus.focus(), 30);
  });
}

export const closeModal = () => { const h = $('#modal'); h.hidden = true; h.innerHTML = ''; modalResolve = null; };

export async function confirmBox({ title, body, confirm = 'Yes', danger = false }) {
  const out = await modal({
    html: `<h2>${esc(title)}</h2><p class="sub">${esc(body)}</p>
      <div class="modal__f">
        <button class="btn btn--ghost" data-close>Cancel</button>
        <button class="btn ${danger ? 'btn--danger' : ''}" data-yes>${esc(confirm)}</button>
      </div>`,
    onMount(root, close) { $('[data-yes]', root).onclick = () => close(true); },
  });
  return out === true;
}

/* -------------------------------------------------------------- drawer */

let drawerClose = null;

export function drawer(html, onMount) {
  const host = $('#drawer');
  const scrim = $('#scrim');
  host.innerHTML = html;
  host.hidden = false;
  scrim.hidden = false;
  document.body.style.overflow = 'hidden';

  const close = () => {
    host.hidden = true;
    scrim.hidden = true;
    host.innerHTML = '';
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    drawerClose = null;
  };
  const onKey = e => { if (e.key === 'Escape' && $('#modal').hidden) close(); };
  document.addEventListener('keydown', onKey);
  scrim.onclick = close;
  drawerClose = close;
  $$('[data-drawer-close]', host).forEach(b => { b.onclick = close; });
  if (onMount) onMount(host, close);
  return close;
}

export const closeDrawer = () => { if (drawerClose) drawerClose(); };
export const drawerOpen = () => Boolean(drawerClose);

/* ------------------------------------------------------------- formats */

export const money = n => {
  const v = Number(n || 0);
  if (!v) return '£0';
  return '£' + Math.round(v).toLocaleString('en-GB');
};

export const pct = n => `${Number(n || 0).toFixed(Number(n) % 1 ? 1 : 0)}%`;

export const initials = (a, b) =>
  `${String(a || '').trim()[0] || ''}${String(b || '').trim()[0] || ''}`.toUpperCase() || '?';

export const dayISO = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Skips Saturday and Sunday. */
export function addWorkingDays(iso, n) {
  let out = iso;
  let left = n;
  while (left > 0) {
    out = addDays(out, 1);
    const dow = new Date(`${out}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return out;
}

export function humanDate(iso) {
  if (!iso) return '';
  const t = dayISO();
  if (iso === t) return 'Today';
  if (iso === addDays(t, 1)) return 'Tomorrow';
  if (iso === addDays(t, -1)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function humanStamp(isoStamp) {
  if (!isoStamp) return '';
  const d = new Date(isoStamp);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function ago(isoStamp) {
  if (!isoStamp) return 'never';
  const ms = Date.now() - new Date(isoStamp).getTime();
  if (Number.isNaN(ms)) return '';
  const d = Math.floor(ms / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 28) return `${d} days ago`;
  const m = Math.floor(d / 30);
  return m < 12 ? `${m} month${m > 1 ? 's' : ''} ago` : `${Math.floor(m / 12)}y ago`;
}

export const qualityBadge = q => {
  const k = String(q || 'C').toUpperCase();
  return `<span class="badge badge--${k.toLowerCase()}" title="${k === 'A' ? 'High priority' : k === 'B' ? 'Good prospect' : 'Lower priority'}">${k}</span>`;
};

export const stageBadge = stage => {
  const map = {
    Won: 'green', Lost: 'red', 'Meeting Booked': 'purple', Proposal: 'purple',
    Qualified: 'green', 'Follow Up': 'warn',
  };
  const k = map[stage];
  return `<span class="badge${k ? ' badge--' + k : ''}">${esc(stage || 'New')}</span>`;
};

/** Merge fields shared by templates and the call script. */
export function fill(text, { company, contact, profile = {}, extra = {} }) {
  const c = contact || {};
  const values = {
    first_name: c.first_name || (company && company.ask_for) || 'there',
    last_name: c.last_name || '',
    full_name: [c.first_name, c.last_name].filter(Boolean).join(' '),
    job_title: c.job_title || '',
    company: (company && company.name) || '',
    location: (company && company.location) || '',
    sector: (company && company.sector) || '',
    marketing_opportunity: (company && company.marketing_opportunity) || '',
    key_services: (company && company.key_services) || '',
    my_name: profile.callerName || 'Earl',
    my_company: profile.company || 'S4Digital',
    signature: profile.signature || '',
    date: humanDate(dayISO()),
    ...extra,
  };
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key) =>
    (values[key] !== undefined ? values[key] : m));
}

/* ------------------------------------------------------------ downloads */

export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
    return true;
  } catch {
    toast('Could not copy. Select the text instead.', 'bad');
    return false;
  }
}

export const loading = (label = 'Loading') =>
  `<div class="loading"><span class="spin spin--dark"></span><br><br>${esc(label)}…</div>`;

export const empty = (title, body, action = '') =>
  `<div class="empty"><h3>${esc(title)}</h3><p>${esc(body)}</p>${action}</div>`;
