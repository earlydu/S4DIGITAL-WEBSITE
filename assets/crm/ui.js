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
    el.style.transform = 'translateY(-6px)';
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

const STAGE_TONE = {
  'New Lead': '', 'To Call': '', 'Reached Out': '',
  Engaged: 'b', 'Follow Up': 'warn', Qualified: 'green',
  'Meeting Booked': 'purple', 'Offer Made': 'purple',
  'Client Won': 'green', 'Not Now': 'red',
};

export const stageBadge = stage => {
  const k = STAGE_TONE[stage];
  return `<span class="badge${k ? ' badge--' + k : ''}">${esc(stage || 'New Lead')}</span>`;
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

/* ------------------------------------------------------------- channels */

/**
 * The little row of icons that says, at a glance, how you can reach this
 * company. A filled icon is a live link; a faded one is a gap in the research,
 * which is useful information in itself when you are deciding who to call.
 */
const CHANNEL_ICONS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
  website: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
  linkedin: '<path d="M4.5 9.5h3v10h-3z"/><circle cx="6" cy="5.5" r="1.8"/><path d="M10.5 19.5v-10h3v1.4a3.4 3.4 0 0 1 3-1.6c2.2 0 3.5 1.4 3.5 4v6.2h-3V14c0-1.3-.5-2.1-1.7-2.1s-1.8.8-1.8 2.1v5.5z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/>',
  facebook: '<path d="M14 8.5V7c0-.8.4-1.2 1.3-1.2H17V3h-2.4C11.8 3 11 4.4 11 6.7v1.8H9V11h2v10h3V11h2.2l.4-2.5z"/>',
};

const CHANNEL_LABEL = {
  phone: 'Phone', email: 'Email', website: 'Website',
  linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook',
};

/** Works for a company row from any screen, with or without contacts attached. */
export function channelsOf(company) {
  const c = company || {};
  const contact = c.contact || {};
  return [
    { key: 'phone', href: (contact.direct_phone || c.main_phone) ? telHref(contact.direct_phone || c.main_phone) : '', title: contact.direct_phone || c.main_phone || '' },
    { key: 'email', href: (contact.direct_email || c.general_email) ? `mailto:${contact.direct_email || c.general_email}` : '', title: contact.direct_email || c.general_email || '' },
    { key: 'website', href: safeUrl(c.website), title: c.website || '' },
    { key: 'linkedin', href: safeUrl(contact.linkedin || c.linkedin_company), title: contact.linkedin || c.linkedin_company || '' },
    { key: 'instagram', href: safeUrl(c.instagram), title: c.instagram || '' },
    { key: 'facebook', href: safeUrl(c.facebook), title: c.facebook || '' },
  ];
}

/**
 * @param {object} opts
 * @param {boolean} opts.showMissing  render faded placeholders for what is absent
 * @param {boolean} opts.links        make present channels clickable
 */
export function channelIcons(company, { showMissing = true, links = true } = {}) {
  const items = channelsOf(company).filter(ch => ch.href || showMissing);
  if (!items.length) return '';
  return `<span class="chans">${items.map(ch => {
    const label = `${CHANNEL_LABEL[ch.key]}${ch.title ? ': ' + ch.title : ' not on file'}`;
    const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${CHANNEL_ICONS[ch.key]}</svg>`;
    if (!ch.href) return `<span class="chan is-off" title="${esc(label)}" aria-hidden="true">${svg}</span>`;
    if (!links) return `<span class="chan" title="${esc(label)}">${svg}</span>`;
    const external = ch.key !== 'phone' && ch.key !== 'email';
    return `<a class="chan" href="${ch.href}" title="${esc(label)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${svg}</a>`;
  }).join('')}</span>`;
}

/** How many ways there are to reach them. Used for sorting and for the call card. */
export const channelCount = company => channelsOf(company).filter(c => c.href).length;
