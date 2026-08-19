// The Daily 100 engine, the retry rules, and what an outcome does to a prospect.
//
// The queue is generated, not assigned. Nothing is reserved in advance, so an
// unused day does not burn a hundred leads. Once generated for a day it is
// persisted, which is what keeps "38 of 100" stable while you work through it
// and lets a skipped prospect come back rather than vanish.

import {
  select, count, first, byId, insert, insertMany, update, updateWhere, remove, nowISO,
} from './db.mjs';
import { getSettings, CLOSED_STAGES, CONTACT_PRIORITY } from './settings.mjs';
import { today, addWorkingDays, dayStartISO, dayEndISO } from './dates.mjs';

/* --------------------------------------------------------------- outcomes */

/**
 * Every call outcome, and exactly what it changes. `stage` is the pipeline
 * stage it moves to, `retry` names the settings key for when to try again,
 * `parks` takes the prospect out of the automatic queue entirely.
 */
export const OUTCOMES = {
  no_answer: {
    label: 'No Answer', key: '1', stage: 'Attempted', callStatus: 'no_answer',
    retry: 'noAnswerDays', attempt: true, group: 'attempt',
  },
  gatekeeper: {
    label: 'Gatekeeper', key: '2', stage: 'Attempted', callStatus: 'gatekeeper',
    retry: 'gatekeeperDays', attempt: true, group: 'attempt',
  },
  decision_maker: {
    label: 'Spoke to Decision Maker', key: '3', stage: 'Contacted', callStatus: 'contacted',
    retry: 'decisionMakerDays', attempt: true, reached: true, conversation: true, group: 'conversation',
    prompt: 'followup',
  },
  follow_up: {
    label: 'Follow Up', key: '4', stage: 'Follow Up', callStatus: 'contacted',
    attempt: true, reached: true, conversation: true, group: 'conversation',
    needsFollowUp: true,
  },
  meeting_booked: {
    label: 'Meeting Booked', key: '5', stage: 'Meeting Booked', callStatus: 'contacted',
    attempt: true, reached: true, conversation: true, group: 'conversation',
    needsMeeting: true,
  },
  qualified: {
    label: 'Qualified', stage: 'Qualified', callStatus: 'contacted',
    attempt: true, reached: true, conversation: true, group: 'conversation',
  },
  proposal: {
    label: 'Proposal', stage: 'Proposal', callStatus: 'contacted',
    attempt: true, reached: true, conversation: true, group: 'conversation',
  },
  not_interested: {
    label: 'Not Interested', stage: 'Lost', callStatus: 'not_interested',
    attempt: true, reached: true, conversation: true, group: 'conversation',
    parks: true, closedReason: 'Not interested',
  },
  wrong_number: {
    label: 'Wrong Number', callStatus: 'wrong_number',
    attempt: true, parks: true, group: 'attempt',
  },
  won: {
    label: 'Won', stage: 'Won', callStatus: 'contacted',
    attempt: true, reached: true, conversation: true, group: 'conversation', parks: true,
  },
  lost: {
    label: 'Lost', stage: 'Lost', callStatus: 'contacted',
    attempt: true, reached: true, conversation: true, group: 'conversation',
    parks: true, closedReason: 'Lost',
  },
};

/* ------------------------------------------------------------- exclusions */

const norm = s => String(s || '').toLowerCase().replace(/\b(ltd|limited|plc|llp|uk|group|co)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Substring match both ways, so "TED" catches "TED EV" and vice versa. */
export function matchesExclusion(name, patterns) {
  const n = norm(name);
  if (!n) return null;
  for (const p of patterns) {
    const pn = norm(p.pattern || p);
    if (!pn) continue;
    if (n === pn || n.includes(pn) || pn.includes(n)) return p.pattern || p;
  }
  return null;
}

/** Re-checks every company against the exclusion list. Run after editing it. */
export async function applyExclusions() {
  const patterns = await select('exclusions', {});
  if (!patterns.length) return { excluded: 0, cleared: 0 };
  let excluded = 0;
  let cleared = 0;
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await select('companies', {
      columns: ['id', 'name', 'excluded', 'exclusion_reason'],
      order: [{ col: 'created_at', dir: 'asc' }],
      limit: pageSize, offset,
    });
    if (!page.length) break;
    for (const c of page) {
      const hit = matchesExclusion(c.name, patterns);
      if (hit && !c.excluded) {
        await update('companies', c.id, { excluded: 1, exclusion_reason: `Matches "${hit}"` });
        excluded += 1;
      } else if (!hit && c.excluded && /^Matches "/.test(c.exclusion_reason || '')) {
        await update('companies', c.id, { excluded: 0, exclusion_reason: null });
        cleared += 1;
      }
    }
    if (page.length < pageSize) break;
  }
  return { excluded, cleared };
}

/* ----------------------------------------------------------- eligibility */

/** Clauses shared by every candidate query: never dial these, ever. */
const callableWhere = (settings) => ([
  { col: 'archived', op: 'eq', val: 0 },
  { col: 'excluded', op: 'eq', val: 0 },
  { col: 'stage', op: 'nin', val: CLOSED_STAGES },
  { col: 'call_status', op: 'nin', val: ['wrong_number', 'not_interested'] },
  { col: 'main_phone', op: 'notnull' },
  { col: 'attempts', op: 'lt', val: settings.retry.maxAttempts },
]);

/* -------------------------------------------------------------- scoring */

const REGION_TEXT = c => `${c.region || ''} ${c.location || ''} ${c.postcode || ''} ${c.areas_served || ''}`.toLowerCase();

/** Higher is called sooner. Only used to order brand new prospects. */
export function scoreProspect(company, settings, hasNamedContact, hasDirectPhone) {
  let s = 0;
  const q = String(company.lead_quality || 'C').toUpperCase();
  s += q === 'A' ? 100 : q === 'B' ? 60 : 25;

  const regions = settings.priorityRegions || [];
  const text = REGION_TEXT(company);
  const at = regions.findIndex(r => text.includes(String(r).toLowerCase()));
  if (at === 0) s += 34;                 // London
  else if (at > 0) s += 30 - at * 2;     // the home counties, in the order listed

  if (hasNamedContact) s += 15;
  if (hasDirectPhone) s += 12;
  if (company.marketing_opportunity) s += 12;
  if (company.general_email) s += 3;

  const emp = Number(company.employees || 0);
  if (emp >= 10) s += 8;
  if (emp >= 25) s += 5;
  if (emp >= 60) s += 4;

  if (Number(company.google_reviews || 0) >= 20) s += 5;
  if (Number(company.years_trading || 0) >= 5) s += 5;
  if (Number(company.google_rating || 0) >= 4.5) s += 3;

  const seg = String(company.segment || '').toLowerCase();
  if (seg === 'commercial') s += 7;
  else if (seg === 'both') s += 4;

  if (company.established_evidence) s += 4;
  return s;
}

/* ------------------------------------------------------------- hydration */

/** Contacts for a set of companies, without an N+1 or an overlong URL. */
export async function contactsFor(companyIds) {
  const out = new Map();
  for (let i = 0; i < companyIds.length; i += 80) {
    const chunk = companyIds.slice(i, i + 80);
    if (!chunk.length) continue;
    const rows = await select('contacts', {
      where: [
        { col: 'company_id', op: 'in', val: chunk },
        { col: 'archived', op: 'eq', val: 0 },
      ],
      order: [{ col: 'is_primary', dir: 'desc' }, { col: 'created_at', dir: 'asc' }],
    });
    for (const r of rows) {
      if (!out.has(r.company_id)) out.set(r.company_id, []);
      out.get(r.company_id).push(r);
    }
  }
  return out;
}

const bestTitle = () => CONTACT_PRIORITY[2];   // Managing Director, the safe default ask

/** Company plus its contacts plus the "ask for" line the call card needs. */
export function decorate(company, contacts = []) {
  const primary = contacts.find(c => c.is_primary) || contacts[0] || null;
  const named = primary && (primary.first_name || primary.last_name);
  return {
    ...company,
    contacts,
    contact: primary,
    askFor: named
      ? null
      : (company.ask_for || (Number(company.employees || 0) >= 25 ? 'Marketing Director' : bestTitle())),
  };
}

export async function hydrate(companies) {
  if (!companies.length) return [];
  const map = await contactsFor(companies.map(c => c.id));
  return companies.map(c => decorate(c, map.get(c.id) || []));
}

/* --------------------------------------------------------- queue building */

const REASON_LABEL = {
  follow_up: 'Follow-up due',
  no_answer: 'No answer, retry due',
  gatekeeper: 'Gatekeeper, retry due',
  contacted: 'Spoke to them, retry due',
  skipped: 'Skipped earlier',
  new: 'New prospect',
};

export const reasonLabel = r => REASON_LABEL[r] || 'New prospect';

/**
 * Builds (or tops up) the call list for one day.
 *
 * Priority, highest first:
 *   1  follow-ups due today or overdue
 *   2  no-answer prospects whose retry date has arrived
 *   3  gatekeeper and spoke-to-DM retries
 *   4  new prospects by score (rating, then proximity, then contactability)
 */
export async function buildQueue({ userId, day = today(), size } = {}) {
  const settings = await getSettings();
  const target = size || settings.targets.daily || 100;

  const existing = await select('call_queue', {
    where: [{ col: 'day', op: 'eq', val: day }, { col: 'user_id', op: 'eq', val: userId }],
    order: [{ col: 'position', dir: 'asc' }],
  });
  if (existing.length >= target) return existing;

  const taken = new Set(existing.map(r => r.company_id));
  const picks = [];
  const want = target - existing.length;

  const add = (companyId, reason) => {
    if (taken.has(companyId) || picks.length >= want) return;
    taken.add(companyId);
    picks.push({ companyId, reason });
  };

  const base = callableWhere(settings);

  /* 1. Follow-ups due. These jump every new prospect, always. */
  const due = await select('follow_ups', {
    where: [
      { col: 'status', op: 'eq', val: 'pending' },
      { col: 'due_date', op: 'lte', val: day },
    ],
    order: [{ col: 'due_date', dir: 'asc' }, { col: 'due_time', dir: 'asc' }],
    limit: want * 2,
  });
  if (due.length) {
    const ids = [...new Set(due.map(f => f.company_id))];
    const eligible = new Set();
    for (let i = 0; i < ids.length; i += 80) {
      const rows = await select('companies', {
        columns: ['id'],
        where: [...base, { col: 'id', op: 'in', val: ids.slice(i, i + 80) }],
      });
      rows.forEach(r => eligible.add(r.id));
    }
    for (const f of due) if (eligible.has(f.company_id)) add(f.company_id, 'follow_up');
  }

  /* 2 and 3. Retries whose date has come round. */
  if (picks.length < want) {
    const retries = await select('companies', {
      where: [
        ...base,
        { col: 'next_attempt_at', op: 'notnull' },
        { col: 'next_attempt_at', op: 'lte', val: day },
      ],
      order: [{ col: 'call_status', dir: 'asc' }, { col: 'next_attempt_at', dir: 'asc' }],
      limit: want,
    });
    // no_answer sorts before gatekeeper alphabetically, which is the order we want anyway.
    for (const c of retries) add(c.id, c.call_status || 'no_answer');
  }

  /* 4. New prospects, scored. */
  if (picks.length < want) {
    const pool = await select('companies', {
      where: [
        ...base,
        { col: 'stage', op: 'in', val: ['New', 'To Call'] },
        { col: 'next_attempt_at', op: 'isnull' },
      ],
      order: [{ col: 'lead_quality', dir: 'asc' }, { col: 'created_at', dir: 'asc' }],
      limit: Math.min(600, Math.max(200, want * 5)),
    });
    const fresh = pool.filter(c => !taken.has(c.id));
    const contacts = await contactsFor(fresh.slice(0, 400).map(c => c.id));
    const scored = fresh.map(c => {
      const cs = contacts.get(c.id) || [];
      const primary = cs.find(x => x.is_primary) || cs[0];
      const named = Boolean(primary && (primary.first_name || primary.last_name));
      const directPhone = Boolean(primary && primary.direct_phone);
      return { c, score: scoreProspect(c, settings, named, directPhone) };
    }).sort((a, b) => b.score - a.score);
    for (const { c } of scored) add(c.id, 'new');
  }

  if (!picks.length) return existing;

  const startAt = existing.length;
  const rows = picks.map((p, i) => ({
    day,
    user_id: userId,
    company_id: p.companyId,
    position: startAt + i + 1,
    reason: p.reason,
    status: 'pending',
  }));
  const written = await insertMany('call_queue', rows);
  return [...existing, ...written];
}

/** The day's queue with companies and contacts attached, ready to render. */
export async function getQueue({ userId, day = today(), build = true } = {}) {
  let rows = await select('call_queue', {
    where: [{ col: 'day', op: 'eq', val: day }, { col: 'user_id', op: 'eq', val: userId }],
    order: [{ col: 'position', dir: 'asc' }],
  });
  if (build && !rows.length) rows = await buildQueue({ userId, day });

  const ids = rows.map(r => r.company_id);
  const companies = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    if (!chunk.length) continue;
    const page = await select('companies', { where: [{ col: 'id', op: 'in', val: chunk }] });
    page.forEach(c => companies.set(c.id, c));
  }
  const contacts = await contactsFor(ids);

  const items = rows
    .filter(r => companies.has(r.company_id))
    .map(r => ({
      queueId: r.id,
      position: r.position,
      reason: r.reason,
      reasonLabel: reasonLabel(r.reason),
      status: r.status,
      company: decorate(companies.get(r.company_id), contacts.get(r.company_id) || []),
    }));

  return {
    day,
    items,
    total: items.length,
    done: items.filter(i => i.status === 'done').length,
    skipped: items.filter(i => i.status === 'skipped').length,
  };
}

/* ---------------------------------------------------------- logging a call */

/**
 * One outcome click. Writes history, moves the prospect, schedules the retry,
 * marks the queue row, and optionally creates the follow-up or meeting.
 * Nothing here overwrites history: activities are only ever appended.
 */
export async function logOutcome({
  userId, companyId, contactId, outcome, note, followUp, meeting, opportunity,
  durationS, recordingUrl, transcript, day = today(),
}) {
  const rule = OUTCOMES[outcome];
  if (!rule) throw new Error(`Unknown outcome: ${outcome}`);

  const company = await byId('companies', companyId);
  if (!company) throw new Error('That prospect no longer exists.');

  const settings = await getSettings();
  const stamp = nowISO();

  const activity = await insert('activities', {
    company_id: companyId,
    contact_id: contactId || (company.contact_id || null),
    user_id: userId,
    type: 'call',
    outcome,
    note: note || '',
    detail: rule.label,
    duration_s: durationS || null,
    recording_url: recordingUrl || null,
    transcript: transcript || null,
    occurred_at: stamp,
  });

  const patch = {
    last_contacted_at: stamp,
    attempts: Number(company.attempts || 0) + (rule.attempt ? 1 : 0),
    call_status: rule.callStatus || company.call_status,
  };
  if (rule.stage) patch.stage = rule.stage;
  if (rule.closedReason) patch.closed_reason = rule.closedReason;
  if (outcome === 'no_answer') patch.no_answer_count = Number(company.no_answer_count || 0) + 1;

  if (rule.parks) {
    patch.next_attempt_at = null;
  } else if (rule.retry) {
    const days = settings.retry[rule.retry] || 2;
    patch.next_attempt_at = addWorkingDays(day, days, settings.targets.workingDays);
  }

  /* A follow-up overrides any retry date: the date you chose wins. */
  let createdFollowUp = null;
  if (followUp && followUp.date) {
    createdFollowUp = await createFollowUp({
      userId, companyId, contactId,
      date: followUp.date, time: followUp.time, kind: followUp.kind, note: followUp.note || note,
    });
    patch.next_follow_up_at = followUp.date;
    patch.next_attempt_at = null;
  }

  let createdMeeting = null;
  if (meeting && meeting.date) {
    createdMeeting = await insert('meetings', {
      company_id: companyId, contact_id: contactId || null,
      date: meeting.date, time: meeting.time || '', kind: meeting.kind || 'Call',
      notes: meeting.notes || '',
    });
    await insert('activities', {
      company_id: companyId, contact_id: contactId || null, user_id: userId,
      type: 'meeting', outcome: 'meeting_booked',
      note: `Meeting ${meeting.date}${meeting.time ? ' at ' + meeting.time : ''}`,
      detail: meeting.kind || 'Call', occurred_at: stamp,
    });
  }

  let createdOpportunity = null;
  if (opportunity && (opportunity.service || opportunity.mrr || opportunity.one_off)) {
    createdOpportunity = await insert('opportunities', {
      company_id: companyId, contact_id: contactId || null,
      service: opportunity.service || 'Content Retainer',
      mrr: opportunity.mrr || 0, one_off: opportunity.one_off || 0,
      close_date: opportunity.close_date || '', probability: opportunity.probability || 30,
      stage: rule.stage || company.stage, notes: opportunity.notes || '',
      updated_at: stamp,
    });
  }

  const updated = await update('companies', companyId, patch);

  await updateWhere('call_queue',
    [
      { col: 'day', op: 'eq', val: day },
      { col: 'user_id', op: 'eq', val: userId },
      { col: 'company_id', op: 'eq', val: companyId },
      { col: 'status', op: 'eq', val: 'pending' },
    ],
    { status: 'done', completed_at: stamp });

  return { activity, company: updated, followUp: createdFollowUp, meeting: createdMeeting, opportunity: createdOpportunity };
}

/** Skipped is not lost: the row stays, and the prospect returns tomorrow. */
export async function skipQueueItem({ userId, companyId, day = today() }) {
  return updateWhere('call_queue',
    [
      { col: 'day', op: 'eq', val: day },
      { col: 'user_id', op: 'eq', val: userId },
      { col: 'company_id', op: 'eq', val: companyId },
      { col: 'status', op: 'eq', val: 'pending' },
    ],
    { status: 'skipped', completed_at: nowISO() });
}

/* ----------------------------------------------------------- follow-ups */

export async function createFollowUp({ userId, companyId, contactId, date, time, kind, note }) {
  const row = await insert('follow_ups', {
    company_id: companyId,
    contact_id: contactId || null,
    user_id: userId,
    due_date: date,
    due_time: time || '',
    kind: kind || 'call',
    note: note || '',
    status: 'pending',
    updated_at: nowISO(),
  });
  await insert('activities', {
    company_id: companyId, contact_id: contactId || null, user_id: userId,
    type: 'note', outcome: 'follow_up_set',
    note: `Follow-up set for ${date}${time ? ' at ' + time : ''}${note ? ' - ' + note : ''}`,
    detail: kind || 'call', occurred_at: nowISO(),
  });
  await refreshNextFollowUp(companyId);
  return row;
}

/** Keeps companies.next_follow_up_at in step with the earliest pending follow-up. */
export async function refreshNextFollowUp(companyId) {
  const next = await first('follow_ups', {
    where: [
      { col: 'company_id', op: 'eq', val: companyId },
      { col: 'status', op: 'eq', val: 'pending' },
    ],
    order: [{ col: 'due_date', dir: 'asc' }],
  });
  await update('companies', companyId, { next_follow_up_at: next ? next.due_date : null });
  return next;
}

export async function completeFollowUp({ userId, id, note }) {
  const row = await byId('follow_ups', id);
  if (!row) throw new Error('That follow-up has gone.');
  await update('follow_ups', id, { status: 'done', completed_at: nowISO() });
  await insert('activities', {
    company_id: row.company_id, contact_id: row.contact_id, user_id: userId,
    type: row.kind === 'call' ? 'call' : (row.kind || 'note'),
    outcome: 'follow_up_done',
    note: note || `Follow-up completed${row.note ? ' - ' + row.note : ''}`,
    occurred_at: nowISO(),
  });
  await refreshNextFollowUp(row.company_id);
  return row;
}

export async function rescheduleFollowUp({ id, date, time, note }) {
  const row = await byId('follow_ups', id);
  if (!row) throw new Error('That follow-up has gone.');
  const out = await update('follow_ups', id, {
    due_date: date, due_time: time || '', note: note !== undefined ? note : row.note,
  });
  await refreshNextFollowUp(row.company_id);
  return out;
}

export async function cancelFollowUp(id) {
  const row = await byId('follow_ups', id);
  if (!row) return null;
  await update('follow_ups', id, { status: 'cancelled', completed_at: nowISO() });
  await refreshNextFollowUp(row.company_id);
  return row;
}

/** Overdue / today / tomorrow / this week / later, for the Follow Ups page. */
export async function followUpBuckets({ day = today(), limit = 400 } = {}) {
  const rows = await select('follow_ups', {
    where: [{ col: 'status', op: 'eq', val: 'pending' }],
    order: [{ col: 'due_date', dir: 'asc' }, { col: 'due_time', dir: 'asc' }],
    limit,
  });
  const ids = [...new Set(rows.map(r => r.company_id))];
  const companies = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    if (!chunk.length) continue;
    const page = await select('companies', { where: [{ col: 'id', op: 'in', val: chunk }] });
    page.forEach(c => companies.set(c.id, c));
  }
  const contacts = await contactsFor(ids);
  return rows
    .filter(r => companies.has(r.company_id))
    .map(r => ({ ...r, company: decorate(companies.get(r.company_id), contacts.get(r.company_id) || []) }));
}

/* ------------------------------------------------------------- housekeeping */

/** Removes a day's generated list so it rebuilds from scratch. */
export const resetQueue = ({ userId, day = today() }) =>
  remove('call_queue', [
    { col: 'day', op: 'eq', val: day },
    { col: 'user_id', op: 'eq', val: userId },
    { col: 'status', op: 'eq', val: 'pending' },
  ]);

export const queueCounts = async ({ userId, day = today() }) => ({
  total: await count('call_queue', {
    where: [{ col: 'day', op: 'eq', val: day }, { col: 'user_id', op: 'eq', val: userId }],
  }),
  done: await count('call_queue', {
    where: [
      { col: 'day', op: 'eq', val: day },
      { col: 'user_id', op: 'eq', val: userId },
      { col: 'status', op: 'eq', val: 'done' },
    ],
  }),
});

export { dayStartISO, dayEndISO };
