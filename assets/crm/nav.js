// Routing, and the small bits of shell state the views need to reach.
//
// This lives apart from app.js on purpose. The page loads app.js with a
// cache-busting query (`app.js?v=3`), and a module specifier is part of its
// identity: a view doing `import('./app.js')` would resolve to a *different*
// URL and get a second copy of the module, with a second set of event
// listeners. Everything shared with the views lives here instead, where both
// sides spell the specifier the same way and there is only ever one instance.

import { api, state } from './api.js';
import { $, $$, esc } from './ui.js';

const VIEWS = {
  dashboard: () => import('./view-dashboard.js'),
  today: () => import('./view-today.js'),
  pipeline: () => import('./view-pipeline.js'),
  prospects: () => import('./view-prospects.js'),
  followups: () => import('./view-followups.js'),
  import: () => import('./view-import.js'),
  settings: () => import('./view-settings.js'),
};

export const viewNames = Object.keys(VIEWS);

let current = null;

export const routeFromUrl = () => {
  const path = location.pathname.replace(/^\/(sales|crm)\/?/, '').split('/')[0];
  return VIEWS[path] ? path : 'today';
};

export async function go(name, { push = true, params } = {}) {
  if (!VIEWS[name]) name = 'today';
  if (push) history.pushState({ view: name }, '', `/sales/${name === 'today' ? '' : name}`);
  $$('#tabs button').forEach(b => b.classList.toggle('is-active', b.dataset.view === name));
  $('#tabs').classList.remove('is-open');

  if (current && current.leave) { try { current.leave(); } catch { /* view already gone */ } }
  const host = $('#view');
  host.innerHTML = '<div class="loading"><span class="spin spin--dark"></span></div>';

  try {
    const mod = await VIEWS[name]();
    current = mod;
    await mod.render(host, params || {});
  } catch (err) {
    host.innerHTML = `<div class="empty"><h3>That screen would not load</h3><p>${esc(err.message)}</p></div>`;
  }
}

/** A dot on the Follow Ups tab when something is due. */
export async function refreshFollowUpDot() {
  try {
    const { items } = await api('followups');
    const due = items.filter(f => f.due_date <= state.today).length;
    const dot = $('#fuDot');
    if (!dot) return;
    dot.hidden = due === 0;
    dot.title = `${due} due`;
  } catch { /* not important enough to shout about */ }
}
