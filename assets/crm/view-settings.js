// Settings. Targets, retry rules, the call script, email templates, the
// exclusion list, accounts, and the two paid features that stay off by default.

import { api, state, loadSettings } from './api.js';
import { $, $$, esc, toast, confirmBox, modal, loading } from './ui.js';

let root = null;
let meta = null;
let s = null;

export async function render(host) {
  root = host;
  host.innerHTML = loading();
  await loadSettings(true);
  meta = state.meta;
  s = state.settings;
  paint();
}

function paint() {
  root.innerHTML = `
    <div class="head">
      <div><h1>Settings</h1><p>Signed in as ${esc(state.user.email)} &middot; database: ${esc(meta.driver)}</p></div>
    </div>

    <div class="set">
      <section class="card">
        <h2 class="sec">Targets</h2>
        <div class="field--row">
          <div class="field"><label for="tDaily">Calls per day</label>
            <input id="tDaily" type="number" min="1" max="500" value="${esc(s.targets.daily)}" /></div>
          <div class="field"><label for="tWeekly">Calls per week</label>
            <input id="tWeekly" type="number" min="1" max="2500" value="${esc(s.targets.weekly)}" /></div>
        </div>
        <button class="btn btn--sm" data-save-targets>Save targets</button>
      </section>

      <section class="card">
        <h2 class="sec">Retry rules</h2>
        <p style="font-size:13px;color:var(--muted);line-height:1.55;margin-bottom:12px">
          In working days. Weekends are skipped automatically.</p>
        <div class="field--row">
          <div class="field"><label for="rNo">After no answer</label>
            <input id="rNo" type="number" min="1" max="60" value="${esc(s.retry.noAnswerDays)}" /></div>
          <div class="field"><label for="rGk">After a gatekeeper</label>
            <input id="rGk" type="number" min="1" max="60" value="${esc(s.retry.gatekeeperDays)}" /></div>
        </div>
        <div class="field--row">
          <div class="field"><label for="rDm">After speaking to them</label>
            <input id="rDm" type="number" min="1" max="90" value="${esc(s.retry.decisionMakerDays)}" /></div>
          <div class="field"><label for="rMax">Give up after N attempts</label>
            <input id="rMax" type="number" min="1" max="30" value="${esc(s.retry.maxAttempts)}" /></div>
        </div>
        <button class="btn btn--sm" data-save-retry>Save rules</button>
      </section>

      <section class="card">
        <h2 class="sec">Call script</h2>
        <div class="field"><label for="scOpen">Opener</label>
          <textarea id="scOpen">${esc(s.script.opener)}</textarea></div>
        <div class="field"><label for="scNoName">Opener when there is no name</label>
          <textarea id="scNoName">${esc(s.script.noName)}</textarea></div>
        <div class="field"><label for="scDm">If the decision maker answers</label>
          <textarea id="scDm">${esc(s.script.decisionMaker)}</textarea></div>
        <div class="field"><label for="scGk">Gatekeeper</label>
          <textarea id="scGk">${esc(s.script.gatekeeper)}</textarea></div>
        <p style="font-size:12.5px;color:var(--muted);line-height:1.55">
          Merge fields: {{first_name}}, {{company}}, {{location}}, {{sector}}, {{my_name}}, {{marketing_opportunity}}.</p>
        <button class="btn btn--sm" data-save-script style="margin-top:10px">Save script</button>
      </section>

      <section class="card">
        <h2 class="sec">Your details</h2>
        <div class="field"><label for="pName">Name you introduce yourself with</label>
          <input id="pName" value="${esc(s.profile.callerName)}" /></div>
        <div class="field"><label for="pCompany">Company</label>
          <input id="pCompany" value="${esc(s.profile.company)}" /></div>
        <div class="field">
          <label for="pMail">Send email from</label>
          <select id="pMail">
            <option value="outlook"${s.profile.mailClient === 'outlook' ? ' selected' : ''}>Outlook (work / Microsoft 365)</option>
            <option value="outlook-personal"${s.profile.mailClient === 'outlook-personal' ? ' selected' : ''}>Outlook.com (personal)</option>
            <option value="gmail"${s.profile.mailClient === 'gmail' ? ' selected' : ''}>Gmail</option>
            <option value="default"${s.profile.mailClient === 'default' ? ' selected' : ''}>Whatever my computer opens</option>
          </select>
          <small>The big button in the email window opens this one. The others stay available next to it.</small>
        </div>
        <div class="field"><label for="pSig">Email signature</label>
          <textarea id="pSig">${esc(s.profile.signature)}</textarea></div>
        <button class="btn btn--sm" data-save-profile>Save</button>
      </section>
    </div>

    <h2 class="sec">Email templates</h2>
    <div class="set">
      ${meta.templates.map(t => `
        <section class="card" data-tpl="${esc(t.id)}">
          <div class="field"><label>Name</label><input data-f="name" value="${esc(t.name)}" /></div>
          <div class="field"><label>Subject</label><input data-f="subject" value="${esc(t.subject)}" /></div>
          <div class="field"><label>Body</label><textarea data-f="body" style="min-height:150px">${esc(t.body)}</textarea></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn--sm" data-save-tpl="${esc(t.id)}">Save</button>
            <button class="btn btn--ghost btn--sm" data-del-tpl="${esc(t.id)}">Delete</button>
          </div>
        </section>`).join('')}
    </div>
    <button class="btn btn--ghost btn--sm" data-new-tpl style="margin-top:10px">New template</button>

    <h2 class="sec">Excluded companies</h2>
    <div class="card">
      <p style="font-size:13.5px;color:var(--muted);line-height:1.55;margin-bottom:12px">
        Your current clients and anyone else who should never be called. Matching prospects stay in the
        database and are flagged, they just never reach a call list.</p>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input id="exNew" placeholder="Company name" style="flex:1;padding:10px 13px;border:1px solid var(--line-2);border-radius:10px" />
        <button class="btn btn--sm" data-add-ex>Add</button>
      </div>
      <div class="taglist">
        ${meta.exclusions.map(e => `
          <span class="chip">${esc(e.pattern)}<button data-del-ex="${esc(e.id)}" title="Remove">×</button></span>`).join('')}
      </div>
    </div>

    <h2 class="sec">Smart features</h2>
    <div class="card">
      <p style="font-size:13.5px;color:var(--muted);line-height:1.6;margin-bottom:6px">
        Both of these cost money every time they run, so both are off until you turn them on.
        Roughly 30 to 45 US cents an hour of audio for transcription, and about a penny an email for drafting.</p>
      <label class="switch">
        <input type="checkbox" id="aiT" ${s.ai.transcribeEnabled ? 'checked' : ''} ${meta.ai.transcribe.keyed ? '' : 'disabled'} />
        <span><b>Record and transcribe calls</b>
          <small>${meta.ai.transcribe.keyed
            ? 'Records through your microphone during a call, transcribes it, and saves the transcript on the activity. You must tell the other party they are being recorded.'
            : 'Needs ELEVENLABS_API_KEY on the server before it can be switched on.'}</small></span>
      </label>
      <label class="switch">
        <input type="checkbox" id="aiD" ${s.ai.draftEnabled ? 'checked' : ''} ${meta.ai.draft.keyed ? '' : 'disabled'} />
        <span><b>Draft follow-up emails</b>
          <small>${meta.ai.draft.keyed
            ? `Adds "Write it for me" to the email window, which drafts from the call history and transcript. Model: ${esc(meta.ai.model)}.`
            : 'Needs ANTHROPIC_API_KEY on the server before it can be switched on.'}</small></span>
      </label>
      <button class="btn btn--sm" data-save-ai style="margin-top:8px">Save</button>
    </div>

    <h2 class="sec">Security</h2>
    <div class="set">
      <section class="card">
        <h3 style="font-size:15px;font-weight:800;margin-bottom:12px">Change your password</h3>
        <div class="field"><label for="pwCur">Current password</label><input id="pwCur" type="password" autocomplete="current-password" /></div>
        <div class="field"><label for="pwNew">New password (10+ characters)</label><input id="pwNew" type="password" autocomplete="new-password" /></div>
        <button class="btn btn--sm" data-save-pw>Change password</button>
        <p style="font-size:12.5px;color:var(--muted);margin-top:8px">This signs you out everywhere, including here.</p>
      </section>

      <section class="card">
        <h3 style="font-size:15px;font-weight:800;margin-bottom:12px">Quick unlock PIN</h3>
        <p style="font-size:13px;color:var(--muted);line-height:1.55;margin-bottom:12px">
          Locks the screen after ${esc(state.user.lockMinutes)} idle minutes, and with Ctrl+L.
          The PIN only reopens a session you already have, it can never sign you in on its own.</p>
        <div class="field"><label for="pinNew">New PIN (4 to 8 digits, blank to remove)</label>
          <input id="pinNew" inputmode="numeric" maxlength="8" /></div>
        <div class="field"><label for="pinPw">Confirm with your password</label>
          <input id="pinPw" type="password" autocomplete="current-password" /></div>
        <button class="btn btn--sm" data-save-pin>Save PIN</button>
      </section>

      <section class="card">
        <h3 style="font-size:15px;font-weight:800;margin-bottom:12px">Accounts</h3>
        <div class="rows" style="margin-bottom:12px">
          ${meta.users.map(u => `
            <div class="row" style="cursor:default">
              <div class="row__m">
                <div class="row__n">${esc(u.name || u.email)}</div>
                <div class="row__s"><span>${esc(u.email)}</span><span>&middot; ${esc(u.role)}</span>${u.hasPin ? '<span>&middot; PIN set</span>' : ''}</div>
              </div>
            </div>`).join('')}
        </div>
        ${state.user.role === 'owner' ? '<button class="btn btn--ghost btn--sm" data-new-user>Add someone</button>' : ''}
      </section>
    </div>

    <h2 class="sec">Sample data</h2>
    <div class="card">
      <p style="font-size:13.5px;color:var(--muted);line-height:1.6;margin-bottom:12px">
        ${meta.seeded
          ? 'The fictional sample companies are loaded. Clear them before you start calling for real, so nothing invented ends up in your numbers.'
          : 'Twenty invented companies with a worked history, so every screen has something to show. Nothing in it is a real business.'}</p>
      <div style="display:flex;gap:8px">
        ${meta.seeded
          ? '<button class="btn btn--danger btn--sm" data-clear-seed>Remove the sample data</button>'
          : '<button class="btn btn--ghost btn--sm" data-load-seed>Load sample data</button>'}
      </div>
    </div>`;

  wire();
}

/* ----------------------------------------------------------------- wiring */

function wire() {
  const v = id => $(`#${id}`, root).value;
  const on = (sel, fn) => $$(sel, root).forEach(b => { b.onclick = () => fn(b); });

  const save = async (patch, message = 'Saved') => {
    try {
      const out = await api('settings-save', { settings: patch });
      state.settings = out.settings;
      s = out.settings;
      toast(message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
  };

  on('[data-save-targets]', () => save({
    targets: { daily: Number(v('tDaily')) || 100, weekly: Number(v('tWeekly')) || 500 },
  }, 'Targets saved'));

  on('[data-save-retry]', () => save({
    retry: {
      noAnswerDays: Number(v('rNo')) || 2,
      gatekeeperDays: Number(v('rGk')) || 3,
      decisionMakerDays: Number(v('rDm')) || 5,
      maxAttempts: Number(v('rMax')) || 6,
    },
  }, 'Retry rules saved'));

  on('[data-save-script]', () => save({
    script: {
      opener: v('scOpen'), noName: v('scNoName'),
      decisionMaker: v('scDm'), gatekeeper: v('scGk'),
    },
  }, 'Script saved'));

  on('[data-save-profile]', () => save({
    profile: {
      callerName: v('pName'), company: v('pCompany'),
      signature: v('pSig'), mailClient: v('pMail'),
    },
  }));

  on('[data-save-ai]', async () => {
    await save({
      ai: {
        transcribeEnabled: $('#aiT', root).checked,
        draftEnabled: $('#aiD', root).checked,
      },
    });
    await loadSettings(true);
    meta = state.meta;
  });

  /* templates */
  on('[data-save-tpl]', async b => {
    const card = b.closest('[data-tpl]');
    const get = f => $(`[data-f="${f}"]`, card).value;
    await api('template-save', {
      template: { id: b.dataset.saveTpl, name: get('name'), subject: get('subject'), body: get('body') },
    });
    toast('Template saved', 'good');
    render(root);
  });

  on('[data-del-tpl]', async b => {
    const yes = await confirmBox({ title: 'Delete this template?', body: 'It cannot be undone.', confirm: 'Delete', danger: true });
    if (!yes) return;
    await api('template-delete', { id: b.dataset.delTpl });
    render(root);
  });

  on('[data-new-tpl]', async () => {
    await api('template-save', {
      template: { name: 'New template', subject: '{{company}}', body: 'Hi {{first_name}},\n\n\n\n{{signature}}' },
    });
    render(root);
  });

  /* exclusions */
  on('[data-add-ex]', async () => {
    const pattern = $('#exNew', root).value.trim();
    if (!pattern) return;
    try {
      const out = await api('exclusion-add', { pattern });
      toast(out.applied.excluded
        ? `Added. ${out.applied.excluded} matching prospects excluded.`
        : 'Added.', 'good');
      render(root);
    } catch (err) { toast(err.message, 'bad'); }
  });

  on('[data-del-ex]', async b => {
    await api('exclusion-remove', { id: b.dataset.delEx });
    toast('Removed');
    render(root);
  });

  /* security */
  on('[data-save-pw]', async () => {
    try {
      await api('user-password', { current: v('pwCur'), password: v('pwNew') });
      toast('Password changed. Sign in again.', 'good');
      setTimeout(() => { location.href = '/crm'; }, 900);
    } catch (err) { toast(err.message, 'bad'); }
  });

  on('[data-save-pin]', async () => {
    try {
      await api('user-pin', { pin: v('pinNew'), password: v('pinPw') });
      state.user.hasPin = Boolean(v('pinNew'));
      toast(v('pinNew') ? 'PIN saved' : 'PIN removed', 'good');
      render(root);
    } catch (err) { toast(err.message, 'bad'); }
  });

  on('[data-new-user]', async () => {
    const out = await modal({
      html: `<h2>Add someone</h2>
        <p class="sub">They get their own account, their own call list and their own numbers.</p>
        <div class="field"><label for="uEmail">Email</label><input id="uEmail" type="email" autofocus /></div>
        <div class="field"><label for="uName">Name</label><input id="uName" /></div>
        <div class="field"><label for="uPass">Password (10+ characters)</label><input id="uPass" type="text" /></div>
        <div class="modal__f">
          <button class="btn btn--ghost" data-close>Cancel</button>
          <button class="btn" data-save>Create</button>
        </div>`,
      onMount(el, close) {
        $('[data-save]', el).onclick = () => close({
          email: $('#uEmail', el).value.trim(),
          name: $('#uName', el).value.trim(),
          password: $('#uPass', el).value,
        });
      },
    });
    if (!out) return;
    try {
      await api('user-create', out);
      toast('Account created', 'good');
      render(root);
    } catch (err) { toast(err.message, 'bad'); }
  });

  /* sample data */
  on('[data-load-seed]', async () => {
    await api('seed-load');
    toast('Sample data loaded', 'good');
    render(root);
  });

  on('[data-clear-seed]', async () => {
    const yes = await confirmBox({
      title: 'Remove all sample data?',
      body: 'Every invented company, contact, call and follow-up goes. Anything you imported yourself is untouched.',
      confirm: 'Remove it',
      danger: true,
    });
    if (!yes) return;
    await api('seed-clear');
    toast('Sample data removed', 'good');
    render(root);
  });
}
