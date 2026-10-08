import { LEDGER_EVENT_KINDS, parseDayKey, VERIFIER_KINDS } from '@mflow/core';
import { z } from 'zod';

export const MAX_EVENTS_PER_BATCH = 500;
const MAX_TASK_SECONDS = 7_200; // never more than the daily cap
const MAX_TASKS_IN_PLAN = 10; // drafts may exceed the lock limit while editing

const isValidDayKey = (value: string): boolean => {
  try {
    parseDayKey(value);
    return true;
  } catch {
    return false;
  }
};

export const DayKeySchema = z.string().refine(isValidDayKey, { message: 'invalid day key' });

export const LedgerEventSchema = z.object({
  id: z.uuid(),
  day: DayKeySchema,
  at: z.number().int().nonnegative(),
  kind: z.enum(LEDGER_EVENT_KINDS),
  seconds: z.number().int(),
  refId: z.string().min(1).max(128).optional(),
  reason: z.string().max(500).optional(),
});

export const LedgerEventBatchSchema = z.object({
  events: z.array(LedgerEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

export const TaskVersionSchema = z.object({
  title: z.string().min(1).max(120),
  criteria: z.string().min(1).max(500),
  seconds: z.number().int().positive().max(MAX_TASK_SECONDS),
});

export const TaskSpecSchema = z.object({
  id: z.uuid(),
  skillId: z.string().min(1).max(64),
  when: z.string().min(1).max(120),
  verifier: z.enum(VERIFIER_KINDS),
  full: TaskVersionSchema,
  twoMinute: TaskVersionSchema,
});

export const PlanSchema = z.object({
  day: DayKeySchema,
  status: z.enum(['draft', 'locked']),
  tasks: z.array(TaskSpecSchema).max(MAX_TASKS_IN_PLAN),
  lockedAt: z.number().int().nonnegative().optional(),
});

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
});

/** Every API response: success carries data, failure carries an error, never both. */
export function envelope<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data, error: z.null() }),
    z.object({ ok: z.literal(false), data: z.null(), error: ApiErrorSchema }),
  ]);
}
