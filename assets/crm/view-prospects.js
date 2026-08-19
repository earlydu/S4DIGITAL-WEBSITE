// The prospect list: search, filter, page, export.
// Nothing is loaded that is not on screen, so this stays quick at 10,000 rows.

import { api, loadSettings } from './api.js';
import {
  $, $$, esc, toast, ago, humanDate, qualityBadge, stageBadge, loading, empty,
  download, dayISO, telHref,
} from './ui.js';
import { toCSV, toXLSX } from './sheet.js';

let settings = null;
let root = null;
let page = 0;
let size = 50;
let sort = 'added';
let q = '';
let filters = {};
let result = { items: [], total: 0 };
let timer = null;

export async function render(host, params = {}) {
  root = host;
  settings = await loadSettings();
  if (params.filters) filters = params.filters;
  if (params.q) q = params.q;
  paintShell();
  await load();
}

function paintShell() {
  root.className = 'view';
  root.innerHTML = `
    <div class="head">
      <div><h1>Prospects</h1><p id="count">Loading…</p></div>
      <div class="head__acts">
        <button class="btn btn--ghost btn--sm" data-export>Export</button>
        <button class="btn btn--sm" data-new>Add a prospect</button>
      </div>
    </div>

    <div class="filters">
      <input type="search" id="q" placeholder="Search company, contact, phone, email, notes" value="${esc(q)}" />
      <select id="f_sector"><option value="">Any sector</option>${settings.sectors.map(s => `<option${filters.sector === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select id="f_stage"><option value="">Any stage</option>${settings.stages.map(s => `<option${filters.stage === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select id="f_quality"><option value="">Any rating</option>${['A', 'B', 'C'].map(s => `<option${filters.quality === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select id="f_segment">
        <option value="">Commercial or residential</option>
        <option value="commercial"${filters.segment === 'commercial' ? ' selected' : ''}>Commercial</option>
        <option value="residential"${filters.segment === 'residential' ? ' selected' : ''}>Residential</option>
        <option value="both"${filters.segment === 'both' ? ' selected' : ''}>Both</option>
      </select>
      <input type="text" id="f_location" placeholder="Location" value="${esc(filters.location || '')}" />
      <select id="f_has">
        <option value="">Any contact detail</option>
        <option value="named"${filters.hasNamedContact ? ' selected' : ''}>Has a named contact</option>
        <option value="phone"${filters.hasPhone ? ' selected' : ''}>Has a phone number</option>
        <option value="email"${filters.hasDirectEmail ? ' selected' : ''}>Has a direct email</option>
        <option value="dphone"${filters.hasDirectPhone ? ' selected' : ''}>Has a direct phone</option>
      </select>
      <select id="f_state">
        <option value="">Active</option>
        <option value="followup"${filters.followUpDue ? ' selected' : ''}>Follow-up due</option>
        <option value="excluded"${filters.excludedOnly ? ' selected' : ''}>Excluded</option>
        <option value="archived"${filters.archivedOnly ? ' selected' : ''}>Archived</option>
      </select>
      <select id="sort">
        <option value="added"${sort === 'added' ? ' selected' : ''}>Newest first</option>
        <option value="name"${sort === 'name' ? ' selected' : ''}>Name</option>
        <option value="quality"${sort === 'quality' ? ' selected' : ''}>Lead rating</option>
        <option value="contacted"${sort === 'contacted' ? ' selected' : ''}>Last contacted</option>
      </select>
      <button class="clear" data-clear>Clear</button>
    </div>

    <div id="list">${loading()}</div>
    <div class="pager" id="pager"></div>`;

  $('#q', root).addEventListener('input', e => {
    clearTimeout(timer);
    q = e.target.value.trim();
    timer = setTimeout(() => { page = 0; load(); }, 220);
  });

  ['f_sector', 'f_stage', 'f_quality', 'f_segment', 'f_location', 'f_has', 'f_state', 'sort']
    .forEach(id => {
      const el = $(`#${id}`, root);
      el.addEventListener('change', () => { page = 0; readFilters(); load(); });
      if (el.type === 'text') el.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { page = 0; readFilters(); load(); }, 260);
      });
    });

  $('[data-clear]', root).onclick = () => { filters = {}; q = ''; page = 0; paintShell(); load(); };
  $('[data-export]', root).onclick = doExport;
  $('[data-new]', root).onclick = newProspect;
}

function readFilters() {
  const v = id => $(`#${id}`, root).value;
  filters = {};
  if (v('f_sector')) filters.sector = v('f_sector');
  if (v('f_stage')) filters.stage = v('f_stage');
  if (v('f_quality')) filters.quality = v('f_quality');
  if (v('f_segment')) filters.segment = v('f_segment');
  if (v('f_location')) filters.location = v('f_location');
  const has = v('f_has');
  if (has === 'named') filters.hasNamedContact = true;
  if (has === 'phone') filters.hasPhone = true;
  if (has === 'email') filters.hasDirectEmail = true;
  if (has === 'dphone') filters.hasDirectPhone = true;
  const st = v('f_state');
  if (st === 'followup') filters.followUpDue = dayISO();
  if (st === 'excluded') { filters.excludedOnly = true; filters.includeExcluded = true; }
  if (st === 'archived') { filters.archivedOnly = true; filters.includeArchived = true; }
  sort = v('sort');
}

async function load() {
  const list = $('#list', root);
  list.innerHTML = loading();
  try {
    result = await api('prospects', { q, filters, page, size, sort });
  } catch (err) {
    list.innerHTML = empty('Could not load', err.message);
    return;
  }

  $('#count', root).textContent = result.total === 1
    ? '1 prospect'
    : `${result.total.toLocaleString('en-GB')} prospects`;

  if (!result.items.length) {
    list.innerHTML = empty(
      q || Object.keys(filters).length ? 'Nothing matches' : 'No prospects yet',
      q || Object.keys(filters).length
        ? 'Try a wider filter, or clear them all.'
        : 'Import a researched list to get started.',
      Object.keys(filters).length ? '' : '<button class="btn" data-goto="import">Import prospects</button>');
    const g = $('[data-goto]', list);
    if (g) g.onclick = async () => { (await import('./app.js')).go('import'); };
    $('#pager', root).innerHTML = '';
    return;
  }

  list.innerHTML = `<div class="rows">${result.items.map(row).join('')}</div>`;
  $$('.row', list).forEach(el => {
    el.onclick = async e => {
      if (e.target.closest('a')) return;
      const { openProspect } = await import('./record.js');
      openProspect(el.dataset.id, { onSaved: load });
    };
  });

  const pages = Math.ceil(result.total / size);
  $('#pager', root).innerHTML = pages > 1 ? `
    <button class="btn btn--ghost btn--sm" data-prev ${page === 0 ? 'disabled' : ''}>Previous</button>
    <span class="num">Page ${page + 1} of ${pages}</span>
    <button class="btn btn--ghost btn--sm" data-next ${page + 1 >= pages ? 'disabled' : ''}>Next</button>` : '';
  const prev = $('[data-prev]', root);
  const next = $('[data-next]', root);
  if (prev) prev.onclick = () => { page -= 1; load(); window.scrollTo(0, 0); };
  if (next) next.onclick = () => { page += 1; load(); window.scrollTo(0, 0); };
}

function row(c) {
  const who = c.contact ? [c.contact.first_name, c.contact.last_name].filter(Boolean).join(' ') : '';
  return `
    <div class="row" data-id="${esc(c.id)}">
      <div class="row__m">
        <div class="row__n">${esc(c.name)}</div>
        <div class="row__s">
          ${c.sector ? `<span>${esc(c.sector)}</span>` : ''}
          ${c.location ? `<span>&middot; ${esc(c.location)}</span>` : ''}
          ${who ? `<span>&middot; ${esc(who)}</span>` : c.askFor ? `<span>&middot; ask for ${esc(c.askFor)}</span>` : ''}
          <span>&middot; last ${esc(c.last_contacted_at ? ago(c.last_contacted_at) : 'never')}</span>
          ${c.next_follow_up_at ? `<span style="color:var(--orange-2)">&middot; follow up ${esc(humanDate(c.next_follow_up_at))}</span>` : ''}
        </div>
      </div>
      <div class="row__r">
        ${c.main_phone ? `<a class="row__tel num" href="${telHref(c.main_phone)}">${esc(c.main_phone)}</a>` : ''}
        ${qualityBadge(c.lead_quality)}
        ${stageBadge(c.stage)}
        ${c.excluded ? '<span class="badge badge--red">Excluded</span>' : ''}
      </div>
    </div>`;
}

/* ----------------------------------------------------------------- export */

const EXPORT_COLUMNS = [
  ['name', 'Company Name'], ['sector', 'Sector'], ['sub_sector', 'Sub-Sector'],
  ['location', 'Location'], ['postcode', 'Postcode'], ['region', 'Region'],
  ['areas_served', 'Areas Served'], ['website', 'Website'], ['main_phone', 'Main Phone'],
  ['general_email', 'General Email'],
  ['contact_first_name', 'Contact First Name'], ['contact_last_name', 'Contact Last Name'],
  ['job_title', 'Job Title'], ['direct_phone', 'Direct Phone'], ['direct_email', 'Direct Email'],
  ['linkedin_contact', 'LinkedIn Contact'], ['linkedin_company', 'LinkedIn Company'],
  ['instagram', 'Instagram'], ['facebook', 'Facebook'],
  ['employees', 'Approx Employee Count'], ['founded', 'Founded'], ['years_trading', 'Years Trading'],
  ['google_reviews', 'Google Review Count'], ['google_rating', 'Google Rating'],
  ['segment', 'Commercial / Residential / Both'], ['key_services', 'Key Services'],
  ['established_evidence', "Evidence They're Established"],
  ['marketing_opportunity', 'Marketing Opportunity'], ['lead_quality', 'Lead Quality'],
  ['stage', 'Pipeline Stage'], ['call_status', 'Call Status'], ['attempts', 'Attempts'],
  ['last_contacted_at', 'Last Contacted'], ['next_follow_up_at', 'Next Follow-Up'],
  ['est_mrr', 'Estimated Monthly Value'], ['est_one_off', 'Estimated One-Off Value'],
  ['assigned_to', 'Assigned To'], ['source', 'Source'], ['source_urls', 'Source URLs'],
  ['date_verified', 'Date Verified'], ['notes', 'Notes'], ['created_at', 'Date Added'],
];

async function doExport() {
  const btn = $('[data-export]', root);
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const { items } = await api('export', { q, filters, limit: 20000 });
    const headers = EXPORT_COLUMNS.map(c => c[1]);
    const rows = items.map(i => EXPORT_COLUMNS.map(([k]) => {
      const v = i[k];
      return v === null || v === undefined ? '' : v;
    }));
    const stamp = dayISO();
    const blob = toXLSX(headers, rows, 'Prospects');
    download(`s4digital-prospects-${stamp}.xlsx`, blob);
    // A CSV alongside it, because some tools still want one.
    download(`s4digital-prospects-${stamp}.csv`,
      new Blob([toCSV(headers, rows)], { type: 'text/csv;charset=utf-8' }));
    toast(`${items.length} exported`, 'good');
  } catch (err) {
    toast(err.message, 'bad');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export';
  }
}

/* -------------------------------------------------------------------- new */

async function newProspect() {
  const { modal } = await import('./ui.js');
  const out = await modal({
    html: `
      <h2>Add a prospect</h2>
      <p class="sub">Just enough to call them. Everything else can wait.</p>
      <div class="field"><label for="nName">Company name</label><input id="nName" autofocus required /></div>
      <div class="field"><label for="nPhone">Main phone</label><input id="nPhone" type="tel" /></div>
      <div class="field--row">
        <div class="field"><label for="nSector">Sector</label>
          <select id="nSector">${settings.sectors.map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label for="nQ">Lead quality</label>
          <select id="nQ"><option>A</option><option selected>B</option><option>C</option></select></div>
      </div>
      <div class="field"><label for="nLoc">Location</label><input id="nLoc" /></div>
      <div class="field"><label for="nWhy">Marketing opportunity</label>
        <textarea id="nWhy" placeholder="Why are they worth a call?"></textarea></div>
      <div class="modal__f">
        <button class="btn btn--ghost" data-close>Cancel</button>
        <button class="btn" data-save>Add</button>
      </div>`,
    onMount(el, close) {
      $('[data-save]', el).onclick = () => {
        const name = $('#nName', el).value.trim();
        if (!name) { toast('It needs a name.', 'bad'); return; }
        close({
          name,
          main_phone: $('#nPhone', el).value.trim(),
          sector: $('#nSector', el).value,
          lead_quality: $('#nQ', el).value,
          location: $('#nLoc', el).value.trim(),
          marketing_opportunity: $('#nWhy', el).value.trim(),
        });
      };
    },
  });
  if (!out) return;
  try {
    const saved = await api('prospect-save', { company: out });
    toast('Added', 'good');
    const { openProspect } = await import('./record.js');
    openProspect(saved.company.id, { onSaved: load });
    load();
  } catch (err) { toast(err.message, 'bad'); }
}
