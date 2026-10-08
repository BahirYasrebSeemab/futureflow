import type { Plan, TaskVersion } from './plan';
import { err, ok, type Result } from './result';
import type { Rules } from './rules';
import { isoWeekKey, monthKey, weekdayOf, type DayKey } from './time';

export type DayKind = 'normal' | 'bad' | 'away';
export type AwayVerification = 'pending' | 'yes' | 'no' | 'unknown';

export type DayRecord = Readonly<{
  day: DayKey;
  kind: DayKind;
  away?: Readonly<{ place: string; keptTaskIds: readonly string[]; verified: AwayVerification }>;
}>;

export type DayTypeError = 'already_declared' | 'bad_day_limit_reached';

const isDeclared = (history: readonly DayRecord[], day: DayKey): boolean =>
  history.some((r) => r.day === day && r.kind !== 'normal');

export function declareBadDay(
  history: readonly DayRecord[],
  day: DayKey,
  rules: Rules,
): Result<DayRecord, DayTypeError> {
  if (isDeclared(history, day)) return err('already_declared');
  const week = isoWeekKey(day);
  const usedThisWeek = history.filter((r) => r.kind === 'bad' && isoWeekKey(r.day) === week).length;
  if (usedThisWeek >= rules.badDaysPerWeek) return err('bad_day_limit_reached');
  return ok({ day, kind: 'bad' });
}

export function declareAway(
  history: readonly DayRecord[],
  day: DayKey,
  place: string,
  keptTaskIds: readonly string[],
): Result<DayRecord, DayTypeError> {
  if (isDeclared(history, day)) return err('already_declared');
  return ok({ day, kind: 'away', away: { place, keptTaskIds, verified: 'pending' } });
}

export function applyAwayVerification(
  history: readonly DayRecord[],
  record: DayRecord,
  verified: 'yes' | 'no' | 'unknown',
  rules: Rules,
): DayRecord {
  if (record.kind !== 'away' || record.away === undefined) return record;
  const normal: DayRecord = { day: record.day, kind: 'normal' };
  if (verified === 'no') return normal;

  if (verified === 'unknown') {
    const month = monthKey(record.day);
    const unknownThisMonth = history.filter(
      (r) => r.day !== record.day && r.away?.verified === 'unknown' && monthKey(r.day) === month,
    ).length;
    if (unknownThisMonth >= rules.unverifiedAwayPerMonth) return normal;
  }

  return { ...record, away: { ...record.away, verified } };
}

export const isRestDay = (restWeekday: number | undefined, day: DayKey): boolean =>
  restWeekday !== undefined && weekdayOf(day) === restWeekday;

export type RequiredTask = Readonly<{ taskId: string; version: TaskVersion }>;

/** The tasks that must pass today, after rest days, bad-day shrinking and away exclusions. */
export function requiredTasks(
  plan: Plan,
  record: DayRecord | undefined,
  restWeekdayBySkill: ReadonlyMap<string, number>,
): RequiredTask[] {
  const kept = record?.kind === 'away' ? new Set(record.away?.keptTaskIds ?? []) : null;
  const isBad = record?.kind === 'bad';
  return plan.tasks
    .filter((t) => !isRestDay(restWeekdayBySkill.get(t.skillId), plan.day))
    .filter((t) => kept === null || kept.has(t.id))
    .map((t) => ({ taskId: t.id, version: isBad ? t.twoMinute : t.full }));
}
