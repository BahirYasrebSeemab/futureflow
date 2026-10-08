/** Calendar day in the owner's local time, shifted so the day starts at the boundary hour. */
export type DayKey = string;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const toKey = (utcMs: number): DayKey => new Date(utcMs).toISOString().slice(0, 10);

export function dayKeyFor(atMs: number, utcOffsetMinutes: number, boundaryHour: number): DayKey {
  if (!Number.isFinite(atMs) || !Number.isFinite(utcOffsetMinutes)) {
    throw new RangeError('dayKeyFor needs finite inputs');
  }
  return toKey(atMs + utcOffsetMinutes * MS_PER_MINUTE - boundaryHour * MS_PER_HOUR);
}

export function parseDayKey(key: DayKey): number {
  const match = DAY_KEY_PATTERN.exec(key);
  if (!match) throw new RangeError(`invalid day key: ${key}`);
  const [, year, month, day] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (toKey(ms) !== key) throw new RangeError(`invalid day key: ${key}`);
  return ms;
}

export const weekdayOf = (key: DayKey): number => new Date(parseDayKey(key)).getUTCDay();

/** ISO-8601 week: weeks start Monday; week 1 contains the year's first Thursday. */
export function isoWeekKey(key: DayKey): string {
  const ms = parseDayKey(key);
  const daysSinceMonday = (weekdayOf(key) + 6) % DAYS_PER_WEEK;
  const thursdayMs = ms + (3 - daysSinceMonday) * MS_PER_DAY;
  const year = new Date(thursdayMs).getUTCFullYear();
  const dayOfYearIndex = (thursdayMs - Date.UTC(year, 0, 1)) / MS_PER_DAY;
  const week = Math.floor(dayOfYearIndex / DAYS_PER_WEEK) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export const monthKey = (key: DayKey): string => {
  parseDayKey(key);
  return key.slice(0, 7);
};

export const addDays = (key: DayKey, days: number): DayKey =>
  toKey(parseDayKey(key) + days * MS_PER_DAY);
