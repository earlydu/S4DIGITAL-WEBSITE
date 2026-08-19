// The full prospect record, in a side drawer so it opens from anywhere without
// losing your place. Four tabs: details, contacts, sales, and the timeline.

import { api, loadSettings } from './api.js';
import {
  $, $$, esc, safeUrl, telHref, drawer, toast, money, humanDate, humanStamp, ago,
  qualityBadge, stageBadge, confirmBox, initials, loading,
} from './ui.js';
import { followUpModal, opportunityModal, emailModal, meetingModal } from './dialogs.js';

let data = null;
let settings = null;
let tab = 'details';
let onSavedCb = null;

export async function openProspect(id, { onSaved } = {}) {
  onSavedCb = onSaved || null;
  settings = await loadSettings();
  drawer(`<div class="drawer__b">${loading('Opening record')}</div>`);
  try {
    data = await api('prospect', { id });
  } catch (err) {
    drawer(`<div class="drawer__b"><div class="empty"><h3>Could not open that</h3><p>${esc(err.message)}</p></div></div>`);
    return;
  }
  tab = 'details';
  paint();
}

async function reload() {
  data = await api('prospect', { id: data.company.id });
  paint();
  if (onSavedCb) onSavedCb();
}

/* ------------------------------------------------------------------ paint */

function paint() {
  const c = data.company;
  drawer(`
    <div class="drawer__h">
      <div>
        <h2>${esc(c.name)}</h2>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          ${qualityBadge(c.lead_quality)}
          ${stageBadge(c.stage)}
          ${c.excluded ? '<span class="badge badge--red">Excluded</span>' : ''}
          ${c.archived ? '<span class="badge">Archived</span>' : ''}
          ${c.is_seed ? '<span class="badge badge--warn">Sample</span>' : ''}
        </div>
      </div>
      <button class="drawer__x" data-drawer-close aria-label="Close">×</button>
    </div>

    <div class="drawer__tabs">
      ${[['details', 'Details'], ['contacts', `Contacts (${data.contacts.filter(x => !x.archived).length})`],
         ['sales', 'Sales'], ['timeline', `Activity (${data.activities.length})`]]
        .map(([k, label]) => `<button data-tab="${k}" class="${tab === k ? 'is-active' : ''}">${esc(label)}</button>`).join('')}
    </div>

    <div class="drawer__b">${
      tab === 'details' ? detailsTab()
      : tab === 'contacts' ? contactsTab()
      : tab === 'sales' ? salesTab()
      : timelineTab()
    }</div>`, wire);
}

/* ---------------------------------------------------------------- details */

const field = (label, name, value, type = 'text', extra = '') => `
  <div class="field">
    <label for="f_${name}">${esc(label)}</label>
    <input id="f_${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" ${extra} />
  </div>`;

const area = (label, name, value) => `
  <div class="field">
    <label for="f_${name}">${esc(label)}</label>
    <textarea id="f_${name}" name="${name}">${esc(value ?? '')}</textarea>
  </div>`;

const choice = (label, name, value, options) => `
  <div class="field">
    <label for="f_${name}">${esc(label)}</label>
    <select id="f_${name}" name="${name}">
      ${options.map(o => {
        const [v, t] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(v)}"${String(value || '') === String(v) ? ' selected' : ''}>${esc(t)}</option>`;
      }).join('')}
    </select>
  </div>`;

function detailsTab() {
  const c = data.company;
  return `
    <form id="detailsForm">
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          ${c.main_phone ? `<a class="btn btn--sm" href="${telHref(c.main_phone)}">Call ${esc(c.main_phone)}</a>` : ''}
          <button type="button" class="btn btn--ghost btn--sm" data-email>Email</button>
          <button type="button" class="btn btn--ghost btn--sm" data-followup>Follow-up</button>
          <button type="button" class="btn btn--ghost btn--sm" data-callnow>Add to today's list</button>
        </div>
        ${field('Company name', 'name', c.name)}
        <div class="field--row">
          ${choice('Sector', 'sector', c.sector, ['', ...settings.sectors])}
          ${field('Sub-sector', 'sub_sector', c.sub_sector)}
        </div>
        <div class="field--row">
          ${field('Location', 'location', c.location)}
          ${field('Postcode', 'postcode', c.postcode)}
        </div>
        <div class="field--row">
          ${field('Region', 'region', c.region)}
          ${choice('Market', 'segment', c.segment, [['', 'Not set'], ['commercial', 'Commercial'], ['residential', 'Residential'], ['both', 'Both']])}
        </div>
        ${field('Areas served', 'areas_served', c.areas_served)}
      </div>

      <h2 class="sec">Contact routes</h2>
      <div class="card" style="margin-bottom:12px">
        ${field('Main phone', 'main_phone', c.main_phone, 'tel')}
        ${field('General email', 'general_email', c.general_email, 'email')}
        ${field('Website', 'website', c.website, 'url')}
        ${field('LinkedIn (company)', 'linkedin_company', c.linkedin_company, 'url')}
        <div class="field--row">
          ${field('Instagram', 'instagram', c.instagram, 'url')}
          ${field('Facebook', 'facebook', c.facebook, 'url')}
        </div>
      </div>

      <h2 class="sec">Is this an established business</h2>
      <div class="card" style="margin-bottom:12px">
        <div class="field--row">
          ${field('Approx employees', 'employees', c.employees, 'number')}
          ${field('Founded', 'founded', c.founded, 'number')}
          ${field('Years trading', 'years_trading', c.years_trading, 'number')}
        </div>
        <div class="field--row">
          ${field('Google reviews', 'google_reviews', c.google_reviews, 'number')}
          ${field('Google rating', 'google_rating', c.google_rating, 'number', 'step="0.1" max="5"')}
        </div>
        ${area('Key services', 'key_services', c.key_services)}
        ${area('Evidence they are established', 'established_evidence', c.established_evidence)}
      </div>

      <h2 class="sec">The angle</h2>
      <div class="card" style="margin-bottom:12px">
        ${area('Marketing opportunity - why call them', 'marketing_opportunity', c.marketing_opportunity)}
        <div class="field--row">
          ${choice('Lead quality', 'lead_quality', c.lead_quality, [['A', 'A - high priority'], ['B', 'B - good prospect'], ['C', 'C - lower priority']])}
          ${field('Ask for (when no name)', 'ask_for', c.ask_for)}
        </div>
        ${area('Notes', 'notes', c.notes)}
        ${field('Source URLs', 'source_urls', c.source_urls)}
        <div class="field--row">
          ${field('Date verified', 'date_verified', c.date_verified, 'date')}
          ${field('Source', 'source', c.source)}
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px">
        <button type="submit" class="btn">Save changes</button>
        ${c.archived
          ? '<button type="button" class="btn btn--ghost" data-restore>Restore</button><button type="button" class="btn btn--danger" data-delete>Delete permanently</button>'
          : '<button type="button" class="btn btn--ghost" data-archive>Archive</button>'}
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:12px">
        Added ${esc(humanStamp(c.created_at))}${c.updated_at ? `, last changed ${esc(ago(c.updated_at))}` : ''}.
        ${c.exclusion_reason ? `Excluded: ${esc(c.exclusion_reason)}.` : ''}
      </p>
    </form>`;
}

/* --------------------------------------------------------------- contacts */

function contactsTab() {
  const live = data.contacts.filter(c => !c.archived);
  return `
    <div style="margin-bottom:14px">
      <button class="btn btn--sm" data-newcontact>Add a contact</button>
    </div>
    ${live.length ? live.map(contactCard).join('') : `
      <div class="card"><p style="color:var(--muted);font-size:14px;line-height:1.6">
        No named contact yet. Calls will say <b>Ask for: ${esc(data.company.ask_for || 'the Managing Director')}</b>.
        The order worth aiming for is Founder, Owner, Managing Director, Commercial Director,
        then Marketing Director or Head of Marketing at the bigger firms.</p></div>`}`;
}

const contactCard = c => `
  <div class="card" style="margin-bottom:10px" data-contact="${esc(c.id)}">
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
      <div class="who__av">${esc(initials(c.first_name, c.last_name))}</div>
      <div style="flex:1">
        <div class="who__n">${esc([c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed')}</div>
        <div class="who__t">${esc(c.job_title || '')}</div>
      </div>
      ${c.is_primary ? '<span class="badge badge--green">Primary</span>' : '<button class="btn btn--ghost btn--sm" data-primary="' + esc(c.id) + '">Make primary</button>'}
    </div>
    <div class="field--row">
      ${field('First name', `first_name__${c.id}`, c.first_name)}
      ${field('Last name', `last_name__${c.id}`, c.last_name)}
    </div>
    ${field('Job title', `job_title__${c.id}`, c.job_title)}
    <div class="field--row">
      ${field('Direct phone', `direct_phone__${c.id}`, c.direct_phone, 'tel')}
      ${field('Direct email', `direct_email__${c.id}`, c.direct_email, 'email')}
    </div>
    ${field('LinkedIn', `linkedin__${c.id}`, c.linkedin, 'url')}
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn--sm" data-savecontact="${esc(c.id)}">Save contact</button>
      <button class="btn btn--ghost btn--sm" data-archivecontact="${esc(c.id)}">Remove</button>
    </div>
  </div>`;

/* ------------------------------------------------------------------ sales */

function salesTab() {
  const c = data.company;
  const opps = data.opportunities;
  const pending = data.followUps.filter(f => f.status === 'pending');

  return `
    <div class="card" style="margin-bottom:12px">
      <div class="field--row">
        ${choice('Pipeline stage', 'stage', c.stage, settings.stages)}
        ${field('Assigned to', 'assigned_to', c.assigned_to)}
      </div>
      <div class="field--row">
        ${field('Estimated monthly (£)', 'est_mrr', c.est_mrr, 'number')}
        ${field('Estimated one-off (£)', 'est_one_off', c.est_one_off, 'number')}
        ${field('Probability (%)', 'probability', c.probability, 'number')}
      </div>
      <button class="btn btn--sm" data-savesales>Save</button>
    </div>

    <h2 class="sec">Opportunities</h2>
    <div style="margin-bottom:10px"><button class="btn btn--sm btn--ghost" data-newopp>New opportunity</button></div>
    ${opps.length ? opps.map(o => `
      <div class="row" style="cursor:default">
        <div class="row__m">
          <div class="row__n">${esc(o.service)}</div>
          <div class="row__s">
            <span>${money(o.mrr)}/month</span>
            ${o.one_off ? `<span>&middot; ${money(o.one_off)} one-off</span>` : ''}
            ${o.close_date ? `<span>&middot; close ${esc(humanDate(o.close_date))}</span>` : ''}
            <span>&middot; ${esc(o.probability || 0)}%</span>
          </div>
        </div>
        <div class="row__r">
          ${stageBadge(o.stage)}
          <button class="btn btn--ghost btn--sm" data-editopp="${esc(o.id)}">Edit</button>
        </div>
      </div>`).join('') : '<p style="color:var(--muted);font-size:14px">Nothing yet.</p>'}

    <h2 class="sec">Follow-ups</h2>
    <div style="margin-bottom:10px"><button class="btn btn--sm btn--ghost" data-followup>New follow-up</button></div>
    ${pending.length ? pending.map(f => `
      <div class="row" style="cursor:default">
        <div class="row__m">
          <div class="row__n">${esc(humanDate(f.due_date))}${f.due_time ? ' at ' + esc(f.due_time) : ''}</div>
          <div class="row__s"><span>${esc(f.kind)}</span>${f.note ? `<span>&middot; ${esc(f.note)}</span>` : ''}</div>
        </div>
        <div class="row__r">
          <button class="btn btn--ghost btn--sm" data-donefu="${esc(f.id)}">Done</button>
          <button class="btn btn--ghost btn--sm" data-cancelfu="${esc(f.id)}">Cancel</button>
        </div>
      </div>`).join('') : '<p style="color:var(--muted);font-size:14px">None pending.</p>'}

    <h2 class="sec">Meetings</h2>
    <div style="margin-bottom:10px"><button class="btn btn--sm btn--ghost" data-newmeeting>Record a meeting</button></div>
    ${data.meetings.length ? data.meetings.map(m => `
      <div class="row" style="cursor:default">
        <div class="row__m">
          <div class="row__n">${esc(humanDate(m.date))}${m.time ? ' at ' + esc(m.time) : ''}</div>
          <div class="row__s"><span>${esc(m.kind || '')}</span>${m.notes ? `<span>&middot; ${esc(m.notes)}</span>` : ''}</div>
        </div>
      </div>`).join('') : '<p style="color:var(--muted);font-size:14px">None recorded.</p>'}`;
}

/* --------------------------------------------------------------- timeline */

const DOT = {
  no_answer: '', gatekeeper: '', wrong_number: 'bad', not_interested: 'bad', lost: 'bad',
  decision_maker: 'call', follow_up: 'hot', meeting_booked: 'good', won: 'good', qualified: 'good',
};

function timelineTab() {
  if (!data.activities.length) {
    return '<p style="color:var(--muted);font-size:14px">Nothing has happened yet.</p>';
  }
  return `
    <div class="card" style="margin-bottom:16px">
      <div class="field" style="margin:0">
        <label for="newNote">Add a note</label>
        <textarea id="newNote" placeholder="Anything worth remembering"></textarea>
      </div>
      <button class="btn btn--sm" data-addnote style="margin-top:8px">Add note</button>
    </div>
    <ul class="time">
      ${data.activities.map(a => `
        <li>
          <span class="time__d time__d--${DOT[a.outcome] !== undefined ? (DOT[a.outcome] || 'call') : ''}"></span>
          <div class="time__m">
            <div class="time__t">${esc(humanStamp(a.occurred_at))}</div>
            <div class="time__h">${esc(a.detail || labelFor(a))}</div>
            ${a.note ? `<div class="time__n">${esc(a.note)}</div>` : ''}
            ${a.transcript ? `<details style="margin-top:6px"><summary style="font-size:12px;color:var(--muted);cursor:pointer">Transcript</summary><div class="time__n">${esc(a.transcript)}</div></details>` : ''}
          </div>
        </li>`).join('')}
    </ul>`;
}

const labelFor = a => ({
  note: 'Note', stage: 'Stage changed', created: 'Prospect added',
  archived: 'Archived', restored: 'Restored', follow_up_set: 'Follow-up set',
  follow_up_done: 'Follow-up completed', opportunity: 'Opportunity', meeting_booked: 'Meeting',
}[a.outcome] || a.type);

/* ----------------------------------------------------------------- wiring */

function wire(host) {
  const c = data.company;

  $$('[data-tab]', host).forEach(b => {
    b.onclick = () => { tab = b.dataset.tab; paint(); };
  });

  const form = $('#detailsForm', host);
  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const patch = {};
      for (const [k, v] of fd.entries()) patch[k] = v;
      try {
        await api('prospect-save', { id: c.id, company: { ...c, ...patch } });
        toast('Saved', 'good');
        await reload();
      } catch (err) { toast(err.message, 'bad'); }
    };
  }

  const on = (sel, fn) => $$(sel, host).forEach(b => { b.onclick = () => fn(b); });

  on('[data-email]', () => emailModal({ company: c, contact: c.contact }));

  on('[data-followup]', async () => {
    const fu = await followUpModal({ company: c });
    if (!fu) return;
    await api('followup-create', { companyId: c.id, contactId: c.contact ? c.contact.id : null, ...fu });
    toast('Follow-up set', 'good');
    reload();
  });

  on('[data-callnow]', async () => {
    try {
      await api('queue-add', { companyId: c.id });
      toast('Added to today\'s list', 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });

  on('[data-archive]', async () => {
    const yes = await confirmBox({
      title: `Archive ${c.name}?`,
      body: 'They come out of every list and the calling queue. Nothing is deleted and you can restore them.',
      confirm: 'Archive',
    });
    if (!yes) return;
    await api('prospect-archive', { id: c.id, archived: 1 });
    toast('Archived');
    reload();
  });

  on('[data-restore]', async () => {
    await api('prospect-archive', { id: c.id, archived: 0 });
    toast('Restored', 'good');
    reload();
  });

  on('[data-delete]', async () => {
    const yes = await confirmBox({
      title: `Permanently delete ${c.name}?`,
      body: 'Every call, note and follow-up for this company goes with it. This cannot be undone.',
      confirm: 'Delete for good',
      danger: true,
    });
    if (!yes) return;
    await api('prospect-delete', { id: c.id });
    toast('Deleted');
    if (onSavedCb) onSavedCb();
    $('#drawer').hidden = true;
    $('#scrim').hidden = true;
    document.body.style.overflow = '';
  });

  /* contacts */
  on('[data-newcontact]', async () => {
    await api('contact-save', { contact: { company_id: c.id, first_name: '', last_name: '', is_primary: data.contacts.length === 0 ? 1 : 0 } });
    reload();
  });

  on('[data-savecontact]', async b => {
    const id = b.dataset.savecontact;
    const get = name => { const el = $(`#f_${name}__${id}`, host); return el ? el.value : ''; };
    await api('contact-save', {
      contact: {
        id, company_id: c.id,
        first_name: get('first_name'), last_name: get('last_name'), job_title: get('job_title'),
        direct_phone: get('direct_phone'), direct_email: get('direct_email'), linkedin: get('linkedin'),
      },
    });
    toast('Contact saved', 'good');
    reload();
  });

  on('[data-primary]', async b => {
    await api('contact-save', { contact: { id: b.dataset.primary, company_id: c.id, is_primary: 1 } });
    reload();
  });

  on('[data-archivecontact]', async b => {
    const yes = await confirmBox({ title: 'Remove this contact?', body: 'They stay on past activity, they just stop appearing on the call card.', confirm: 'Remove' });
    if (!yes) return;
    await api('contact-archive', { id: b.dataset.archivecontact, archived: 1 });
    reload();
  });

  /* sales */
  on('[data-savesales]', async () => {
    const get = n => { const el = $(`#f_${n}`, host); return el ? el.value : ''; };
    const stage = get('stage');
    if (stage !== c.stage) await api('prospect-stage', { id: c.id, stage });
    await api('prospect-save', {
      id: c.id,
      company: {
        ...c, stage,
        assigned_to: get('assigned_to'),
        est_mrr: get('est_mrr'), est_one_off: get('est_one_off'), probability: get('probability'),
      },
    });
    toast('Saved', 'good');
    reload();
  });

  on('[data-newopp]', async () => { if (await opportunityModal({ company: c })) reload(); });
  on('[data-editopp]', async b => {
    const o = data.opportunities.find(x => x.id === b.dataset.editopp);
    if (await opportunityModal({ company: c, opportunity: o })) reload();
  });

  on('[data-newmeeting]', async () => {
    const m = await meetingModal({ company: c });
    if (!m) return;
    await api('meeting-save', { meeting: { ...m, company_id: c.id } });
    toast('Meeting recorded', 'good');
    reload();
  });

  on('[data-donefu]', async b => { await api('followup-complete', { id: b.dataset.donefu }); toast('Done', 'good'); reload(); });
  on('[data-cancelfu]', async b => { await api('followup-cancel', { id: b.dataset.cancelfu }); reload(); });

  on('[data-addnote]', async () => {
    const el = $('#newNote', host);
    const note = el.value.trim();
    if (!note) return;
    await api('prospect-note', { companyId: c.id, note });
    toast('Note added', 'good');
    reload();
  });
}
