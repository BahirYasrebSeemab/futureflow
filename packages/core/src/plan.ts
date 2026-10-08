import { err, ok, type Result } from './result';
import type { Rules } from './rules';
import type { DayKey } from './time';

export const VERIFIER_KINDS = ['github', 'math', 'reading', 'usage'] as const;
export type VerifierKind = (typeof VERIFIER_KINDS)[number];

export type TaskVersion = Readonly<{ title: string; criteria: string; seconds: number }>;

/** `when` is the implementation intention: time + anchor habit ("after Fajr, at my desk"). */
export type TaskSpec = Readonly<{
  id: string;
  skillId: string;
  when: string;
  verifier: VerifierKind;
  full: TaskVersion;
  twoMinute: TaskVersion;
}>;

export type PlanStatus = 'draft' | 'locked';

export type Plan = Readonly<{
  day: DayKey;
  status: PlanStatus;
  tasks: readonly TaskSpec[];
  lockedAt?: number;
}>;

export type PlanError = 'plan_locked' | 'too_few_tasks' | 'too_many_tasks' | 'duplicate_task_id';

const hasDuplicateIds = (tasks: readonly TaskSpec[]): boolean =>
  new Set(tasks.map((t) => t.id)).size !== tasks.length;

export const createDraft = (day: DayKey, tasks: readonly TaskSpec[]): Plan => ({
  day,
  status: 'draft',
  tasks,
});

export function editDraft(plan: Plan, tasks: readonly TaskSpec[]): Result<Plan, PlanError> {
  if (plan.status === 'locked') return err('plan_locked');
  if (hasDuplicateIds(tasks)) return err('duplicate_task_id');
  return ok({ ...plan, tasks });
}

export function lockPlan(plan: Plan, at: number, rules: Rules): Result<Plan, PlanError> {
  if (plan.status === 'locked') return err('plan_locked');
  if (hasDuplicateIds(plan.tasks)) return err('duplicate_task_id');
  if (plan.tasks.length < rules.planMinTasks) return err('too_few_tasks');
  if (plan.tasks.length > rules.planMaxTasks) return err('too_many_tasks');
  return ok({ ...plan, status: 'locked', lockedAt: at });
}
