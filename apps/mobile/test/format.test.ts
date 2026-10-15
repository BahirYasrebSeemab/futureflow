import {
  currentDayKey,
  formatDayLabel,
  formatDuration,
  formatTime,
  localOffsetMinutes,
} from '@/lib/format';

test.each([
  [0, '0 min'],
  [59, '0 min'],
  [60, '1 min'],
  [3599, '59 min'],
  [3600, '1 h 00 min'],
  [3900, '1 h 05 min'],
  [-1, '−1 min'],
  [-30, '−1 min'],
  [-3660, '−1 h 01 min'],
])('formatDuration(%i) is %s: time left rounds down, debt rounds up', (seconds, text) => {
  expect(formatDuration(seconds)).toBe(text);
});

test('formatTime shows the local wall clock for an offset', () => {
  expect(formatTime(Date.UTC(2026, 9, 14, 18, 2), -240)).toBe('14:02');
  expect(formatTime(Date.UTC(2026, 9, 14, 23, 30), 60)).toBe('00:30');
});

test('localOffsetMinutes is the opposite sign of getTimezoneOffset', () => {
  const at = Date.UTC(2026, 9, 14);
  expect(localOffsetMinutes(at)).toBe(-new Date(at).getTimezoneOffset());
});

test('formatDayLabel names the weekday and month', () => {
  expect(formatDayLabel('2026-10-14')).toBe('Wednesday 14 October');
  expect(formatDayLabel('2027-01-01')).toBe('Friday 1 January');
});

test('currentDayKey uses the 04:00 boundary in local time', () => {
  expect(currentDayKey(Date.UTC(2026, 9, 14, 12))).toBe('2026-10-14');
  expect(currentDayKey(Date.UTC(2026, 9, 15, 3))).toBe('2026-10-14');
  expect(currentDayKey(Date.UTC(2026, 9, 15, 4))).toBe('2026-10-15');
});
