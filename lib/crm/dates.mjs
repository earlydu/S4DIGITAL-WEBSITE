// Dates are plain YYYY-MM-DD strings everywhere in the CRM.
//
// The server may run in UTC while Earl is in London, so "today" is resolved
// against a named timezone rather than the process clock's local offset.
// Storing dates as sortable strings means SQLite and Postgres order them the
// same way with no date type in the middle.

const TZ = process.env.CRM_TIMEZONE || 'Europe/London';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** YYYY-MM-DD for a Date, in the CRM's timezone. */
export const toDay = (d = new Date()) => fmt.format(d);

export const today = () => toDay(new Date());

/** Midday avoids every daylight-saving edge when stepping day by day. */
const parse = day => new Date(`${day}T12:00:00Z`);

export function addDays(day, n) {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 Sunday … 6 Saturday. */
export const weekday = day => parse(day).getUTCDay();

export const isWorkingDay = (day, workingDays = [1, 2, 3, 4, 5]) =>
  workingDays.includes(weekday(day));

/** Steps forward n working days, skipping weekends. */
export function addWorkingDays(day, n, workingDays = [1, 2, 3, 4, 5]) {
  let out = day;
  let left = Math.max(0, Math.round(n));
  if (left === 0) return out;
  while (left > 0) {
    out = addDays(out, 1);
    if (isWorkingDay(out, workingDays)) left -= 1;
  }
  return out;
}

/** Monday of the week containing `day`. The sales week runs Monday to Sunday. */
export function weekStart(day = today()) {
  const dow = weekday(day);
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}

export const weekEnd = (day = today()) => addDays(weekStart(day), 6);

/** Inclusive list of days between two YYYY-MM-DD strings. */
export function daysBetween(from, to) {
  const out = [];
  let d = from;
  let guard = 0;
  while (d <= to && guard++ < 400) { out.push(d); d = addDays(d, 1); }
  return out;
}

/** ISO instant bounds for a day, so activity rows can be filtered by timestamp. */
export const dayStartISO = day => new Date(`${day}T00:00:00Z`).toISOString();
export const dayEndISO = day => new Date(`${addDays(day, 1)}T00:00:00Z`).toISOString();

export const humanDay = day => {
  const t = today();
  if (day === t) return 'Today';
  if (day === addDays(t, 1)) return 'Tomorrow';
  if (day === addDays(t, -1)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(parse(day));
};
