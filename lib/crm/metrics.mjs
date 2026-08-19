// Dashboard numbers.
//
// Aggregation happens in JS over a bounded set of rows rather than in SQL.
// At 500 calls a week the week's activity is a couple of thousand rows at most,
// which is nothing to fetch, and it means SQLite and Postgres cannot disagree
// about what a conversion rate is. If the volume ever grows past that, this is
// the one file that would move to a database view.

import { select, count } from './db.mjs';
import { getSettings, sectorGroup, CLOSED_STAGES, STAGE } from './settings.mjs';
import { today, weekStart, weekEnd, dayStartISO, dayEndISO, addDays } from './dates.mjs';
import { OUTCOMES } from './queue.mjs';

const CONVERSATION = new Set(
  Object.entries(OUTCOMES).filter(([, r]) => r.conversation).map(([k]) => k)
);
const REACHED = new Set(
  Object.entries(OUTCOMES).filter(([, r]) => r.reached).map(([k]) => k)
);

const emptyTally = () => ({
  attempts: 0, calls: 0, uniqueBusinesses: 0,
  decisionMakers: 0, conversations: 0,
  followUps: 0, meetings: 0, proposals: 0, won: 0, lost: 0,
  noAnswer: 0, gatekeeper: 0, notInterested: 0, qualified: 0, wrongNumber: 0,
});

function tally(activities) {
  const t = emptyTally();
  const seen = new Set();
  for (const a of activities) {
    if (a.type !== 'call') continue;
    t.attempts += 1;
    t.calls += 1;
    seen.add(a.company_id);
    const o = a.outcome;
    if (REACHED.has(o)) t.decisionMakers += 1;
    if (CONVERSATION.has(o)) t.conversations += 1;
    if (o === 'no_answer') t.noAnswer += 1;
    if (o === 'gatekeeper') t.gatekeeper += 1;
    if (o === 'follow_up') t.followUps += 1;
    if (o === 'meeting_booked') t.meetings += 1;
    if (o === 'proposal') t.proposals += 1;
    if (o === 'qualified') t.qualified += 1;
    if (o === 'won') t.won += 1;
    if (o === 'lost') t.lost += 1;
    if (o === 'not_interested') t.notInterested += 1;
    if (o === 'wrong_number') t.wrongNumber += 1;
  }
  t.uniqueBusinesses = seen.size;
  return t;
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

const rates = t => ({
  callsToConversations: pct(t.conversations, t.calls),
  conversationsToMeetings: pct(t.meetings, t.conversations),
  meetingsToProposals: pct(t.proposals, t.meetings),
  proposalsToWon: pct(t.won, t.proposals),
});

/** Activities in a date range, paged so one busy week cannot blow a request. */
async function activitiesBetween(fromDay, toDay) {
  const out = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 20000; offset += pageSize) {
    const page = await select('activities', {
      where: [
        { col: 'occurred_at', op: 'gte', val: dayStartISO(fromDay) },
        { col: 'occurred_at', op: 'lt', val: dayEndISO(toDay) },
      ],
      order: [{ col: 'occurred_at', dir: 'asc' }],
      limit: pageSize, offset,
    });
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

/** Sector for each company touched this week, fetched once. */
async function sectorsFor(companyIds) {
  const map = new Map();
  const ids = [...new Set(companyIds)];
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    if (!chunk.length) continue;
    const rows = await select('companies', {
      columns: ['id', 'sector'],
      where: [{ col: 'id', op: 'in', val: chunk }],
    });
    rows.forEach(r => map.set(r.id, r.sector));
  }
  return map;
}

export async function dashboard({ userId, day = today() } = {}) {
  const settings = await getSettings();
  const wStart = weekStart(day);
  const wEnd = weekEnd(day);

  const week = await activitiesBetween(wStart, wEnd);
  const todays = week.filter(a => a.occurred_at >= dayStartISO(day) && a.occurred_at < dayEndISO(day));

  const todayTally = tally(todays);
  const weekTally = tally(week);

  /* Queue progress for today */
  const assigned = await count('call_queue', {
    where: [{ col: 'day', op: 'eq', val: day }, { col: 'user_id', op: 'eq', val: userId }],
  });
  const completed = await count('call_queue', {
    where: [
      { col: 'day', op: 'eq', val: day },
      { col: 'user_id', op: 'eq', val: userId },
      { col: 'status', op: 'eq', val: 'done' },
    ],
  });

  /* By sector, this week */
  const sectors = await sectorsFor(week.map(a => a.company_id));
  const bySector = {};
  for (const a of week) {
    if (a.type !== 'call') continue;
    const g = sectorGroup(sectors.get(a.company_id));
    if (!bySector[g]) bySector[g] = emptyTally();
    const t = bySector[g];
    t.calls += 1; t.attempts += 1;
    if (REACHED.has(a.outcome)) t.decisionMakers += 1;
    if (CONVERSATION.has(a.outcome)) t.conversations += 1;
    if (a.outcome === 'meeting_booked') t.meetings += 1;
    if (a.outcome === 'proposal') t.proposals += 1;
    if (a.outcome === 'won') t.won += 1;
    if (a.outcome === 'lost') t.lost += 1;
  }
  for (const g of Object.keys(bySector)) bySector[g].rates = rates(bySector[g]);

  /* Money. Open pipeline versus what has actually been won. */
  const opps = await select('opportunities', { limit: 2000 });
  const openOpps = opps.filter(o => !CLOSED_STAGES.includes(o.stage));
  const wonOpps = opps.filter(o => o.stage === STAGE.WON);
  const sum = (rows, k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const wonThisWeek = wonOpps.filter(o => (o.updated_at || o.created_at || '') >= dayStartISO(wStart));

  /* Pipeline counts per stage, for the dashboard strip */
  const stageCounts = {};
  for (const stage of settings.stages) {
    stageCounts[stage] = await count('companies', {
      where: [
        { col: 'stage', op: 'eq', val: stage },
        { col: 'archived', op: 'eq', val: 0 },
      ],
    });
  }

  /* Daily bars for the week */
  const perDay = [];
  for (let d = wStart; d <= wEnd; d = addDays(d, 1)) {
    const rows = week.filter(a => a.occurred_at >= dayStartISO(d) && a.occurred_at < dayEndISO(d));
    perDay.push({ day: d, ...tally(rows) });
  }

  const totals = {
    prospects: await count('companies', { where: [{ col: 'archived', op: 'eq', val: 0 }] }),
    callable: await count('companies', {
      where: [
        { col: 'archived', op: 'eq', val: 0 },
        { col: 'excluded', op: 'eq', val: 0 },
        { col: 'stage', op: 'nin', val: CLOSED_STAGES },
      ],
    }),
    excluded: await count('companies', { where: [{ col: 'excluded', op: 'eq', val: 1 }] }),
    followUpsDue: await count('follow_ups', {
      where: [
        { col: 'status', op: 'eq', val: 'pending' },
        { col: 'due_date', op: 'lte', val: day },
      ],
    }),
  };

  return {
    day,
    week: { start: wStart, end: wEnd },
    targets: settings.targets,
    today: {
      ...todayTally,
      assigned,
      completed,
      remaining: Math.max(0, assigned - completed),
      rates: rates(todayTally),
    },
    thisWeek: {
      ...weekTally,
      rates: rates(weekTally),
      pipelineMrr: sum(openOpps, 'mrr'),
      pipelineOneOff: sum(openOpps, 'one_off'),
      wonMrr: sum(wonOpps, 'mrr'),
      wonMrrThisWeek: sum(wonThisWeek, 'mrr'),
      wonOneOffThisWeek: sum(wonThisWeek, 'one_off'),
    },
    bySector,
    perDay,
    stageCounts,
    totals,
  };
}
