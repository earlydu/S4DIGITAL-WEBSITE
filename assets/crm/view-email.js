// Email, and the daily slate.
//
// Sits beside Today rather than replacing it. Today is built for dialling; this
// screen is built for the other way of working: open the draft, send it, move on.
// The CRM stays the source of truth, so nothing here is kept in the browser.
//
// One loop: see who is due, hit Draft, Outlook opens filled in, the note and the
// next follow-up are written automatically.

import { api, state, loadSettings } from './api.js?v=10';
import { esc, safeUrl, toast, humanDate, qualityBadge, loading } from './ui.js?v=10';
import { refreshFollowUpDot } from './nav.js?v=10';

let root = null;
let rows = [];
let dueMap = new Map();      // company_id -> follow-up row
let settings = null;

const TARGET_KEY = 's4-email-target';
const CHASE_DAYS = [4, 7];   // first follow-up, then the second after that

/* Weighted to what earns money, not to activity. A hundred sends is one client. */
const STAGE_POINTS = {
  'Reached Out': 1, 'Engaged': 5, 'Follow Up': 5, 'Qualified': 15,
  'Meeting Booked': 30, 'Offer Made': 30, 'Client Won': 100,
};

const CREATURE = [
  [0, 'Speck', 'a dot with ambition'],
  [25, 'Flicker', 'it has eyes now'],
  [75, 'Lumen', 'up on its feet'],
  [175, 'Beam', 'reaching for things'],
  [350, 'Beacon', 'people can see it coming'],
  [700, 'Floodlight', 'lights the whole room'],
];

// The ask is access, not a sale. No price in any touch: the offer is the free day,
// and naming a number turns a request from a person into a quote from a supplier.
const WHO = "I'm a filmmaker in London, putting together a set of short films about how skilled "
          + 'trade work actually gets done. Not a marketing thing, more of a documentary. '
          + 'One job, start to finish.';

const OFFER = 'Would you let me film one of your jobs for a day? No cost to you, and you keep '
            + 'everything I shoot to use however you want.';
const LEAD_INS = [
  'I looked your company up this week.',
  'I had a look through your site this week.',
  'I was reading through your site earlier.',
];

const target = () => Math.max(1, Number(localStorage.getItem(TARGET_KEY)) || 5);
const emailOf = c => (c.general_email || '').trim();
const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/* ------------------------------------------------------------------ writing */

// Which touch this is, from how far along the prospect already is.
function touchFor(c) {
  const fu = dueMap.get(c.id);
  if (!fu) return 1;
  return fu.note && fu.note.indexOf('second') !== -1 ? 3 : 2;
}

function compose(c, touch) {
  const name = (c.contact_first_name || '').trim();
  const hi = name ? `Hi ${name},` : 'Hi,';
  const sig = (settings && settings.profile && settings.profile.signature) || 'Thanks,\nEarl';
  const obs = (c.marketing_opportunity || '').trim();
  const subject = c.sector ? `Content for a ${c.sector.toLowerCase()} company` : 'Video and photo content';
  const n = Number(String(c.id).replace(/\D/g, '').slice(-2) || 0);

  if (touch === 3) {
    return {
      subject: 'Re: ' + subject,
      body: [hi, '', 'I have not heard back, which is fair enough, you are busy.', '',
        'Should I close the file on this one, or is it worth asking again later in the year?',
        '', 'Either answer is genuinely fine, I would just rather know than keep emailing you.',
        '', sig].join('\n'),
    };
  }
  if (touch === 2) {
    return {
      subject: 'Re: ' + subject,
      body: [hi, '', 'Following up on my last email.', '',
        'Most firms tell me they have nothing worth filming. Then I spend a day on site and '
        + 'we come away with something they end up using for months.', '',
        'Still happy to film one of yours. No cost, and nothing to sign.',
        '', 'Worth a quick 10 minutes?', '', sig].join('\n'),
    };
  }
  return {
    subject,
    body: [hi, '',
      (LEAD_INS[n % LEAD_INS.length] + (obs ? ' ' + obs : '')).trim(), '',
      'I run S4Digital. We shoot photo and video content for businesses like yours.', '',
      OFFER, '',
      'Some of what we have made is here: www.s4digi.com/work', '',
      CLOSERS[n % CLOSERS.length], '', sig].join('\n'),
  };
}

/* ------------------------------------------------------------------ the pet */

function creatureSvg(level, size) {
  const c = size / 2, r = (size * (0.30 + level * 0.10)) / 2, p = [];
  p.push(`<defs><radialGradient id="cg${level}" cx="42%" cy="35%">`
    + `<stop offset="0%" stop-color="var(--brand)" stop-opacity=".95"/>`
    + `<stop offset="100%" stop-color="var(--brand-2, #6B4C7A)" stop-opacity=".9"/></radialGradient></defs>`);
  if (level >= 4) p.push(`<circle cx="${c}" cy="${c}" r="${r * 1.7}" fill="var(--brand)" opacity=".10"/>`);
  if (level >= 2) {
    p.push(`<path d="M${c - r * .5},${c + r * .85} l${-r * .3},${r * .55}" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>`);
    p.push(`<path d="M${c + r * .5},${c + r * .85} l${r * .3},${r * .55}" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>`);
  }
  if (level >= 3) {
    p.push(`<path d="M${c - r},${c + r * .1} q${-r * .55},${-r * .35} ${-r * .5},${-r * .8}" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>`);
    p.push(`<path d="M${c + r},${c + r * .1} q${r * .55},${-r * .35} ${r * .5},${-r * .8}" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>`);
  }
  p.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="url(#cg${level})"/>`);
  if (level >= 1) {
    const ex = r * .34, ey = r * .18, er = Math.max(2.4, r * .13);
    p.push(`<circle cx="${c - ex}" cy="${c - ey}" r="${er}" fill="#0B1116"/>`);
    p.push(`<circle cx="${c + ex}" cy="${c - ey}" r="${er}" fill="#0B1116"/>`);
    p.push(`<line x1="${c}" y1="${c - r}" x2="${c}" y2="${c - r * 1.5}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`);
    p.push(`<circle cx="${c}" cy="${c - r * 1.62}" r="${Math.max(2.5, r * .13)}" fill="var(--brand)"/>`);
  } else {
    p.push(`<circle cx="${c}" cy="${c}" r="${Math.max(2, r * .2)}" fill="#0B1116"/>`);
  }
  if (level >= 5) {
    for (let a = 0; a < 8; a++) {
      const ang = (Math.PI * 2 / 8) * a - Math.PI / 2;
      p.push(`<line x1="${c + Math.cos(ang) * r * 1.25}" y1="${c + Math.sin(ang) * r * 1.25}"`
        + ` x2="${c + Math.cos(ang) * r * 1.6}" y2="${c + Math.sin(ang) * r * 1.6}"`
        + ` stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>`);
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="progress">${p.join('')}</svg>`;
}

const xpTotal = () => rows.reduce((n, c) => n + (STAGE_POINTS[c.stage] || 0), 0);
const levelOf = xp => CREATURE.reduce((best, s, i) => (xp >= s[0] ? i : best), 0);

/* ------------------------------------------------------------------ staging */

function slate() {
  const t = target();
  const due = rows.filter(c => dueMap.has(c.id));
  const fresh = rows.filter(c => !dueMap.has(c.id) && !c.last_contacted_at
    && !['Client Won', 'Not Now'].includes(c.stage));
  return due.concat(fresh.slice(0, Math.max(0, t - due.length)));
}

function bucket() {
  const todayIds = new Set(slate().map(c => c.id));
  const out = { today: [], waiting: [], later: [], won: [], lost: [] };
  rows.forEach(c => {
    if (c.stage === 'Client Won' || c.stage === 'Qualified' || c.stage === 'Meeting Booked'
      || c.stage === 'Offer Made' || c.stage === 'Engaged') out.won.push(c);
    else if (c.stage === 'Not Now') out.lost.push(c);
    else if (todayIds.has(c.id)) out.today.push(c);
    else if (c.last_contacted_at) out.waiting.push(c);
    else out.later.push(c);
  });
  return out;
}

/* -------------------------------------------------------------------- paint */

function rowHtml(c) {
  const touch = touchFor(c);
  const fu = dueMap.get(c.id);
  const label = touch === 1 ? 'Draft email' : `Draft follow-up ${touch - 1}`;
  const stateLine = fu
    ? `<span class="em-state em-state--due">Follow-up due ${esc(humanDate(fu.due_date))}</span>`
    : c.last_contacted_at
      ? `<span class="em-state">Last contacted ${esc(humanDate(c.last_contacted_at.slice(0, 10)))}</span>`
      : '';
  return `<li class="em-row" data-id="${esc(c.id)}">
    <div class="em-main">
      <div class="em-name">${esc(c.name)} ${qualityBadge(c.lead_quality)}</div>
      <div class="em-meta">${esc(c.location || c.postcode || '')} &middot; ${esc(c.sector || '')}
        &middot; <span class="em-to">${esc(emailOf(c))}</span></div>
      ${stateLine}
      ${c.marketing_opportunity ? `<p class="em-obs">${esc(c.marketing_opportunity)}</p>` : ''}
      <div class="em-acts">
        <button class="btn btn--sm btn--primary" data-draft="${esc(c.id)}">${esc(label)}</button>
        <button class="btn btn--sm" data-reply="${esc(c.id)}">Replied</button>
        <button class="btn btn--sm" data-win="${esc(c.id)}">Interested</button>
        <button class="btn btn--sm" data-no="${esc(c.id)}">No thanks</button>
        ${c.website ? `<a class="btn btn--sm" href="${safeUrl(c.website)}" target="_blank" rel="noopener">Site</a>` : ''}
      </div>
    </div>
  </li>`;
}

function paint() {
  const b = bucket();
  const xp = xpTotal(), lvl = levelOf(xp), cur = CREATURE[lvl], nxt = CREATURE[lvl + 1];
  const t = target(), doneToday = rows.filter(c =>
    (c.last_contacted_at || '').slice(0, 10) === state.today).length;

  const stack = (key, title, note) => {
    const list = b[key];
    return `<section class="em-stage"><h3>${esc(title)} <span>${list.length || ''}</span></h3>
      <p class="em-note">${esc(note)}</p>
      ${list.length ? `<ol class="em-list">${list.map(rowHtml).join('')}</ol>`
        : '<p class="em-empty">Nothing here.</p>'}</section>`;
  };

  root.innerHTML = `
    <div class="em-pet">
      <div class="em-pet__art">${creatureSvg(lvl, 118)}</div>
      <div>
        <p class="em-pet__name">${esc(cur[1])}</p>
        <p class="em-pet__sub">${esc(cur[2])}</p>
        <div class="em-xp"><b>${xp}</b>
          <span>${nxt ? `${nxt[0] - xp} more to become ${esc(nxt[1])}` : 'fully grown'}</span></div>
        <div class="em-track"><div class="em-fill" style="width:${nxt
          ? Math.min(100, ((xp - cur[0]) / (nxt[0] - cur[0])) * 100) : 100}%"></div></div>
      </div>
      <div class="em-today">
        <b>${b.today.length}</b><i>to do today</i>
        <div class="em-target">${[3, 5, 10].map(x =>
          `<button class="btn btn--xs" data-target="${x}"${x === t ? ' aria-pressed="true"' : ''}>${x}</button>`).join('')}</div>
        <span class="em-sub">${doneToday} sent today</span>
      </div>
    </div>
    ${stack('today', 'Today', 'Follow-ups first, then the next best names. Clear it and stop.')}
    ${stack('waiting', 'Waiting', 'Sent, no answer yet.')}
    ${stack('won', 'In play', 'Replied or better. Get a date in.')}
    ${stack('later', 'Later', 'Queued behind today.')}
    ${stack('lost', 'Closed', 'Kept so you do not approach them twice.')}
  `;
}

/* ------------------------------------------------------------------ actions */

async function draft(id) {
  const c = rows.find(x => String(x.id) === String(id));
  if (!c) return;
  const to = emailOf(c);
  if (!to) { toast('No email address on this one'); return; }

  const touch = touchFor(c);
  const { subject, body } = compose(c, touch);
  window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`;

  try {
    await api('prospect-note', { companyId: c.id, note: `Emailed (touch ${touch}): ${subject}` });
    await api('prospect-stage', { id: c.id, stage: 'Reached Out' });

    const fu = dueMap.get(c.id);
    if (fu) await api('followup-complete', { id: fu.id, note: `Follow-up ${touch - 1} sent` });

    if (touch < 3) {
      await api('followup-create', {
        companyId: c.id, date: addDays(CHASE_DAYS[touch - 1]), kind: 'email',
        note: touch === 1 ? 'Send follow-up one' : 'Send the second and last follow-up',
      });
    }
    toast(touch === 1 ? 'Logged, follow-up set for ' + humanDate(addDays(CHASE_DAYS[0]))
                      : 'Logged');
    await load();
    refreshFollowUpDot();
  } catch (err) {
    toast('Opened the draft, but could not log it: ' + err.message);
  }
}

async function mark(id, stage, note) {
  try {
    await api('prospect-stage', { id, stage });
    if (note) await api('prospect-note', { companyId: id, note });
    await load();
    refreshFollowUpDot();
  } catch (err) { toast(err.message); }
}

/* ----------------------------------------------------------------- lifecycle */

async function load() {
  const [{ items }, fu] = await Promise.all([
    api('prospects', { size: 200, sort: 'quality' }),
    api('followups').catch(() => ({ items: [] })),
  ]);
  rows = (items || []).filter(c => emailOf(c));
  dueMap = new Map();
  (fu.items || []).forEach(f => {
    if (f.status === 'pending' && f.due_date <= state.today && f.kind === 'email') {
      dueMap.set(f.company_id, f);
    }
  });
  paint();
}

export async function render(host) {
  root = host;
  root.innerHTML = loading('Loading prospects');
  settings = await loadSettings();
  await load();

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.draft) return draft(t.dataset.draft);
    if (t.dataset.reply) return mark(t.dataset.reply, 'Engaged', 'They replied');
    if (t.dataset.win) return mark(t.dataset.win, 'Qualified', 'Interested in a content day');
    if (t.dataset.no) return mark(t.dataset.no, 'Not Now', 'Not interested');
    if (t.dataset.target) { localStorage.setItem(TARGET_KEY, t.dataset.target); paint(); }
  });
}

export function leave() {
  root = null;
  rows = [];
  dueMap = new Map();
}
