// Today, and calling mode.
//
// This screen is the whole point of the CRM, so it is built around one loop:
// see the prospect, dial, hit an outcome, next prospect. Everything else on the
// screen exists only to make that loop faster.

import { api, state, loadSettings } from './api.js';
import {
  $, $$, esc, safeUrl, telHref, toast, initials, humanDate, humanStamp, ago,
  qualityBadge, stageBadge, fill, loading, empty, confirmBox,
} from './ui.js';
import { followUpModal, meetingModal, emailModal } from './dialogs.js';
import { refreshFollowUpDot } from './app.js';

let queue = null;
let at = 0;              // index into queue.items
let calling = false;
let settings = null;
let root = null;
let recorder = null;
let lastTranscript = '';

/* ------------------------------------------------------------- outcome set */

const BUTTONS = [
  { key: 'no_answer', label: 'No Answer', kbd: '1', cls: 'ob--miss' },
  { key: 'gatekeeper', label: 'Gatekeeper', kbd: '2', cls: 'ob--miss' },
  { key: 'decision_maker', label: 'Spoke to DM', kbd: '3', cls: 'ob--good' },
  { key: 'follow_up', label: 'Follow Up', kbd: '4', cls: 'ob--hot' },
  { key: 'meeting_booked', label: 'Meeting Booked', kbd: '5', cls: 'ob--win' },
];

const MORE = [
  { key: 'qualified', label: 'Qualified' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'not_interested', label: 'Not Interested' },
  { key: 'wrong_number', label: 'Wrong Number' },
];

/* -------------------------------------------------------------- lifecycle */

export async function render(host) {
  root = host;
  settings = await loadSettings();
  host.innerHTML = loading('Building your call list');
  queue = await api('queue');
  calling = false;
  at = firstPending();
  paint();
  document.addEventListener('keydown', onKey);
}

export function leave() {
  document.removeEventListener('keydown', onKey);
  stopRecording(true);
}

const firstPending = () => {
  const i = queue.items.findIndex(x => x.status === 'pending');
  return i < 0 ? 0 : i;
};

const pendingCount = () => queue.items.filter(x => x.status === 'pending').length;

/* ------------------------------------------------------------------ paint */

function paint() {
  if (!queue.items.length) { root.innerHTML = noQueue(); wireStart(); return; }
  if (!calling) { root.innerHTML = startScreen(); wireStart(); return; }
  root.innerHTML = callScreen();
  wireCall();
}

function noQueue() {
  return `
    <div class="head"><div><h1>Today</h1><p>${esc(humanDate(queue.day))}</p></div></div>
    ${empty(
      'Nothing to call',
      'There are no prospects ready to dial. Import a list, or check that your prospects have phone numbers and are not all parked.',
      '<button class="btn btn--ghost" data-goto="import">Import prospects</button>')}`;
}

function startScreen() {
  const done = queue.items.filter(x => x.status === 'done').length;
  const total = queue.items.length;
  const target = settings.targets.daily;
  const left = pendingCount();
  const reasons = queue.items.reduce((m, x) => {
    m[x.reason] = (m[x.reason] || 0) + 1;
    return m;
  }, {});

  return `
    <div class="head">
      <div><h1>Today</h1><p>${esc(humanDate(queue.day))} &middot; target ${target} calls</p></div>
      <div class="head__acts">
        <button class="btn btn--ghost btn--sm" data-rebuild>Rebuild list</button>
      </div>
    </div>

    <div class="start">
      <div>
        <h2>${left ? 'Ready when you are.' : 'That is the list done.'}</h2>
        <p>${left
          ? `${left} ${left === 1 ? 'prospect' : 'prospects'} left. Follow-ups first, then retries, then the best new leads. Hit start and work straight down.`
          : 'Every prospect on today\'s list has an outcome logged. Rebuild the list if you want more.'}</p>
        ${left ? '<button class="btn btn--orange btn--xl" data-start style="margin-top:22px">START CALLING</button>' : ''}
      </div>
      <div style="text-align:right">
        <div class="start__n">${done}<small> / ${total}</small></div>
        <div class="meter" style="width:200px;margin-left:auto">
          <i class="${done >= total ? 'is-full' : ''}" style="width:${total ? (done / total) * 100 : 0}%"></i>
        </div>
      </div>
    </div>

    <h2 class="sec">What is on the list</h2>
    <div class="stats">
      ${tile('Follow-ups due', reasons.follow_up || 0, 'Called first, always')}
      ${tile('No-answer retries', reasons.no_answer || 0, 'Retry date has come round')}
      ${tile('Gatekeeper retries', reasons.gatekeeper || 0, '')}
      ${tile('Spoke before', reasons.contacted || 0, '')}
      ${tile('New prospects', reasons.new || 0, 'Best rated first')}
    </div>

    <h2 class="sec">The list</h2>
    <div class="rows">
      ${queue.items.slice(0, 100).map(listRow).join('')}
    </div>`;
}

const tile = (k, v, sub) => `
  <div class="stat">
    <div class="stat__k">${esc(k)}</div>
    <div class="stat__v num">${v}</div>
    ${sub ? `<div class="stat__sub">${esc(sub)}</div>` : ''}
  </div>`;

function listRow(item) {
  const c = item.company;
  const who = c.contact ? [c.contact.first_name, c.contact.last_name].filter(Boolean).join(' ') : '';
  const statusBadge = item.status === 'done'
    ? '<span class="badge badge--green">Done</span>'
    : item.status === 'skipped' ? '<span class="badge">Skipped</span>' : '';
  return `
    <div class="row" data-jump="${item.position}">
      <div class="row__m">
        <div class="row__n">${item.position}. ${esc(c.name)}</div>
        <div class="row__s">
          <span>${esc(item.reasonLabel)}</span>
          ${who ? `<span>&middot; ${esc(who)}</span>` : c.askFor ? `<span>&middot; ask for ${esc(c.askFor)}</span>` : ''}
          ${c.location ? `<span>&middot; ${esc(c.location)}</span>` : ''}
        </div>
      </div>
      <div class="row__r">
        <span class="row__tel num">${esc(c.main_phone || '')}</span>
        ${qualityBadge(c.lead_quality)}
        ${statusBadge}
      </div>
    </div>`;
}

/* -------------------------------------------------------------- call card */

function callScreen() {
  const item = queue.items[at];
  if (!item) return doneScreen();
  const c = item.company;
  const contact = c.contact;
  const done = queue.items.filter(x => x.status === 'done').length;
  const total = queue.items.length;

  const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : '';
  const ctx = { company: c, contact, profile: settings.profile };
  const aiOn = state.meta && state.meta.ai && state.meta.ai.transcribe && state.meta.ai.transcribe.enabled;

  return `
    <div class="callbar">
      <span class="callbar__pos num">${item.position} <small>of ${total}</small></span>
      <div class="meter"><i class="${done >= total ? 'is-full' : ''}" style="width:${(done / total) * 100}%"></i></div>
      <span class="badge">${esc(item.reasonLabel)}</span>
      <div class="callbar__nav">
        <button class="btn btn--ghost btn--sm" data-prev title="Previous">&larr; Previous</button>
        <button class="btn btn--ghost btn--sm" data-skip title="Skip (S)">Skip</button>
        <button class="btn btn--ghost btn--sm" data-next title="Next">Next &rarr;</button>
        <button class="btn btn--ghost btn--sm" data-stop>Stop</button>
      </div>
    </div>

    <div class="callwrap">
      <div>
        <article class="pc">
          <div class="pc__top">
            <div class="pc__why">
              <div>
                <h2>${esc(c.name)}</h2>
                <div class="pc__meta">
                  ${qualityBadge(c.lead_quality)}
                  ${stageBadge(c.stage)}
                  ${c.sector ? `<span class="chip">${esc(c.sector)}${c.sub_sector ? ' · ' + esc(c.sub_sector) : ''}</span>` : ''}
                  ${c.location ? `<span class="chip">${esc(c.location)}${c.postcode ? ' ' + esc(c.postcode) : ''}</span>` : ''}
                  ${c.segment ? `<span class="chip">${esc(c.segment)}</span>` : ''}
                  ${c.excluded ? '<span class="badge badge--red">Excluded</span>' : ''}
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${link(c.website, 'Website')}
                ${link(c.linkedin_company, 'LinkedIn')}
                ${link(c.instagram, 'Instagram')}
                ${link(c.facebook, 'Facebook')}
                <button class="btn btn--ghost btn--sm" data-open>Full record</button>
              </div>
            </div>
          </div>

          <div class="pc__body">
            <div class="phone">
              ${c.main_phone ? `
                <a class="tel" href="${telHref(c.main_phone)}" data-dial>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
                  <span><span class="tel__k">Main line</span><span class="tel__v num">${esc(c.main_phone)}</span></span>
                </a>` : '<div class="why why--empty"><h3>No phone number</h3><p>Add one from the full record.</p></div>'}
              ${contact && contact.direct_phone ? `
                <a class="tel tel--alt" href="${telHref(contact.direct_phone)}" data-dial>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>
                  <span><span class="tel__k">Direct${name ? ' · ' + esc(name.split(' ')[0]) : ''}</span><span class="tel__v num">${esc(contact.direct_phone)}</span></span>
                </a>` : ''}
            </div>

            ${c.marketing_opportunity
              ? `<div class="why"><h3>Why call them</h3><p>${esc(c.marketing_opportunity)}</p></div>`
              : `<div class="why why--empty"><h3>Why call them</h3><p>Nothing researched yet. Lead with what they do and ask how they currently market it.</p></div>`}

            <div class="who">
              <div class="who__av">${name ? esc(initials(contact.first_name, contact.last_name)) : '?'}</div>
              <div>
                <div class="who__n">${name ? esc(name) : `Ask for: ${esc(c.askFor || 'the Managing Director')}`}</div>
                <div class="who__t">${contact && contact.job_title ? esc(contact.job_title) : (name ? '' : 'No named contact researched')}</div>
              </div>
              <div class="who__links">
                ${contact && contact.direct_email ? `<a class="chip" href="mailto:${esc(contact.direct_email)}">${esc(contact.direct_email)}</a>` : ''}
                ${!contact?.direct_email && c.general_email ? `<a class="chip" href="mailto:${esc(c.general_email)}">${esc(c.general_email)}</a>` : ''}
                ${link(contact && contact.linkedin, 'Profile')}
                <button class="btn btn--ghost btn--sm" data-email>Email</button>
              </div>
            </div>

            <dl class="facts">
              ${fact('Key services', c.key_services)}
              ${fact('Areas served', c.areas_served)}
              ${fact('Employees', c.employees ? `~${c.employees}` : '')}
              ${fact('Trading', c.years_trading ? `${c.years_trading} years${c.founded ? ` (since ${c.founded})` : ''}` : '')}
              ${fact('Google', c.google_rating ? `${c.google_rating} from ${c.google_reviews || 0} reviews` : '')}
              ${fact('Established by', c.established_evidence, true)}
              ${fact('Attempts', String(c.attempts || 0))}
              ${fact('Last contacted', c.last_contacted_at ? ago(c.last_contacted_at) : 'never')}
            </dl>

            ${c.notes ? `<div class="prev"><h3>Notes</h3><p style="font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(c.notes)}</p></div>` : ''}
            <div class="prev" id="prevWrap"><h3>Previous activity</h3><ul id="prevList"><li>Loading…</li></ul></div>
          </div>
        </article>

        <div class="out">
          <div class="out__note">
            <input id="note" type="text" placeholder="Quick note - what happened?" autocomplete="off" />
            <button class="btn btn--ghost btn--sm" id="dictate" title="Dictate the note">Dictate</button>
          </div>
          <div class="out__grid">
            ${BUTTONS.map(b => `
              <button class="ob ${b.cls}" data-outcome="${b.key}">
                <kbd>${b.kbd}</kbd>${esc(b.label)}
              </button>`).join('')}
          </div>
          <div class="out__more">
            ${MORE.map(b => `<button class="btn btn--ghost btn--sm" data-outcome="${b.key}">${esc(b.label)}</button>`).join('')}
            ${aiOn ? '<button class="btn btn--ghost btn--sm" id="rec" style="margin-left:auto">● Record call</button>' : ''}
          </div>
        </div>
      </div>

      <aside class="rail">
        <div class="panel">
          <button class="panel__h" data-toggle="script">Call script <span>▾</span></button>
          <div class="panel__b" id="script">
            <p class="said"><em>Opener</em>${esc(fill(name ? settings.script.opener : settings.script.noName, ctx))}</p>
            <p class="said"><em>If they answer</em>${esc(fill(settings.script.decisionMaker, ctx))}</p>
            ${c.marketing_opportunity ? `<p class="said"><em>Then</em>${esc(c.marketing_opportunity)}</p>` : ''}
            <p class="said"><em>Gatekeeper</em>${esc(fill(settings.script.gatekeeper, ctx))}</p>
          </div>
        </div>

        <div class="panel">
          <button class="panel__h" data-toggle="next">Coming up <span>▾</span></button>
          <div class="panel__b" id="next">
            ${queue.items.slice(at + 1, at + 6).map(i => `
              <div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--line)">
                <b>${i.position}. ${esc(i.company.name)}</b><br>
                <span style="color:var(--muted)">${esc(i.reasonLabel)}</span>
              </div>`).join('') || '<p style="color:var(--muted);font-size:13px">Nothing after this one.</p>'}
          </div>
        </div>
      </aside>
    </div>`;
}

const fact = (k, v, soft = false) => (v
  ? `<div><dt>${esc(k)}</dt><dd class="${soft ? 'soft' : ''}">${esc(v)}</dd></div>` : '');

const link = (url, label) => {
  const u = safeUrl(url);
  return u ? `<a class="chip" href="${u}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';
};

function doneScreen() {
  const done = queue.items.filter(x => x.status === 'done').length;
  return `
    <div class="head"><div><h1>List finished</h1><p>${done} calls logged today.</p></div></div>
    ${empty('That is the list',
      'Every prospect has an outcome. Rebuild the list to pull more in, or take a look at the dashboard.',
      '<button class="btn btn--ghost" data-rebuild>Rebuild list</button> <button class="btn" data-goto="dashboard">Dashboard</button>')}`;
}

/* ------------------------------------------------------------------ wiring */

function wireStart() {
  const start = $('[data-start]', root);
  if (start) start.onclick = () => { calling = true; at = firstPending(); paint(); };

  const rebuild = $('[data-rebuild]', root);
  if (rebuild) {
    rebuild.onclick = async () => {
      rebuild.disabled = true;
      try {
        queue = await api('queue-build');
        toast(`${queue.items.length} on the list`, 'good');
        paint();
      } catch (err) { toast(err.message, 'bad'); rebuild.disabled = false; }
    };
  }

  $$('[data-goto]', root).forEach(b => {
    b.onclick = async () => { (await import('./app.js')).go(b.dataset.goto); };
  });

  $$('[data-jump]', root).forEach(r => {
    r.onclick = () => {
      const pos = Number(r.dataset.jump);
      const i = queue.items.findIndex(x => x.position === pos);
      if (i < 0) return;
      at = i;
      calling = true;
      paint();
    };
  });
}

function wireCall() {
  const item = queue.items[at];
  if (!item) { wireStart(); return; }
  const c = item.company;

  $('[data-stop]', root).onclick = () => { calling = false; stopRecording(true); paint(); };
  $('[data-prev]', root).onclick = () => { if (at > 0) { at -= 1; paint(); } };
  $('[data-next]', root).onclick = () => advance();
  $('[data-skip]', root).onclick = () => skip();

  $('[data-open]', root).onclick = async () => {
    const { openProspect } = await import('./record.js');
    openProspect(c.id, { onSaved: refresh });
  };

  $('[data-email]', root).onclick = () =>
    emailModal({ company: c, contact: c.contact, transcript: lastTranscript });

  $$('[data-toggle]', root).forEach(b => {
    b.onclick = () => {
      const body = $(`#${b.dataset.toggle}`, root);
      body.hidden = !body.hidden;
      b.querySelector('span').textContent = body.hidden ? '▸' : '▾';
    };
  });

  $$('[data-outcome]', root).forEach(b => {
    b.onclick = () => submit(b.dataset.outcome);
  });

  const dictate = $('#dictate', root);
  if (dictate) dictate.onclick = () => startDictation();

  const rec = $('#rec', root);
  if (rec) rec.onclick = () => (recorder ? stopRecording() : startRecording());

  loadPrevious(c.id);
  const note = $('#note', root);
  if (note) setTimeout(() => note.focus({ preventScroll: true }), 40);
}

async function loadPrevious(companyId) {
  const list = $('#prevList', root);
  if (!list) return;
  try {
    const { activities } = await api('prospect', { id: companyId });
    if (!activities.length) {
      $('#prevWrap', root).hidden = true;
      return;
    }
    list.innerHTML = activities.slice(0, 8).map(a => `
      <li>
        <time>${esc(humanStamp(a.occurred_at))}</time>
        <span><b>${esc(a.detail || a.type)}</b>${a.note ? ` - ${esc(a.note)}` : ''}</span>
      </li>`).join('');
  } catch {
    list.innerHTML = '<li>Could not load the history.</li>';
  }
}

/* ---------------------------------------------------------------- actions */

function noteValue() {
  const el = $('#note', root);
  return el ? el.value.trim() : '';
}

async function submit(outcome) {
  const item = queue.items[at];
  if (!item) return;
  const c = item.company;
  const note = noteValue();

  let followUp = null;
  let meeting = null;

  if (outcome === 'follow_up') {
    followUp = await followUpModal({ company: c, defaultNote: note });
    if (!followUp) return;                       // cancelled, so nothing is logged
  }
  if (outcome === 'meeting_booked') {
    meeting = await meetingModal({ company: c });
    if (!meeting) meeting = null;                // skipping the detail is fine
  }
  if (outcome === 'not_interested' || outcome === 'lost' || outcome === 'won') {
    const labels = { not_interested: 'Not interested', lost: 'Lost', won: 'Won' };
    const yes = await confirmBox({
      title: `Mark ${c.name} as ${labels[outcome]}?`,
      body: outcome === 'won'
        ? 'They come out of the calling queue and into Won. Their history stays.'
        : 'They come out of the calling queue. Their history stays and you can bring them back later.',
      confirm: labels[outcome],
      danger: outcome !== 'won',
    });
    if (!yes) return;
  }

  const buttons = $$('[data-outcome]', root);
  buttons.forEach(b => { b.disabled = true; });

  try {
    stopRecording(true);
    await api('outcome', {
      companyId: c.id,
      contactId: c.contact ? c.contact.id : null,
      outcome, note, followUp, meeting,
      transcript: lastTranscript || null,
    });
    item.status = 'done';
    lastTranscript = '';

    if (outcome === 'decision_maker') {
      // The brief asks to be prompted rather than left in limbo.
      const fu = await followUpModal({
        company: c,
        defaultNote: note,
        title: 'You spoke to them. What next?',
      });
      if (fu) {
        await api('followup-create', { companyId: c.id, contactId: c.contact ? c.contact.id : null, ...fu });
      }
    }

    toast(`${c.name}: ${outcome.replace(/_/g, ' ')}`, 'good');
    refreshFollowUpDot();
    advance();
  } catch (err) {
    toast(err.message, 'bad');
    buttons.forEach(b => { b.disabled = false; });
  }
}

async function skip() {
  const item = queue.items[at];
  if (!item) return;
  try {
    await api('skip', { companyId: item.company.id });
    item.status = 'skipped';
    toast('Skipped. It comes back tomorrow.');
  } catch (err) { toast(err.message, 'bad'); }
  advance();
}

function advance() {
  stopRecording(true);
  const next = queue.items.findIndex((x, i) => i > at && x.status === 'pending');
  if (next >= 0) { at = next; paint(); return; }
  const any = queue.items.findIndex(x => x.status === 'pending');
  if (any >= 0) { at = any; paint(); return; }
  calling = false;
  root.innerHTML = doneScreen();
  wireStart();
}

async function refresh() {
  queue = await api('queue');
  paint();
}

/* -------------------------------------------------------------- shortcuts */

function onKey(e) {
  if (!calling) return;
  if (!$('#modal').hidden || !$('#drawer').hidden) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

  // Numbers work even while the note field has focus, because that is where
  // your hands already are. Everything else needs the field to be empty.
  if (/^[1-5]$/.test(e.key) && (!typing || e.target.id === 'note')) {
    if (typing && noteValue()) return;           // typing "1" into a real note
    e.preventDefault();
    const b = BUTTONS[Number(e.key) - 1];
    if (b) submit(b.key);
    return;
  }
  if (typing) return;

  if (e.key.toLowerCase() === 's') { e.preventDefault(); skip(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); advance(); }
  if (e.key === 'ArrowLeft' && at > 0) { e.preventDefault(); at -= 1; paint(); }
  if (e.key === 'Escape') { calling = false; paint(); }
}

/* ------------------------------------------------------ dictation, free */

function startDictation() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const note = $('#note', root);
  if (!Rec) { toast('This browser has no built-in dictation. Chrome and Edge do.', 'bad'); return; }
  const r = new Rec();
  r.lang = 'en-GB';
  r.interimResults = true;
  r.continuous = false;
  const before = note.value;
  const btn = $('#dictate', root);
  btn.textContent = 'Listening…';
  r.onresult = ev => {
    const text = [...ev.results].map(x => x[0].transcript).join('');
    note.value = (before ? before + ' ' : '') + text;
  };
  r.onerror = () => toast('Dictation stopped.', 'bad');
  r.onend = () => { btn.textContent = 'Dictate'; note.focus(); };
  r.start();
}

/* -------------------------------------------------- recording, costs money */

async function startRecording() {
  const btn = $('#rec', root);
  const notice = (state.meta && state.meta.ai && state.meta.ai.notice) || '';
  const yes = await confirmBox({
    title: 'Record this call?',
    body: `${notice} Recording uses your microphone, so it captures your side of the room. The audio is sent for transcription and is not stored afterwards.`,
    confirm: 'Start recording',
  });
  if (!yes) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const mr = new MediaRecorder(stream, { mimeType: pickMime() });
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: mr.mimeType });
      recorder = null;
      if (btn) { btn.textContent = '● Record call'; btn.classList.remove('btn--danger'); }
      if (blob.size < 8000) return;                      // a stray click, not a call
      await transcribeBlob(blob);
    };
    mr.start();
    recorder = mr;
    if (btn) { btn.textContent = '■ Stop and transcribe'; btn.classList.add('btn--danger'); }
  } catch {
    toast('No microphone access.', 'bad');
  }
}

const pickMime = () => {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
};

function stopRecording(silent = false) {
  if (!recorder) return;
  if (silent) {
    // Dropping the recording rather than paying to transcribe a half call.
    recorder.onstop = () => recorder && recorder.stream && recorder.stream.getTracks().forEach(t => t.stop());
  }
  try { recorder.stop(); } catch { /* already stopped */ }
  if (silent) recorder = null;
}

async function transcribeBlob(blob) {
  toast('Transcribing…');
  try {
    const base64 = await blobToBase64(blob);
    const out = await api('ai-transcribe', { audio: base64, mimeType: blob.type });
    lastTranscript = out.text || '';
    const note = $('#note', root);
    if (note && !note.value && lastTranscript) {
      try {
        const sum = await api('ai-summarise', {
          transcript: lastTranscript,
          companyId: queue.items[at].company.id,
        });
        note.value = sum.notes.replace(/\n/g, ' ').replace(/^- /, '').slice(0, 300);
      } catch {
        note.value = lastTranscript.slice(0, 240);
      }
    }
    toast('Transcript ready. It saves with your outcome.', 'good');
  } catch (err) {
    toast(err.message, 'bad');
  }
}

const blobToBase64 = blob => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(',')[1]);
  fr.onerror = reject;
  fr.readAsDataURL(blob);
});
