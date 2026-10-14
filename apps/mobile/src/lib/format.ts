import { parseDayKey } from '@futureflow/core';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const pad = (n: number) => String(n).padStart(2, '0');

/** Time left is rounded down (never promise time you don't have); debt is rounded up (never hide it). */
export function formatDuration(seconds: number): string {
  const minutes = seconds < 0 ? Math.ceil(-seconds / 60) : Math.floor(seconds / 60);
  const sign = seconds < 0 ? '−' : '';
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${sign}${minutes} min` : `${sign}${hours} h ${pad(minutes % 60)} min`;
}

export const localOffsetMinutes = (ms: number): number => -new Date(ms).getTimezoneOffset();

export function formatTime(ms: number, offsetMinutes: number): string {
  const local = new Date(ms + offsetMinutes * 60_000);
  return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

export function formatDayLabel(day: string): string {
  const date = new Date(parseDayKey(day));
  const weekday = WEEKDAYS[date.getUTCDay()] ?? '';
  const month = MONTHS[date.getUTCMonth()] ?? '';
  return `${weekday} ${date.getUTCDate()} ${month}`;
}
