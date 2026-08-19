// The modals shared by calling mode, the prospect drawer and the follow-ups page.

import { api, state, loadSettings } from './api.js';
import {
  $, $$, esc, modal, toast, dayISO, addDays, addWorkingDays, humanDate, fill, copy, money,
} from './ui.js';

/* --------------------------------------------------------------- follow up */

const QUICK = [
  ['Tomorrow', iso => addWorkingDays(iso, 1)],
  ['2 days', iso => addWorkingDays(iso, 2)],
  ['3 days', iso => addWorkingDays(iso, 3)],
  ['1 week', iso => addDays(iso, 7)],
  ['2 weeks', iso => addDays(iso, 14)],
];

/** Resolves { date, time, kind, note } or null. */
export function followUpModal({ company, defaultNote = '', title = 'Set a follow-up' } = {}) {
  const today = dayISO();
  return modal({
    html: `
      <h2>${esc(title)}</h2>
      <p class="sub">${esc(company ? company.name : '')}</p>
      <div class="quickdates" id="quick">
        ${QUICK.map(([label]) => `<button type="button" data-q="${esc(label)}">${esc(label)}</button>`).join('')}
      </div>
      <div class="field field--row">
        <div>
          <label for="fuDate">Date</label>
          <input id="fuDate" type="date" value="${addWorkingDays(today, 2)}" min="${today}" />
        </div>
        <div>
          <label for="fuTime">Time (optional)</label>
          <input id="fuTime" type="time" />
        </div>
      </div>
      <div class="field">
        <label for="fuKind">Type</label>
        <select id="fuKind">
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="linkedin">LinkedIn</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="field">
        <label for="fuNote">Note</label>
        <textarea id="fuNote" placeholder="What is this follow-up for?">${esc(defaultNote)}</textarea>
      </div>
      <div class="modal__f">
        <button class="btn btn--ghost" data-close>Cancel</button>
        <button class="btn btn--orange" data-save>Save follow-up</button>
      </div>`,
    onMount(root, close) {
      const date = $('#fuDate', root);
      const mark = () => $$('#quick button', root).forEach(b =>
        b.classList.toggle('is-on', QUICK.find(q => q[0] === b.dataset.q)[1](today) === date.value));
      $$('#quick button', root).forEach(b => {
        b.onclick = () => { date.value = QUICK.find(q => q[0] === b.dataset.q)[1](today); mark(); };
      });
      mark();
      $('[data-save]', root).onclick = () => {
        if (!date.value) { toast('Pick a date.', 'bad'); return; }
        close({
          date: date.value,
          time: $('#fuTime', root).value,
          kind: $('#fuKind', root).value,
          note: $('#fuNote', root).value.trim(),
        });
      };
    },
  });
}

/* ----------------------------------------------------------------- meeting */

export function meetingModal({ company } = {}) {
  return modal({
    html: `
      <h2>Meeting booked</h2>
      <p class="sub">${esc(company ? company.name : '')}</p>
      <div class="field field--row">
        <div><label for="mDate">Date</label><input id="mDate" type="date" value="${addWorkingDays(dayISO(), 3)}" /></div>
        <div><label for="mTime">Time</label><input id="mTime" type="time" value="10:00" /></div>
      </div>
      <div class="field">
        <label for="mKind">Type</label>
        <select id="mKind">
          <option>Video call</option><option>Phone call</option>
          <option>On site</option><option>In person</option>
        </select>
      </div>
      <div class="field">
        <label for="mNotes">Notes</label>
        <textarea id="mNotes" placeholder="What did they agree to?"></textarea>
      </div>
      <div class="modal__f">
        <button class="btn btn--ghost" data-close>Skip</button>
        <button class="btn btn--blue" data-save>Save meeting</button>
      </div>`,
    onMount(root, close) {
      $('[data-save]', root).onclick = () => close({
        date: $('#mDate', root).value,
        time: $('#mTime', root).value,
        kind: $('#mKind', root).value,
        notes: $('#mNotes', root).value.trim(),
      });
    },
  });
}

/* ------------------------------------------------------------- opportunity */

export async function opportunityModal({ company, opportunity }) {
  const settings = await loadSettings();
  const o = opportunity || {};
  const out = await modal({
    html: `
      <h2>${o.id ? 'Edit' : 'New'} opportunity</h2>
      <p class="sub">${esc(company ? company.name : '')}</p>
      <div class="field">
        <label for="oService">Service</label>
        <select id="oService">
          ${settings.services.map(s => `<option${o.service === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
        </select>
      </div>
      <div class="field field--row">
        <div><label for="oMrr">Monthly recurring (£)</label><input id="oMrr" type="number" min="0" step="50" value="${esc(o.mrr || '')}" /></div>
        <div><label for="oOne">One-off (£)</label><input id="oOne" type="number" min="0" step="50" value="${esc(o.one_off || '')}" /></div>
      </div>
      <div class="field field--row">
        <div><label for="oClose">Estimated close</label><input id="oClose" type="date" value="${esc(o.close_date || addDays(dayISO(), 30))}" /></div>
        <div><label for="oProb">Probability (%)</label><input id="oProb" type="number" min="0" max="100" step="5" value="${esc(o.probability ?? 30)}" /></div>
      </div>
      <div class="field">
        <label for="oNotes">Notes</label>
        <textarea id="oNotes">${esc(o.notes || '')}</textarea>
      </div>
      <div class="modal__f">
        <button class="btn btn--ghost" data-close>Cancel</button>
        <button class="btn" data-save>Save</button>
      </div>`,
    onMount(root, close) {
      $('[data-save]', root).onclick = () => close({
        id: o.id,
        company_id: company.id,
        service: $('#oService', root).value,
        mrr: Number($('#oMrr', root).value) || 0,
        one_off: Number($('#oOne', root).value) || 0,
        close_date: $('#oClose', root).value,
        probability: Number($('#oProb', root).value) || 0,
        notes: $('#oNotes', root).value.trim(),
        stage: o.stage || (company && company.stage) || 'Qualified',
      });
    },
  });
  if (!out) return null;
  const saved = await api('opportunity-save', { opportunity: out });
  toast(`Opportunity saved${out.mrr ? ` - ${money(out.mrr)}/month` : ''}`, 'good');
  return saved.opportunity;
}

/* ------------------------------------------------------------------- email */

const gmailUrl = (to, subject, body) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to || '')}` +
  `&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

const mailtoUrl = (to, subject, body) =>
  `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/**
 * Pick a template, see it merged with this prospect's details, then open it in
 * Gmail or the default mail app. With an ANTHROPIC_API_KEY and the toggle on,
 * "Write it for me" drafts from the call history instead.
 */
export async function emailModal({ company, contact, transcript }) {
  const settings = await loadSettings();
  const meta = state.meta || {};
  const templates = meta.templates || [];
  const aiOn = meta.ai && meta.ai.draft && meta.ai.draft.enabled;

  const to = (contact && contact.direct_email) || company.general_email || '';
  const ctx = { company, contact, profile: settings.profile };

  const render = t => ({
    subject: fill(t ? t.subject : '', ctx),
    body: fill(t ? t.body : '', ctx),
  });

  let picked = templates[0] ? render(templates[0]) : { subject: '', body: '' };

  await modal({
    wide: true,
    html: `
      <h2>Email ${esc(company.name)}</h2>
      <p class="sub">${to ? esc(to) : 'No email address on file. Write it and copy it out.'}</p>
      <div class="field">
        <label for="eTpl">Template</label>
        <select id="eTpl">
          ${templates.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}
          <option value="blank">Blank</option>
        </select>
      </div>
      <div class="field">
        <label for="eSub">Subject</label>
        <input id="eSub" type="text" value="${esc(picked.subject)}" />
      </div>
      <div class="field">
        <label for="eBody">Message</label>
        <textarea id="eBody" style="min-height:220px">${esc(picked.body)}</textarea>
      </div>
      <div class="modal__f">
        ${aiOn ? '<button class="btn btn--ghost" data-ai>Write it for me</button>' : ''}
        <button class="btn btn--ghost" data-copy>Copy</button>
        <button class="btn btn--ghost" data-mailto>Default mail app</button>
        <button class="btn btn--blue" data-gmail>Open in Gmail</button>
        <button class="btn btn--ghost" data-close>Close</button>
      </div>`,
    onMount(root, close) {
      const sub = $('#eSub', root);
      const bod = $('#eBody', root);

      $('#eTpl', root).onchange = e => {
        const v = e.target.value;
        const next = v === 'blank' ? { subject: '', body: '' } : render(templates[Number(v)]);
        sub.value = next.subject;
        bod.value = next.body;
      };

      $('[data-copy]', root).onclick = () => copy(`${sub.value}\n\n${bod.value}`);
      $('[data-gmail]', root).onclick = () => {
        window.open(gmailUrl(to, sub.value, bod.value), '_blank', 'noopener');
        logEmail(company.id, contact && contact.id, sub.value);
        close(true);
      };
      $('[data-mailto]', root).onclick = () => {
        location.href = mailtoUrl(to, sub.value, bod.value);
        logEmail(company.id, contact && contact.id, sub.value);
      };

      const aiBtn = $('[data-ai]', root);
      if (aiBtn) {
        aiBtn.onclick = async () => {
          aiBtn.disabled = true;
          aiBtn.innerHTML = '<span class="spin spin--dark"></span> Writing';
          try {
            const out = await api('ai-draft', {
              companyId: company.id,
              purpose: 'follow up after the call that just happened',
              transcript,
            });
            sub.value = out.subject;
            bod.value = out.body;
            toast('Drafted from your call history', 'good');
          } catch (err) {
            toast(err.message, 'bad');
          } finally {
            aiBtn.disabled = false;
            aiBtn.textContent = 'Write it for me';
          }
        };
      }
    },
  });
}

async function logEmail(companyId, contactId, subject) {
  try {
    await api('prospect-note', {
      companyId, contactId,
      note: `Email sent: ${subject}`,
    });
  } catch { /* the email still went, which is what matters */ }
}
