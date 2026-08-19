// Follow ups, grouped by when they are due. Overdue is first and stays first.

import { api, state } from './api.js';
import {
  $, $$, esc, toast, telHref, humanDate, dayISO, addDays, loading, empty, qualityBadge, channelIcons,
} from './ui.js';
import { followUpModal, emailModal } from './dialogs.js';
import { refreshFollowUpDot } from './nav.js';

let root = null;
let items = [];

export async function render(host) {
  root = host;
  host.innerHTML = loading('Checking what is due');
  const out = await api('followups');
  items = out.items;
  paint();
}

function bucketOf(due) {
  const t = state.today || dayISO();
  if (due < t) return 'Overdue';
  if (due === t) return 'Today';
  if (due === addDays(t, 1)) return 'Tomorrow';
  if (due <= addDays(t, 7)) return 'This week';
  return 'Later';
}

const ORDER = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later'];

function paint() {
  if (!items.length) {
    root.innerHTML = `
      <div class="head"><div><h1>Follow ups</h1><p>Nothing outstanding.</p></div></div>
      ${empty('All clear', 'No follow-ups are pending. They appear here the moment you set one on a call.')}`;
    return;
  }

  const groups = {};
  for (const f of items) {
    const b = bucketOf(f.due_date);
    (groups[b] = groups[b] || []).push(f);
  }

  const due = items.filter(f => f.due_date <= (state.today || dayISO())).length;

  root.innerHTML = `
    <div class="head">
      <div>
        <h1>Follow ups</h1>
        <p>${items.length} pending${due ? `, ${due} due now` : ''}</p>
      </div>
      ${due ? '<div class="head__acts"><button class="btn btn--orange" data-callthem>Call the due ones</button></div>' : ''}
    </div>
    ${ORDER.filter(k => groups[k]).map(k => `
      <section class="fugroup">
        <h2 class="sec">${esc(k)} <span class="badge${k === 'Overdue' ? ' badge--red' : k === 'Today' ? ' badge--warn' : ''}">${groups[k].length}</span></h2>
        ${groups[k].map(f => card(f, k)).join('')}
      </section>`).join('')}`;

  wire();
}

function card(f, bucket) {
  const c = f.company;
  const who = c.contact ? [c.contact.first_name, c.contact.last_name].filter(Boolean).join(' ') : '';
  const cls = bucket === 'Overdue' ? ' fu--late' : bucket === 'Today' ? ' fu--today' : '';
  return `
    <div class="fu${cls}" data-fu="${esc(f.id)}" data-company="${esc(c.id)}">
      <div class="fu__m">
        <div class="fu__n">${esc(c.name)}</div>
        ${f.note ? `<div class="fu__note">${esc(f.note)}</div>` : ''}
        <div class="fu__meta">
          <span>${esc(humanDate(f.due_date))}${f.due_time ? ' at ' + esc(f.due_time) : ''}</span>
          <span>&middot; by ${esc(f.kind || 'call')}</span>
          ${who ? `<span>&middot; ${esc(who)}${c.contact.job_title ? ', ' + esc(c.contact.job_title) : ''}</span>`
                : c.askFor ? `<span>&middot; ask for ${esc(c.askFor)}</span>` : ''}
          ${c.location ? `<span>&middot; ${esc(c.location)}</span>` : ''}
        </div>
      </div>
      <div class="fu__acts">
        ${channelIcons(c, { showMissing: false })}
        ${qualityBadge(c.lead_quality)}
        ${c.main_phone && (f.kind || 'call') === 'call'
          ? `<a class="btn btn--sm" href="${telHref(c.main_phone)}" data-callone>${esc(c.main_phone)}</a>` : ''}
        ${(f.kind === 'email') ? '<button class="btn btn--sm btn--blue" data-emailone>Write email</button>' : ''}
        <button class="btn btn--ghost btn--sm" data-open>Open</button>
        <button class="btn btn--ghost btn--sm" data-move>Reschedule</button>
        <button class="btn btn--ghost btn--sm" data-done>Complete</button>
      </div>
    </div>`;
}

function wire() {
  const call = $('[data-callthem]', root);
  if (call) {
    call.onclick = async () => {
      // Everything due is already at the top of today's generated queue, so
      // going to Today is the honest route rather than a second parallel list.
      (await import('./nav.js')).go('today');
    };
  }

  $$('.fu', root).forEach(el => {
    const id = el.dataset.fu;
    const companyId = el.dataset.company;
    const f = items.find(x => x.id === id);

    const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };

    on('[data-open]', async () => {
      const { openProspect } = await import('./record.js');
      openProspect(companyId, { onSaved: () => render(root) });
    });

    on('[data-emailone]', () => emailModal({ company: f.company, contact: f.company.contact }));

    on('[data-move]', async () => {
      const out = await followUpModal({ company: f.company, defaultNote: f.note, title: 'Reschedule' });
      if (!out) return;
      await api('followup-reschedule', { id, date: out.date, time: out.time, note: out.note });
      toast('Rescheduled', 'good');
      render(root);
      refreshFollowUpDot();
    });

    on('[data-done]', async () => {
      await api('followup-complete', { id });
      toast('Marked done', 'good');
      items = items.filter(x => x.id !== id);
      paint();
      refreshFollowUpDot();
    });

    // Clicking a due call follow-up should put you straight into calling mode.
    on('[data-callone]', async () => {
      try { await api('queue-add', { companyId, reason: 'follow_up' }); } catch { /* still dialling */ }
    });
  });
}
