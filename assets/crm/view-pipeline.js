// The Kanban board. Drag a card to another column and the stage saves.
//
// Native HTML drag and drop on desktop, plus a "Move to" button on every card
// so the board is still usable on a phone, where dragging is miserable.

import { api, loadSettings } from './api.js';
import {
  $, $$, esc, toast, money, humanDate, ago, qualityBadge, loading, modal, channelIcons,
} from './ui.js';

let board = null;
let settings = null;
let root = null;
let dragging = null;

export async function render(host) {
  root = host;
  settings = await loadSettings();
  host.innerHTML = loading('Loading the pipeline');
  board = await api('pipeline', { perStage: 40 });
  paint();
}

function paint() {
  root.className = 'view view--wide';
  root.innerHTML = `
    <div class="head">
      <div><h1>Pipeline</h1><p>Drag a card to move it. Click one to open the record.</p></div>
      <div class="head__acts"><button class="btn btn--ghost btn--sm" data-refresh>Refresh</button></div>
    </div>
    <div class="kan">
      ${board.stages.map(column).join('')}
    </div>`;
  wire();
}

function column(stage) {
  const col = board.columns[stage] || { items: [], total: 0 };
  const g = (board.guide || {})[stage] || {};
  return `
    <section class="kcol" data-stage="${esc(stage)}">
      <header class="kcol__h"><span>${esc(stage)}</span><b class="num">${col.total}</b></header>
      ${g.means ? `<div class="kcol__guide"><b>${esc(g.means)}</b><span>${esc(g.next)}</span></div>` : ''}
      <div class="kcol__list" data-list="${esc(stage)}">
        ${col.items.map(card).join('') || '<p style="font-size:12.5px;color:var(--muted);padding:8px">Empty</p>'}
        ${col.total > col.items.length
          ? `<div class="kmore">${col.total - col.items.length} more not shown</div>` : ''}
      </div>
    </section>`;
}

function card(c) {
  const who = c.contact ? [c.contact.first_name, c.contact.last_name].filter(Boolean).join(' ') : '';
  const value = Number(c.est_mrr || 0);
  return `
    <article class="kc" draggable="true" data-id="${esc(c.id)}">
      <div class="kc__n">${esc(c.name)}</div>
      ${who ? `<div class="kc__c">${esc(who)}${c.contact.job_title ? ', ' + esc(c.contact.job_title) : ''}</div>`
            : c.askFor ? `<div class="kc__c" style="color:var(--muted)">Ask for ${esc(c.askFor)}</div>` : ''}
      <div class="kc__m">
        ${qualityBadge(c.lead_quality)}
        ${c.sector ? `<span>${esc(c.sector)}</span>` : ''}
        ${c.location ? `<span>&middot; ${esc(c.location)}</span>` : ''}
      </div>
      <div class="kc__m kc__m--chans">
        ${channelIcons(c, { showMissing: false, links: false })}
        <span>Last: ${esc(c.last_contacted_at ? ago(c.last_contacted_at) : 'never')}</span>
      </div>
      ${c.next_follow_up_at ? `<div class="kc__f">Follow up ${esc(humanDate(c.next_follow_up_at))}</div>` : ''}
      ${value ? `<div class="kc__v">${money(value)}/month</div>` : ''}
    </article>`;
}

/* ----------------------------------------------------------------- wiring */

function wire() {
  $('[data-refresh]', root).onclick = async () => {
    board = await api('pipeline', { perStage: 40 });
    paint();
  };

  $$('.kc', root).forEach(el => {
    el.addEventListener('dragstart', e => {
      dragging = el.dataset.id;
      el.classList.add('is-drag');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', el.dataset.id);
    });
    el.addEventListener('dragend', () => { el.classList.remove('is-drag'); dragging = null; });

    let moved = false;
    el.addEventListener('mousedown', () => { moved = false; });
    el.addEventListener('mousemove', () => { moved = true; });
    el.addEventListener('click', async () => {
      if (moved) return;
      const { openProspect } = await import('./record.js');
      openProspect(el.dataset.id, { onSaved: async () => { board = await api('pipeline', { perStage: 40 }); paint(); } });
    });

    // Touch has no drag events worth using, so long-press offers the picker.
    let timer = null;
    el.addEventListener('touchstart', () => {
      timer = setTimeout(() => movePicker(el.dataset.id), 500);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(ev =>
      el.addEventListener(ev, () => clearTimeout(timer), { passive: true }));
  });

  $$('.kcol', root).forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('is-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('is-over'));
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('is-over');
      const id = dragging || e.dataTransfer.getData('text/plain');
      if (id) await moveTo(id, col.dataset.stage);
    });
  });
}

async function moveTo(id, stage) {
  const from = board.stages.find(s => (board.columns[s].items || []).some(c => c.id === id));
  if (from === stage) return;

  // Move it on screen first: waiting for the round trip makes the board feel slow.
  const card = board.columns[from].items.find(c => c.id === id);
  if (card) {
    board.columns[from].items = board.columns[from].items.filter(c => c.id !== id);
    board.columns[from].total -= 1;
    card.stage = stage;
    board.columns[stage].items.unshift(card);
    board.columns[stage].total += 1;
    paint();
  }

  try {
    await api('prospect-stage', { id, stage });
    toast(`Moved to ${stage}`, 'good');
  } catch (err) {
    toast(err.message, 'bad');
    board = await api('pipeline', { perStage: 40 });
    paint();
  }
}

async function movePicker(id) {
  const stage = await modal({
    html: `<h2>Move to</h2>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:14px">
        ${board.stages.map(s => `<button class="btn btn--ghost" data-stage="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>
      <div class="modal__f"><button class="btn btn--ghost" data-close>Cancel</button></div>`,
    onMount(el, close) {
      $$('[data-stage]', el).forEach(b => { b.onclick = () => close(b.dataset.stage); });
    },
  });
  if (stage) await moveTo(id, stage);
}
