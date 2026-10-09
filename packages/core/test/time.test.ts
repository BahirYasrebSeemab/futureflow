import { describe, expect, it } from 'vitest';
import { addDays, dayKeyFor, isoWeekKey, monthKey, parseDayKey, weekdayOf } from '../src/time';

const TORONTO_EDT = -240;
const DUSHANBE = 300;
const BOUNDARY = 4;

describe('dayKeyFor', () => {
  it('counts 03:59 local as the previous day', () => {
    expect(dayKeyFor(Date.UTC(2026, 9, 8, 7, 59), TORONTO_EDT, BOUNDARY)).toBe('2026-10-07');
  });

  it('starts the new day at exactly 04:00 local', () => {
    expect(dayKeyFor(Date.UTC(2026, 9, 8, 8, 0), TORONTO_EDT, BOUNDARY)).toBe('2026-10-08');
  });

  it('maps the same instant to different days in different timezones', () => {
    const instant = Date.UTC(2026, 9, 7, 23, 0); // 04:00 in Dushanbe, 19:00 in Toronto
    expect(dayKeyFor(instant, DUSHANBE, BOUNDARY)).toBe('2026-10-08');
    expect(dayKeyFor(instant, TORONTO_EDT, BOUNDARY)).toBe('2026-10-07');
  });

  it('rejects non-finite instants and offsets', () => {
    expect(() => dayKeyFor(Number.NaN, 0, BOUNDARY)).toThrow(RangeError);
    expect(() => dayKeyFor(0, Number.NaN, BOUNDARY)).toThrow(RangeError);
  });
});

describe('parseDayKey', () => {
  it('returns UTC midnight for a valid key', () => {
    expect(parseDayKey('2026-10-08')).toBe(Date.UTC(2026, 9, 8));
  });

  it.each(['2026-02-30', '2026-1-05', 'yesterday', ''])('rejects %j', (key) => {
    expect(() => parseDayKey(key)).toThrow(RangeError);
  });
});

describe('calendar helpers', () => {
  it('weekdayOf uses 0 = Sunday', () => {
    expect(weekdayOf('2026-10-08')).toBe(4);
    expect(weekdayOf('2026-10-11')).toBe(0);
  });

  it.each([
    ['2026-01-01', '2026-W01'],
    ['2024-12-30', '2025-W01'],
    ['2026-10-08', '2026-W41'],
    ['2026-10-11', '2026-W41'],
    ['2026-10-12', '2026-W42'],
    ['2027-01-01', '2026-W53'],
  ])('isoWeekKey(%s) = %s', (key, week) => {
    expect(isoWeekKey(key)).toBe(week);
  });

  it('monthKey returns YYYY-MM', () => {
    expect(monthKey('2026-10-08')).toBe('2026-10');
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-10-08', 1)).toBe('2026-10-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
