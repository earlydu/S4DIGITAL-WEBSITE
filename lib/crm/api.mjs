// The CRM API. One entry point, one action parameter, written once and used by
// both the Vercel function in /api/crm.mjs and the local dev server.
//
// Only `status`, `login` and `bootstrap` are reachable without a session.
// Everything else fails closed: no session, no data, no exceptions.

import {
  select, count, first, byId, insert, update, updateWhere, remove, nowISO, driver, durable,
} from './db.mjs';
import * as auth from './auth.mjs';
import {
  getSettings, saveSettings, DEFAULT_EXCLUSIONS, CLOSED_STAGES, CONTACT_PRIORITY,
} from './settings.mjs';
import {
  OUTCOMES, buildQueue, getQueue, logOutcome, skipQueueItem, resetQueue,
  createFollowUp, completeFollowUp, rescheduleFollowUp, cancelFollowUp,
  followUpBuckets, refreshNextFollowUp, hydrate, decorate, contactsFor,
  applyExclusions, matchesExclusion,
} from './queue.mjs';
import { dashboard } from './metrics.mjs';
import { FIELDS, analyse, runImport, searchBlob, cleanDomain, phoneKey } from './importer.mjs';
import { seed, clearSeed, isSeeded } from './seed.mjs';
import * as ai from './ai.mjs';
import { today } from './dates.mjs';

const json = (status, body, headers) => ({ status, body, headers: headers || {} });
const ok = (body, headers) => json(200, body || { ok: true }, headers);
const bad = (message, status = 400) => json(status, { error: message });

const PAGE = 50;

/* ------------------------------------------------------------- one-time set-up */

const DEFAULT_TEMPLATES = [
  {
    name: 'After a good call',
    subject: 'Following up - {{company}}',
    body: 'Hi {{first_name}},\n\nThanks for taking my call just now. As promised, here is a bit more on what we do.\n\nWe make the photography and video that shows the work you actually do, and then keep it going month after month so your marketing is not starting from nothing every time.\n\n{{marketing_opportunity}}\n\nWould a short call next week be useful?\n\n{{signature}}',
  },
  {
    name: 'Gatekeeper, could not get through',
    subject: 'Message for {{first_name}} - {{company}}',
    body: 'Hi,\n\nI rang earlier and was asked to send something across for {{first_name}}.\n\nI am Earl at S4Digital. We produce photography and video content for installation and service businesses, and I had one specific thought about {{company}}.\n\n{{marketing_opportunity}}\n\nWho is the best person to speak to about this?\n\n{{signature}}',
  },
  {
    name: 'Left a voicemail',
    subject: 'Tried to reach you - {{company}}',
    body: 'Hi {{first_name}},\n\nI left you a voicemail earlier. Nothing urgent.\n\nI work with installation and service businesses on their photography and video content. Looking at {{company}}, one thing stood out.\n\n{{marketing_opportunity}}\n\nWorth a five minute conversation?\n\n{{signature}}',
  },
  {
    name: 'Meeting confirmation',
    subject: 'Confirmed - {{date}}',
    body: 'Hi {{first_name}},\n\nConfirming our conversation on {{date}}.\n\nNothing to prepare. I will come with a couple of specific ideas for {{company}} and we can see whether any of them are worth doing.\n\n{{signature}}',
  },
];

/** Runs once, the first time the CRM is opened on a fresh database. */
async function ensureDefaults() {
  if (!(await count('exclusions', {}))) {
    for (const pattern of DEFAULT_EXCLUSIONS) {
      await insert('exclusions', { pattern, reason: 'Existing client' });
    }
  }
  if (!(await count('email_templates', {}))) {
    let sort = 0;
    for (const t of DEFAULT_TEMPLATES) {
      await insert('email_templates', { ...t, sort: sort++, updated_at: nowISO() });
    }
  }
}

/* ------------------------------------------------------------------ helpers */

const bool = v => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

/** Turns the UI's filter object into database clauses. */
function prospectWhere(f = {}) {
  const where = [];
  if (!f.includeArchived) where.push({ col: 'archived', op: 'eq', val: 0 });
  if (f.archivedOnly) where.push({ col: 'archived', op: 'eq', val: 1 });
  if (!f.includeExcluded && !f.excludedOnly) where.push({ col: 'excluded', op: 'eq', val: 0 });
  if (f.excludedOnly) where.push({ col: 'excluded', op: 'eq', val: 1 });
  if (f.sector) where.push({ col: 'sector', op: 'eq', val: f.sector });
  if (f.subSector) where.push({ col: 'sub_sector', op: 'like', val: f.subSector });
  if (f.stage) where.push({ col: 'stage', op: 'eq', val: f.stage });
  if (f.quality) where.push({ col: 'lead_quality', op: 'eq', val: f.quality });
  if (f.segment) where.push({ col: 'segment', op: 'eq', val: f.segment });
  if (f.location) where.push({ col: 'location', op: 'like', val: f.location });
  if (f.region) where.push({ col: 'region', op: 'like', val: f.region });
  if (f.assignedTo) where.push({ col: 'assigned_to', op: 'eq', val: f.assignedTo });
  if (f.hasPhone) where.push({ col: 'main_phone', op: 'notnull' });
  if (f.followUpDue) {
    where.push({ col: 'next_follow_up_at', op: 'notnull' });
    where.push({ col: 'next_follow_up_at', op: 'lte', val: f.followUpDue === true ? today() : f.followUpDue });
  }
  if (f.addedAfter) where.push({ col: 'created_at', op: 'gte', val: f.addedAfter });
  if (f.addedBefore) where.push({ col: 'created_at', op: 'lte', val: `${f.addedBefore}T23:59:59.999Z` });
  if (f.contactedAfter) where.push({ col: 'last_contacted_at', op: 'gte', val: f.contactedAfter });
  if (f.notContactedSince) {
    where.push({ or: [
      { col: 'last_contacted_at', op: 'isnull' },
      { col: 'last_contacted_at', op: 'lt', val: f.notContactedSince },
    ] });
  }
  if (f.won) where.push({ col: 'stage', op: 'eq', val: 'Won' });
  if (f.lost) where.push({ col: 'stage', op: 'eq', val: 'Lost' });
  return where;
}

const SEARCH_COLS = ['search_blob'];

const searchOpt = term => (term && String(term).trim()
  ? { cols: SEARCH_COLS, term: String(term).trim().toLowerCase() }
  : null);

/**
 * Filters that need a contact row (named contact, direct email) are applied
 * after the page is fetched, because both databases would otherwise need a join
 * this driver deliberately does not have.
 */
async function applyContactFilters(rows, f) {
  const needs = f.hasNamedContact || f.hasDirectEmail || f.hasDirectPhone;
  const map = await contactsFor(rows.map(r => r.id));
  const decorated = rows.map(r => decorate(r, map.get(r.id) || []));
  if (!needs) return decorated;
  return decorated.filter(r => {
    const c = r.contact;
    if (f.hasNamedContact && !(c && (c.first_name || c.last_name))) return false;
    if (f.hasDirectEmail && !(c && c.direct_email)) return false;
    if (f.hasDirectPhone && !(c && c.direct_phone)) return false;
    return true;
  });
}

/** Company payload from the UI, cleaned and with the derived columns rebuilt. */
function companyPatch(input, contact) {
  const c = { ...input };
  delete c.id; delete c.contacts; delete c.contact; delete c.askFor;
  delete c.created_at; delete c.is_seed;
  if (c.website) c.domain = cleanDomain(c.website);
  if (c.main_phone !== undefined) c.phone_key = phoneKey(c.main_phone);
  if (c.lead_quality) c.lead_quality = String(c.lead_quality).toUpperCase().slice(0, 1);
  c.search_blob = searchBlob({ ...input }, contact);
  return c;
}

/* -------------------------------------------------------------------- router */

export async function handleCrm({ action, req, body, secure }) {
  if (!auth.configured()) {
    return json(503, {
      error: 'The CRM is not switched on. Set CRM_SESSION_SECRET (or ADMIN_PASSWORD) in the environment, then reload.',
    });
  }

  body = body || {};

  /* ---------------------------------------------------------- public actions */

  if (action === 'status') {
    const hasUsers = await auth.anyUsers();
    const user = hasUsers ? await auth.currentUser(req) : null;
    return ok({
      configured: true,
      hasUsers,
      signedIn: Boolean(user),
      user: auth.publicUser(user),
      driver: driver(),
      durable: durable(),
      today: today(),
    });
  }

  if (action === 'bootstrap') {
    // Only usable while there are no accounts at all, and only with the
    // server secret, so a stranger cannot create the first admin.
    if (await auth.anyUsers()) return bad('An account already exists. Sign in instead.', 409);
    const setupKey = process.env.CRM_SETUP_KEY || '';
    if (!setupKey) return bad('Set CRM_SETUP_KEY in the environment, or use "node tools/crm.mjs create-user".', 503);
    if (String(body.setupKey || '') !== setupKey) return bad('That setup key is not right.', 401);
    const user = await auth.createUser({
      email: body.email, name: body.name, password: body.password, pin: body.pin, role: 'owner',
    });
    await ensureDefaults();
    return ok({ ok: true, user: auth.publicUser(user), token: true },
      { 'Set-Cookie': auth.cookieHeader(auth.makeToken(user), { secure }) });
  }

  if (action === 'login') {
    const res = await auth.login({ email: body.email, password: body.password });
    if (res.error) return bad(res.error, 401);
    await ensureDefaults();
    return ok({ user: auth.publicUser(res.user) },
      { 'Set-Cookie': auth.cookieHeader(res.token, { secure }) });
  }

  if (action === 'logout') {
    return ok({ ok: true }, { 'Set-Cookie': auth.cookieHeader('', { secure }) });
  }

  /* ------------------------------------------------------- everything else */

  const user = await auth.currentUser(req);
  if (!user) return bad('Please sign in.', 401);
  const userId = user.id;

  try {
    switch (action) {

      /* -------------------------------------------------------------- session */

      case 'unlock': {
        if (!user.pin_hash) return ok({ ok: true, noPin: true });
        const good = await auth.checkPin(user, body.pin);
        if (!good) return bad('That PIN is not right.', 401);
        return ok({ ok: true });
      }

      case 'signout-everywhere': {
        await auth.signOutEverywhere(userId);
        return ok({ ok: true }, { 'Set-Cookie': auth.cookieHeader('', { secure }) });
      }

      /* ------------------------------------------------------------ dashboard */

      case 'dashboard':
        return ok(await dashboard({ userId, day: body.day || today() }));

      /* ---------------------------------------------------------------- queue */

      case 'queue':
        return ok(await getQueue({ userId, day: body.day || today() }));

      case 'queue-build':
        await buildQueue({ userId, day: body.day || today(), size: body.size });
        return ok(await getQueue({ userId, day: body.day || today() }));

      case 'queue-reset': {
        await resetQueue({ userId, day: body.day || today() });
        return ok(await getQueue({ userId, day: body.day || today() }));
      }

      case 'queue-add': {
        // Puts one prospect at the end of today's list, for "call this now".
        const day = body.day || today();
        const existing = await select('call_queue', {
          where: [
            { col: 'day', op: 'eq', val: day },
            { col: 'user_id', op: 'eq', val: userId },
            { col: 'company_id', op: 'eq', val: body.companyId },
          ],
        });
        if (existing.length) {
          await update('call_queue', existing[0].id, { status: 'pending', completed_at: null });
        } else {
          const n = await count('call_queue', {
            where: [{ col: 'day', op: 'eq', val: day }, { col: 'user_id', op: 'eq', val: userId }],
          });
          await insert('call_queue', {
            day, user_id: userId, company_id: body.companyId,
            position: n + 1, reason: body.reason || 'follow_up', status: 'pending',
          });
        }
        return ok(await getQueue({ userId, day }));
      }

      case 'outcome': {
        if (!OUTCOMES[body.outcome]) return bad(`Unknown outcome: ${body.outcome}`);
        const res = await logOutcome({ ...body, userId });
        return ok(res);
      }

      case 'skip':
        await skipQueueItem({ userId, companyId: body.companyId, day: body.day || today() });
        return ok();

      case 'outcomes':
        return ok({ outcomes: OUTCOMES });

      /* ------------------------------------------------------------ prospects */

      case 'prospects': {
        const f = body.filters || {};
        const where = prospectWhere(f);
        const search = searchOpt(body.q);
        const page = Math.max(0, Number(body.page) || 0);
        const size = Math.min(200, Number(body.size) || PAGE);
        const order = body.sort === 'name'
          ? [{ col: 'name', dir: 'asc' }]
          : body.sort === 'quality'
            ? [{ col: 'lead_quality', dir: 'asc' }, { col: 'name', dir: 'asc' }]
            : body.sort === 'contacted'
              ? [{ col: 'last_contacted_at', dir: 'desc' }]
              : [{ col: 'created_at', dir: 'desc' }];

        const rows = await select('companies', { where, search, order, limit: size, offset: page * size });
        const total = await count('companies', { where, search });
        return ok({ items: await applyContactFilters(rows, f), total, page, size });
      }

      case 'prospect': {
        const company = await byId('companies', body.id);
        if (!company) return bad('Not found', 404);
        const contacts = await select('contacts', {
          where: [{ col: 'company_id', op: 'eq', val: body.id }],
          order: [{ col: 'is_primary', dir: 'desc' }, { col: 'created_at', dir: 'asc' }],
        });
        const activities = await select('activities', {
          where: [{ col: 'company_id', op: 'eq', val: body.id }],
          order: [{ col: 'occurred_at', dir: 'desc' }],
          limit: 200,
        });
        const followUps = await select('follow_ups', {
          where: [{ col: 'company_id', op: 'eq', val: body.id }],
          order: [{ col: 'due_date', dir: 'asc' }],
        });
        const opportunities = await select('opportunities', {
          where: [{ col: 'company_id', op: 'eq', val: body.id }],
          order: [{ col: 'created_at', dir: 'desc' }],
        });
        const meetings = await select('meetings', {
          where: [{ col: 'company_id', op: 'eq', val: body.id }],
          order: [{ col: 'date', dir: 'desc' }],
        });
        return ok({
          company: decorate(company, contacts.filter(c => !c.archived)),
          contacts, activities, followUps, opportunities, meetings,
        });
      }

      case 'prospect-save': {
        const input = body.company || {};
        if (!String(input.name || '').trim()) return bad('A prospect needs a company name.');
        const contact = body.contact || null;
        const patch = companyPatch(input, contact);

        let saved;
        if (body.id) {
          saved = await update('companies', body.id, patch);
        } else {
          const exclusions = await select('exclusions', {});
          const hit = matchesExclusion(input.name, exclusions);
          saved = await insert('companies', {
            ...patch,
            stage: input.stage || 'New',
            call_status: 'new',
            attempts: 0, no_answer_count: 0,
            archived: 0,
            excluded: hit ? 1 : 0,
            exclusion_reason: hit ? `Matches "${hit}"` : null,
            source: input.source || 'manual',
            created_by: userId,
            updated_at: nowISO(),
          });
          await insert('activities', {
            company_id: saved.id, user_id: userId, type: 'system', outcome: 'created',
            note: 'Prospect added', occurred_at: nowISO(),
          });
        }

        if (contact && (contact.first_name || contact.last_name || contact.direct_email || contact.job_title)) {
          if (contact.id) await update('contacts', contact.id, contact);
          else {
            const has = await count('contacts', { where: [{ col: 'company_id', op: 'eq', val: saved.id }] });
            await insert('contacts', {
              ...contact, company_id: saved.id,
              is_primary: has === 0 ? 1 : bool(contact.is_primary),
              archived: 0, updated_at: nowISO(),
            });
          }
        }
        return ok({ company: saved });
      }

      case 'prospect-stage': {
        const company = await byId('companies', body.id);
        if (!company) return bad('Not found', 404);
        const stage = String(body.stage || '');
        const settings = await getSettings();
        if (!settings.stages.includes(stage)) return bad(`Unknown stage: ${stage}`);
        const patch = { stage };
        if (CLOSED_STAGES.includes(stage)) patch.next_attempt_at = null;
        const saved = await update('companies', body.id, patch);
        await insert('activities', {
          company_id: body.id, user_id: userId, type: 'stage', outcome: 'stage_changed',
          note: `${company.stage || 'New'} to ${stage}`, detail: stage, occurred_at: nowISO(),
        });
        return ok({ company: saved });
      }

      case 'prospect-archive': {
        await update('companies', body.id, { archived: bool(body.archived === undefined ? 1 : body.archived) });
        await insert('activities', {
          company_id: body.id, user_id: userId, type: 'system',
          outcome: body.archived === 0 ? 'restored' : 'archived',
          note: body.archived === 0 ? 'Restored from archive' : `Archived${body.reason ? ' - ' + body.reason : ''}`,
          occurred_at: nowISO(),
        });
        return ok();
      }

      case 'prospect-delete': {
        // Permanent, and only ever from the archive. History goes with it.
        const company = await byId('companies', body.id);
        if (!company) return bad('Not found', 404);
        if (!company.archived) return bad('Archive a prospect before deleting it permanently.');
        for (const table of ['activities', 'follow_ups', 'opportunities', 'meetings', 'contacts', 'call_queue']) {
          await remove(table, [{ col: 'company_id', op: 'eq', val: body.id }]);
        }
        await remove('companies', [{ col: 'id', op: 'eq', val: body.id }]);
        return ok();
      }

      case 'prospect-note': {
        const row = await insert('activities', {
          company_id: body.companyId, contact_id: body.contactId || null, user_id: userId,
          type: 'note', outcome: 'note', note: String(body.note || '').slice(0, 4000),
          occurred_at: nowISO(),
        });
        return ok({ activity: row });
      }

      /* ------------------------------------------------------------- contacts */

      case 'contact-save': {
        const c = body.contact || {};
        if (!c.company_id) return bad('A contact needs a company.');
        if (bool(c.is_primary)) {
          await updateWhere('contacts',
            [{ col: 'company_id', op: 'eq', val: c.company_id }], { is_primary: 0 });
        }
        const saved = c.id
          ? await update('contacts', c.id, c)
          : await insert('contacts', { ...c, archived: 0, updated_at: nowISO() });
        return ok({ contact: saved });
      }

      case 'contact-archive':
        await update('contacts', body.id, { archived: bool(body.archived === undefined ? 1 : body.archived) });
        return ok();

      /* ------------------------------------------------------------- pipeline */

      case 'pipeline': {
        const settings = await getSettings();
        const perStage = Math.min(60, Number(body.perStage) || 25);
        const out = {};
        for (const stage of settings.stages) {
          const where = [
            { col: 'stage', op: 'eq', val: stage },
            { col: 'archived', op: 'eq', val: 0 },
          ];
          if (!body.includeExcluded) where.push({ col: 'excluded', op: 'eq', val: 0 });
          const rows = await select('companies', {
            where,
            order: [{ col: 'last_contacted_at', dir: 'desc' }, { col: 'created_at', dir: 'desc' }],
            limit: perStage,
          });
          out[stage] = {
            total: await count('companies', { where }),
            items: await hydrate(rows),
          };
        }
        return ok({ stages: settings.stages, columns: out });
      }

      /* ------------------------------------------------------------ follow-ups */

      case 'followups':
        return ok({ items: await followUpBuckets({ day: body.day || today() }) });

      case 'followup-create':
        return ok({ followUp: await createFollowUp({ userId, ...body }) });

      case 'followup-complete':
        return ok({ followUp: await completeFollowUp({ userId, id: body.id, note: body.note }) });

      case 'followup-reschedule':
        return ok({ followUp: await rescheduleFollowUp(body) });

      case 'followup-cancel':
        return ok({ followUp: await cancelFollowUp(body.id) });

      /* --------------------------------------------------------- opportunities */

      case 'opportunity-save': {
        const o = body.opportunity || {};
        if (!o.company_id) return bad('An opportunity needs a company.');
        const saved = o.id
          ? await update('opportunities', o.id, o)
          : await insert('opportunities', { ...o, updated_at: nowISO() });
        await insert('activities', {
          company_id: o.company_id, user_id: userId, type: 'note', outcome: 'opportunity',
          note: `${o.id ? 'Updated' : 'Created'} opportunity: ${o.service || 'Service'}${o.mrr ? ` - £${o.mrr}/month` : ''}`,
          occurred_at: nowISO(),
        });
        return ok({ opportunity: saved });
      }

      case 'opportunity-delete':
        await remove('opportunities', [{ col: 'id', op: 'eq', val: body.id }]);
        return ok();

      /* -------------------------------------------------------------- meetings */

      case 'meeting-save': {
        const m = body.meeting || {};
        if (!m.company_id || !m.date) return bad('A meeting needs a company and a date.');
        const saved = m.id ? await update('meetings', m.id, m) : await insert('meetings', m);
        if (!m.id) {
          await insert('activities', {
            company_id: m.company_id, user_id: userId, type: 'meeting', outcome: 'meeting_booked',
            note: `Meeting ${m.date}${m.time ? ' at ' + m.time : ''}`, detail: m.kind || '',
            occurred_at: nowISO(),
          });
        }
        return ok({ meeting: saved });
      }

      case 'meeting-delete':
        await remove('meetings', [{ col: 'id', op: 'eq', val: body.id }]);
        return ok();

      /* ---------------------------------------------------------------- import */

      case 'import-fields':
        return ok({ fields: FIELDS });

      case 'import-analyse':
        if (!Array.isArray(body.rows)) return bad('No rows were sent.');
        if (body.rows.length > 20000) return bad('That is more than 20,000 rows. Split the file.');
        return ok(await analyse(body.rows));

      case 'import-run': {
        if (!durable()) return bad('This deployment cannot save. Set the Supabase variables first.', 503);
        if (!Array.isArray(body.rows)) return bad('No rows were sent.');
        const summary = await runImport({
          rows: body.rows, mode: body.mode || 'add',
          filename: body.filename, userId,
        });
        return ok(summary);
      }

      case 'import-history':
        return ok({
          items: await select('imports', { order: [{ col: 'created_at', dir: 'desc' }], limit: 40 }),
        });

      /* ---------------------------------------------------------------- export */

      case 'export': {
        const f = body.filters || {};
        const where = prospectWhere(f);
        const search = searchOpt(body.q);
        const rows = await select('companies', {
          where, search,
          order: [{ col: 'name', dir: 'asc' }],
          limit: Math.min(20000, Number(body.limit) || 5000),
        });
        const map = await contactsFor(rows.map(r => r.id));
        return ok({
          items: rows.map(r => {
            const cs = map.get(r.id) || [];
            const c = cs.find(x => x.is_primary) || cs[0] || {};
            return {
              ...r,
              contact_first_name: c.first_name || '',
              contact_last_name: c.last_name || '',
              job_title: c.job_title || '',
              direct_email: c.direct_email || '',
              direct_phone: c.direct_phone || '',
              linkedin_contact: c.linkedin || '',
            };
          }),
        });
      }

      /* -------------------------------------------------------------- settings */

      case 'settings':
        return ok({
          settings: await getSettings(),
          contactPriority: CONTACT_PRIORITY,
          exclusions: await select('exclusions', { order: [{ col: 'created_at', dir: 'asc' }] }),
          templates: await select('email_templates', { order: [{ col: 'sort', dir: 'asc' }] }),
          users: (await auth.listUsers()).map(auth.publicUser),
          ai: await ai.aiStatus(),
          seeded: await isSeeded(),
          driver: driver(),
          durable: durable(),
        });

      case 'settings-save':
        return ok({ settings: await saveSettings(body.settings || {}) });

      case 'exclusion-add': {
        const pattern = String(body.pattern || '').trim();
        if (!pattern) return bad('Type a company name to exclude.');
        const row = await insert('exclusions', { pattern, reason: body.reason || '' });
        const applied = await applyExclusions();
        return ok({ exclusion: row, applied });
      }

      case 'exclusion-remove': {
        await remove('exclusions', [{ col: 'id', op: 'eq', val: body.id }]);
        const applied = await applyExclusions();
        return ok({ applied });
      }

      case 'exclusions-apply':
        return ok(await applyExclusions());

      /* ------------------------------------------------------------- templates */

      case 'template-save': {
        const t = body.template || {};
        if (!t.name) return bad('A template needs a name.');
        const saved = t.id
          ? await update('email_templates', t.id, t)
          : await insert('email_templates', { ...t, updated_at: nowISO() });
        return ok({ template: saved });
      }

      case 'template-delete':
        await remove('email_templates', [{ col: 'id', op: 'eq', val: body.id }]);
        return ok();

      /* ----------------------------------------------------------------- users */

      case 'user-create': {
        if (user.role !== 'owner' && user.role !== 'admin') return bad('Not allowed.', 403);
        const created = await auth.createUser({
          email: body.email, name: body.name, password: body.password,
          pin: body.pin, role: body.role || 'user',
        });
        return ok({ user: auth.publicUser(created) });
      }

      case 'user-password': {
        const targetId = body.userId && body.userId !== userId ? body.userId : userId;
        if (targetId !== userId && user.role !== 'owner') return bad('Not allowed.', 403);
        if (targetId === userId && !auth.verify(body.current, user.password_hash)) {
          return bad('Your current password is not right.', 401);
        }
        await auth.setPassword(targetId, body.password);
        // Changing your own password invalidates this session too.
        if (targetId === userId) {
          return ok({ ok: true, signedOut: true }, { 'Set-Cookie': auth.cookieHeader('', { secure }) });
        }
        return ok();
      }

      case 'user-pin': {
        if (!auth.verify(body.password, user.password_hash)) {
          return bad('Confirm your password to change the PIN.', 401);
        }
        await auth.setPin(userId, body.pin === '' ? null : body.pin);
        return ok();
      }

      case 'user-disable': {
        if (user.role !== 'owner') return bad('Not allowed.', 403);
        if (body.userId === userId) return bad('You cannot disable your own account.');
        await update('users', body.userId, { active: bool(body.active) });
        return ok();
      }

      /* -------------------------------------------------------------- sample data */

      case 'seed-load':
        if (!durable()) return bad('This deployment cannot save.', 503);
        return ok(await seed({ userId }));

      case 'seed-clear':
        return ok(await clearSeed());

      /* ------------------------------------------------------------------ AI */

      case 'ai-status':
        return ok(await ai.aiStatus());

      case 'ai-transcribe': {
        const out = await ai.transcribe({ base64: body.audio, mimeType: body.mimeType });
        if (body.activityId) await update('activities', body.activityId, { transcript: out.text });
        return ok(out);
      }

      case 'ai-draft':
        return ok(await ai.draftEmail(body));

      case 'ai-summarise':
        return ok(await ai.summariseCall(body));

      /* -------------------------------------------------------------- search */

      case 'search': {
        const term = String(body.q || '').trim();
        if (term.length < 2) return ok({ items: [] });
        const rows = await select('companies', {
          where: [{ col: 'archived', op: 'eq', val: 0 }],
          search: { cols: SEARCH_COLS, term: term.toLowerCase() },
          order: [{ col: 'name', dir: 'asc' }],
          limit: 20,
        });
        return ok({ items: await hydrate(rows) });
      }

      default:
        return bad(`Unknown action: ${action}`);
    }
  } catch (err) {
    return json(err.status && err.status < 500 ? err.status : 500, { error: err.message });
  }
}
