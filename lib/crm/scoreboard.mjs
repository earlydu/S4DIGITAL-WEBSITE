// The scoreboard.
//
// Cold calling gives you almost no feedback: most calls end in nothing, and the
// wins are weeks apart. So this scores the things you control - dials made,
// humans reached, conversations had - rather than only the outcomes you do not.
// Hormozi's point about volume negating luck only helps if the volume is visible.
//
// Nothing here changes what the CRM does. It is a read-only view over activities
// that already exist, so it can never distort the numbers it is counting.

import { select, count } from './db.mjs';
import { getSettings } from './settings.mjs';
import { today, addDays, weekStart, dayStartISO, dayEndISO, isWorkingDay } from './dates.mjs';

/** What each outcome is worth. Weighted towards the things that move a deal. */
export const POINTS = {
  no_answer: 1,
  wrong_number: 1,
  gatekeeper: 2,
  decision_maker: 5,
  follow_up: 8,
  not_interested: 3,      // a clean no is worth more than a maybe you never chase
  qualified: 15,
  meeting_booked: 25,
  proposal: 30,
  won: 100,
  lost: 3,
};

/** Milestones as a fraction of the daily target, so they scale if you change it. */
const MILESTONES = [0.1, 0.25, 0.5, 0.75, 1];

export const RANKS = [
  { at: 0, name: 'Warming up' },
  { at: 150, name: 'Dialled in' },
  { at: 400, name: 'On a roll' },
  { at: 800, name: 'Closer' },
  { at: 1500, name: 'Machine' },
];

const rankFor = points => [...RANKS].reverse().find(r => points >= r.at) || RANKS[0];

const scoreOf = activities => activities.reduce(
  (n, a) => n + (a.type === 'call' ? (POINTS[a.outcome] || 1) : 0), 0
);

/**
 * How far through the calling day you should be by now, 9am to 5pm.
 * Used to say "ahead" or "behind" rather than just showing a total.
 */
function expectedByNow(target, day) {
  if (day !== today()) return target;
  const now = new Date();
  const hours = now.getHours() + now.getMinutes() / 60;
  const start = 9;
  const end = 17;
  if (hours <= start) return 0;
  if (hours >= end) return target;
  return Math.round(target * ((hours - start) / (end - start)));
}

async function callsOn(day) {
  const rows = await select('activities', {
    where: [
      { col: 'type', op: 'eq', val: 'call' },
      { col: 'occurred_at', op: 'gte', val: dayStartISO(day) },
      { col: 'occurred_at', op: 'lt', val: dayEndISO(day) },
    ],
    columns: ['id', 'outcome', 'occurred_at', 'type'],
    limit: 1000,
  });
  return rows;
}

/**
 * Consecutive working days, ending today or yesterday, where the day's calls
 * met the target. Today only counts once it is actually hit, so the streak
 * never flatters you mid-morning, but it also does not break until tomorrow.
 */
async function streakOf(target, workingDays) {
  let streak = 0;
  let day = today();
  let checked = 0;

  // If today is not done yet, start counting from yesterday instead of zeroing.
  const todayCalls = (await callsOn(day)).length;
  if (todayCalls >= target) streak += 1;
  day = addDays(day, -1);

  while (checked < 60) {
    checked += 1;
    if (!isWorkingDay(day, workingDays)) { day = addDays(day, -1); continue; }
    const n = (await callsOn(day)).length;
    if (n >= target) { streak += 1; day = addDays(day, -1); continue; }
    break;
  }
  return streak;
}

/** Best single day, over the last eight weeks. */
async function personalBest(workingDays) {
  let best = { day: null, calls: 0 };
  let day = today();
  for (let i = 0; i < 56; i += 1) {
    if (isWorkingDay(day, workingDays)) {
      const n = (await callsOn(day)).length;
      if (n > best.calls) best = { day, calls: n };
    }
    day = addDays(day, -1);
  }
  return best;
}

/**
 * @param {object} opts
 * @param {boolean} opts.deep  include streak and personal best. They cost a query
 *                             per day, so the calling screen skips them.
 */
export async function scoreboard({ day = today(), deep = false } = {}) {
  const settings = await getSettings();
  const target = settings.targets.daily || 100;
  const workingDays = settings.targets.workingDays || [1, 2, 3, 4, 5];

  const todays = await callsOn(day);
  const calls = todays.length;
  const points = scoreOf(todays);

  const wStart = weekStart(day);
  const weekRows = await select('activities', {
    where: [
      { col: 'type', op: 'eq', val: 'call' },
      { col: 'occurred_at', op: 'gte', val: dayStartISO(wStart) },
      { col: 'occurred_at', op: 'lt', val: dayEndISO(day) },
    ],
    columns: ['id', 'outcome', 'type'],
    limit: 4000,
  });

  const expected = expectedByNow(target, day);
  const nextMilestone = MILESTONES
    .map(m => Math.round(target * m))
    .find(n => n > calls) || null;

  const out = {
    day,
    target,
    calls,
    points,
    rank: rankFor(points).name,
    nextRank: RANKS.find(r => r.at > points) || null,
    weekPoints: scoreOf(weekRows),
    weekCalls: weekRows.length,
    weekTarget: settings.targets.weekly || 500,
    expectedByNow: expected,
    pace: calls - expected,                 // positive is ahead of the clock
    nextMilestone,
    toNextMilestone: nextMilestone ? nextMilestone - calls : 0,
    milestones: MILESTONES.map(m => ({ at: Math.round(target * m), hit: calls >= Math.round(target * m) })),
  };

  if (deep) {
    out.streak = await streakOf(target, workingDays);
    out.best = await personalBest(workingDays);
  }
  return out;
}
