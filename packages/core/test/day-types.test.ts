import { describe, expect, it } from 'vitest';
import {
  applyAwayVerification,
  declareAway,
  declareBadDay,
  isRestDay,
  requiredTasks,
  type DayRecord,
} from '../src/day-types';
import { createDraft } from '../src/plan';
import { DEFAULT_RULES as R } from '../src/rules';
import { task } from './fixtures';

const awayUnknown = (day: string): DayRecord => ({
  day,
  kind: 'away',
  away: { place: 'Dushanbe', keptTaskIds: [], verified: 'unknown' },
});

describe('declareBadDay', () => {
  it('allows one bad day per ISO week', () => {
    const first = declareBadDay([], '2026-10-08', R);
    expect(first).toEqual({ ok: true, value: { day: '2026-10-08', kind: 'bad' } });
    const history = first.ok ? [first.value] : [];
    expect(declareBadDay(history, '2026-10-10', R)).toEqual({
      ok: false,
      error: 'bad_day_limit_reached',
    });
  });

  it('treats Sunday and the following Monday as different weeks', () => {
    const history: DayRecord[] = [{ day: '2026-10-11', kind: 'bad' }];
    expect(declareBadDay(history, '2026-10-12', R).ok).toBe(true);
  });

  it('refuses to redeclare a day that already has a type', () => {
    const history: DayRecord[] = [awayUnknown('2026-10-08')];
    expect(declareBadDay(history, '2026-10-08', R)).toEqual({
      ok: false,
      error: 'already_declared',
    });
  });
});

describe('declareAway', () => {
  it('starts as pending verification and keeps the chosen tasks', () => {
    expect(declareAway([], '2026-10-10', 'Dushanbe', ['t1'])).toEqual({
      ok: true,
      value: {
        day: '2026-10-10',
        kind: 'away',
        away: { place: 'Dushanbe', keptTaskIds: ['t1'], verified: 'pending' },
      },
    });
  });

  it('refuses a day that already has a type', () => {
    const history: DayRecord[] = [{ day: '2026-10-10', kind: 'bad' }];
    expect(declareAway(history, '2026-10-10', 'Dushanbe', [])).toEqual({
      ok: false,
      error: 'already_declared',
    });
  });
});

describe('applyAwayVerification', () => {
  const declared = declareAway([], '2026-10-10', 'Dushanbe', ['t1']);
  if (!declared.ok) throw new Error('setup failed');
  const record = declared.value;

  it('keeps away mode when verified', () => {
    expect(applyAwayVerification([], record, 'yes', R).away?.verified).toBe('yes');
  });

  it('cancels away mode when the owner is found at home', () => {
    expect(applyAwayVerification([], record, 'no', R)).toEqual({
      day: '2026-10-10',
      kind: 'normal',
    });
  });

  it('allows up to two unverified away days per month', () => {
    const history = [awayUnknown('2026-10-02')];
    expect(applyAwayVerification(history, record, 'unknown', R).kind).toBe('away');
  });

  it('falls back to a normal day once the unverified allowance is used', () => {
    const history = [awayUnknown('2026-10-02'), awayUnknown('2026-10-05')];
    expect(applyAwayVerification(history, record, 'unknown', R)).toEqual({
      day: '2026-10-10',
      kind: 'normal',
    });
  });

  it('leaves a record that is not an away day unchanged', () => {
    const bad: DayRecord = { day: '2026-10-10', kind: 'bad' };
    expect(applyAwayVerification([], bad, 'no', R)).toBe(bad);
  });

  it('does not count unverified days from other months', () => {
    const history = [awayUnknown('2026-09-20'), awayUnknown('2026-09-25')];
    expect(applyAwayVerification(history, record, 'unknown', R).kind).toBe('away');
  });
});

describe('isRestDay', () => {
  it('matches the configured weekday', () => {
    expect(isRestDay(5, '2026-10-09')).toBe(true);
    expect(isRestDay(5, '2026-10-08')).toBe(false);
    expect(isRestDay(undefined, '2026-10-09')).toBe(false);
  });
});

describe('requiredTasks', () => {
  const plan = createDraft('2026-10-09', [
    task('a', 'swe'),
    task('b', 'math'),
    task('c', 'reading'),
  ]);
  const rest = new Map([['swe', 5]]); // Friday rest for software engineering

  it('skips rest-day skills and uses full versions on a normal day', () => {
    const result = requiredTasks(plan, undefined, rest);
    expect(result.map((r) => r.taskId)).toEqual(['b', 'c']);
    expect(result[0]?.version.seconds).toBe(1200);
  });

  it('uses the 2-minute versions on a bad day', () => {
    const result = requiredTasks(plan, { day: '2026-10-09', kind: 'bad' }, new Map());
    expect(result.map((r) => r.version.title)).toEqual(['Tiny a', 'Tiny b', 'Tiny c']);
  });

  it.each(['pending', 'yes', 'unknown'] as const)(
    'keeps only chosen tasks when away (%s)',
    (verified) => {
      const record: DayRecord = {
        day: '2026-10-09',
        kind: 'away',
        away: { place: 'Dushanbe', keptTaskIds: ['c'], verified },
      };
      expect(requiredTasks(plan, record, new Map()).map((r) => r.taskId)).toEqual(['c']);
    },
  );
});
