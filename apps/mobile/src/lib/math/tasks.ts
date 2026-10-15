import type { MathAttempt } from '@futureflow/contracts';
import type { Api, Today } from '../api/client';
import type { LocalStore } from '../store/types';

/** A math task's target (ADR 0013): the full version and the 2-minute (bad day) version. */
export const MATH_TASK = { problems: 10, minRate: 0.7, smallCorrect: 1 } as const;

export type TaskTarget = Readonly<{
  met: boolean;
  answered: number;
  correct: number;
  label: string;
}>;

export function mathTarget(attempts: readonly MathAttempt[], small: boolean): TaskTarget {
  const answered = attempts.length;
  const correct = attempts.filter((a) => a.correct).length;
  if (small) {
    const shown = Math.min(correct, MATH_TASK.smallCorrect);
    return {
      met: correct >= MATH_TASK.smallCorrect,
      answered,
      correct,
      label: `${shown} of ${MATH_TASK.smallCorrect} correct problem`,
    };
  }
  const rate = answered === 0 ? 0 : correct / answered;
  const pct = Math.round(rate * 100);
  return {
    met: answered >= MATH_TASK.problems && rate >= MATH_TASK.minRate,
    answered,
    correct,
    label: `${Math.min(answered, MATH_TASK.problems)} of ${MATH_TASK.problems} problems, ${pct}% correct (needs ${MATH_TASK.minRate * 100}%)`,
  };
}

type Deps = Readonly<{ api: Pick<Api, 'decideVerdict'>; store: LocalStore }>;

/**
 * Passes today's open math tasks whose target is met. Only `pass` is ever sent (the server records
 * it as `code`); a day that ends short simply has no pass.
 */
export async function checkMathTasks(
  deps: Deps,
  today: Today,
  currentDay: string,
): Promise<string[]> {
  const plan = today.plan;
  if (today.day !== currentDay || plan === null || plan.status !== 'locked') return [];
  const record = today.dayRecord;
  const small = record?.kind === 'bad';
  const kept = record?.kind === 'away' ? new Set(record.away?.keptTaskIds ?? []) : null;
  const target = mathTarget(await deps.store.attemptsOn(today.day), small);
  if (!target.met) return [];

  const passed: string[] = [];
  for (const task of plan.tasks) {
    if (task.verifier !== 'math' || (kept !== null && !kept.has(task.id))) continue;
    const verdict = today.verdicts.find((v) => v.taskId === task.id);
    if (verdict?.outcome === 'pass' || (await deps.store.mathTaskDone(task.id))) continue;
    const result = await deps.api.decideVerdict(task.id, { day: today.day, outcome: 'pass' });
    if (result.ok) {
      await deps.store.markMathTaskDone(task.id);
      passed.push(task.id);
    } else if (
      result.error.kind === 'rejected' &&
      (result.error.code === 'verdict_not_pending' || result.error.code === 'not_found')
    ) {
      // Already decided, or not required today (a rest day): never ask again.
      await deps.store.markMathTaskDone(task.id);
    }
  }
  return passed;
}
