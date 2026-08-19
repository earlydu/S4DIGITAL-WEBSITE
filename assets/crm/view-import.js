// Import: drop a file, check the column mapping, see what is new against what
// already exists, then commit. The file never leaves the browser as a file, only
// as the rows you confirmed.

import { api } from './api.js';
import { $, $$, esc, toast, humanStamp, loading, empty } from './ui.js';
import { readSheet } from './sheet.js';

let root = null;
let fields = [];
let rows = [];          // raw rows from the sheet
let headers = [];
let mapping = {};       // column index -> field key
let filename = '';
let analysis = null;
let step = 'drop';

export async function render(host) {
  root = host;
  const out = await api('import-fields');
  fields = out.fields;
  step = 'drop';
  paint();
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Guesses the mapping from the header row using the alias table. */
function autoMap() {
  mapping = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    const exact = fields.find(f => norm(f.key) === n || norm(f.label) === n);
    if (exact) { mapping[i] = exact.key; return; }
    const alias = fields.find(f => (f.aliases || []).some(a => norm(a) === n));
    if (alias) mapping[i] = alias.key;
  });
}

/* ------------------------------------------------------------------ paint */

function paint() {
  root.className = 'view';
  root.innerHTML = `
    <div class="head">
      <div><h1>Import</h1><p>CSV or XLSX. Duplicates are checked before anything is written.</p></div>
      ${step !== 'drop' ? '<div class="head__acts"><button class="btn btn--ghost btn--sm" data-restart>Start again</button></div>' : ''}
    </div>
    ${step === 'drop' ? dropStep() : step === 'map' ? mapStep() : step === 'check' ? checkStep() : doneStep()}`;
  wire();
}

function dropStep() {
  return `
    <div class="drop" id="drop">
      <h3>Drop your prospect list here</h3>
      <p>CSV or XLSX. The first row should be your column headings.<br>
         Company name is the only column that has to be there.</p>
      <input type="file" id="file" accept=".csv,.xlsx,.xlsm,text/csv" hidden />
      <button class="btn" data-pick>Choose a file</button>
    </div>
    <h2 class="sec">Recent imports</h2>
    <div id="history">${loading()}</div>`;
}

function mapStep() {
  const sample = rows.slice(1, 4);
  return `
    <div class="card" style="margin-bottom:14px">
      <b>${esc(filename)}</b> - ${rows.length - 1} data rows, ${headers.length} columns.
      Check the mapping below. Anything set to "ignore" is left out.
    </div>
    ${headers.map((h, i) => `
      <div class="map">
        <div class="map__h">
          ${esc(h || `Column ${i + 1}`)}
          <small>${esc(sample.map(r => r[i]).filter(Boolean).slice(0, 2).join(' · ').slice(0, 70))}</small>
        </div>
        <div class="map__a">→</div>
        <select data-col="${i}" class="${mapping[i] ? 'is-set' : ''}">
          <option value="">(ignore)</option>
          ${fields.map(f => `<option value="${esc(f.key)}"${mapping[i] === f.key ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}
        </select>
      </div>`).join('')}
    <div style="display:flex;gap:8px;margin-top:20px">
      <button class="btn" data-check>Check for duplicates</button>
    </div>`;
}

function checkStep() {
  const a = analysis;
  const problems = a.rows.filter(r => r.status !== 'new');
  return `
    <div class="sum">
      ${tile('Rows', a.total)}
      ${tile('New', a.wouldAdd, 'green')}
      ${tile('Already exist', a.duplicates, a.duplicates ? 'warn' : '')}
      ${tile('Errors', a.invalid, a.invalid ? 'red' : '')}
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="field" style="margin:0">
        <label for="mode">What should happen to the ones that already exist?</label>
        <select id="mode">
          <option value="add">Skip them, only add what is new</option>
          <option value="update">Update them with the new values, and add what is new</option>
        </select>
        <small>Updating never blanks an existing value with an empty cell.</small>
      </div>
    </div>

    ${problems.length ? `
      <h2 class="sec">Worth a look (${problems.length})</h2>
      <div class="rows" style="max-height:380px;overflow:auto">
        ${problems.slice(0, 300).map(r => `
          <div class="row" style="cursor:default">
            <div class="row__m">
              <div class="row__n">Row ${r.row}: ${esc(r.name || '(no name)')}</div>
              <div class="row__s">
                <span>${r.status === 'error' ? esc(r.message) : `Matches an existing prospect by ${esc(r.matchedBy)}`}</span>
                ${r.excluded ? `<span style="color:var(--red)">&middot; this is on your exclusion list (${esc(r.excluded)})</span>` : ''}
              </div>
            </div>
            <div class="row__r">
              <span class="badge ${r.status === 'error' ? 'badge--red' : 'badge--warn'}">${r.status === 'error' ? 'Error' : 'Duplicate'}</span>
            </div>
          </div>`).join('')}
      </div>` : ''}

    <div style="display:flex;gap:8px;margin-top:20px">
      <button class="btn btn--orange" data-run>Import ${a.wouldAdd} new ${a.wouldAdd === 1 ? 'prospect' : 'prospects'}</button>
      <button class="btn btn--ghost" data-restart>Cancel</button>
    </div>`;
}

function doneStep() {
  const s = analysis;
  return `
    <div class="sum">
      ${tile('Rows processed', s.rows)}
      ${tile('Added', s.added, 'green')}
      ${tile('Updated', s.updated, 'green')}
      ${tile('Skipped', s.skipped)}
      ${tile('Errors', s.errors.length, s.errors.length ? 'red' : '')}
    </div>
    ${s.errors.length ? `
      <div class="card" style="margin-bottom:14px">
        <b>Rows that could not be imported</b>
        <ul style="margin-top:8px;font-size:13.5px;line-height:1.7;padding-left:18px">
          ${s.errors.slice(0, 40).map(e => `<li>Row ${e.row}: ${esc(e.message)}</li>`).join('')}
        </ul>
      </div>` : ''}
    <div style="display:flex;gap:8px">
      <button class="btn" data-goto="prospects">See the prospects</button>
      <button class="btn btn--ghost" data-restart>Import another file</button>
    </div>`;
}

const tile = (k, v, kind = '') => `
  <div class="stat">
    <div class="stat__k">${esc(k)}</div>
    <div class="stat__v num" ${kind === 'green' ? 'style="color:var(--green)"' : kind === 'red' ? 'style="color:var(--red)"' : kind === 'warn' ? 'style="color:var(--amber)"' : ''}>${v}</div>
  </div>`;

/* ----------------------------------------------------------------- wiring */

function wire() {
  const restart = $('[data-restart]', root);
  if (restart) {
    // Reset in place. Re-running render() would fetch the field list again and
    // repaint a second time, which can wipe a file dropped in between.
    restart.onclick = () => {
      rows = []; headers = []; mapping = {}; analysis = null; filename = '';
      step = 'drop';
      paint();
    };
  }

  const goto = $('[data-goto]', root);
  if (goto) goto.onclick = async () => { (await import('./nav.js')).go(goto.dataset.goto); };

  if (step === 'drop') {
    const drop = $('#drop', root);
    const file = $('#file', root);
    $('[data-pick]', root).onclick = () => file.click();
    file.onchange = () => { if (file.files[0]) take(file.files[0]); };

    ['dragenter', 'dragover'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0];
      if (f) take(f);
    });

    loadHistory();
    return;
  }

  if (step === 'map') {
    $$('select[data-col]', root).forEach(sel => {
      sel.onchange = () => {
        const i = Number(sel.dataset.col);
        if (sel.value) mapping[i] = sel.value; else delete mapping[i];
        sel.classList.toggle('is-set', Boolean(sel.value));
      };
    });
    $('[data-check]', root).onclick = check;
    return;
  }

  if (step === 'check') {
    $('[data-run]', root).onclick = run;
  }
}

async function take(file) {
  try {
    toast('Reading the file…');
    const parsed = await readSheet(file);
    if (parsed.length < 2) throw new Error('That file has a heading row but no data.');
    rows = parsed;
    headers = parsed[0].map(h => String(h || '').trim());
    filename = file.name;
    autoMap();
    if (!Object.values(mapping).includes('name')) {
      toast('No column looks like the company name. Set it below.', 'bad');
    }
    step = 'map';
    paint();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

const asObjects = () => rows.slice(1).map(r => {
  const o = {};
  for (const [i, key] of Object.entries(mapping)) o[key] = r[Number(i)];
  return o;
});

async function check() {
  if (!Object.values(mapping).includes('name')) {
    toast('Map one column to Company Name first.', 'bad');
    return;
  }
  const btn = $('[data-check]', root);
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    analysis = await api('import-analyse', { rows: asObjects() });
    step = 'check';
    paint();
  } catch (err) {
    toast(err.message, 'bad');
    btn.disabled = false;
    btn.textContent = 'Check for duplicates';
  }
}

async function run() {
  const btn = $('[data-run]', root);
  const mode = $('#mode', root).value;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Importing';
  try {
    analysis = await api('import-run', { rows: asObjects(), mode, filename });
    step = 'done';
    paint();
    toast(`${analysis.added} added, ${analysis.updated} updated`, 'good');
  } catch (err) {
    toast(err.message, 'bad');
    btn.disabled = false;
    btn.textContent = 'Import';
  }
}

async function loadHistory() {
  const box = $('#history', root);
  if (!box) return;
  try {
    const { items } = await api('import-history');
    box.innerHTML = items.length ? `<div class="rows">${items.map(i => `
      <div class="row" style="cursor:default">
        <div class="row__m">
          <div class="row__n">${esc(i.filename)}</div>
          <div class="row__s">
            <span>${esc(humanStamp(i.created_at))}</span>
            <span>&middot; ${i.added} added</span>
            <span>&middot; ${i.updated} updated</span>
            <span>&middot; ${i.skipped} skipped</span>
          </div>
        </div>
      </div>`).join('')}</div>` : empty('No imports yet', 'Your first one will be listed here.');
  } catch {
    box.innerHTML = '';
  }
}
