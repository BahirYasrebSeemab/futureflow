import { parseDayKey } from '@mflow/core';
import { z } from 'zod';
import { DayKeySchema, LedgerEventSchema, MAX_EVENTS_PER_BATCH, PlanSchema } from './schemas';
import { VerdictSchema } from './verification';

const DAY_MS = 86_400_000;

/** UTC−12:00 to UTC+14:00, in minutes. */
export const UtcOffsetSchema = z.number().int().min(-720).max(840);

/** 32 random bytes as base64url. The phone generates it, so a retried pairing can be recognised. */
export const DeviceTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const PairRequestSchema = z.object({
  code: z.string().min(16).max(128),
  token: DeviceTokenSchema,
  deviceName: z.string().trim().min(1).max(64),
  utcOffsetMinutes: UtcOffsetSchema,
});

export const PairResponseSchema = z.object({ deviceId: z.uuid() });

export const LedgerQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(MAX_EVENTS_PER_BATCH).default(MAX_EVENTS_PER_BATCH),
});

export const LedgerSyncResultSchema = z.object({
  added: z.array(z.uuid()),
  ignored: z.array(z.uuid()),
  rejected: z.array(z.object({ id: z.uuid(), reason: z.literal('future_timestamp') })),
});

export const LedgerPageSchema = z.object({
  events: z.array(LedgerEventSchema),
  next: z.number().int().nonnegative(),
});

export const PlanPutSchema = z.object({ tasks: PlanSchema.shape.tasks });

export const BadDayRequestSchema = z.object({ day: DayKeySchema, kind: z.literal('bad') });

export const MAX_AWAY_DAYS = 30;

const daysSpanned = (from: string, to: string): number =>
  (parseDayKey(to) - parseDayKey(from)) / DAY_MS + 1;

export const AwayRequestSchema = z
  .object({
    /** Client-generated (UUIDv7), so a retried request finds the window it already created. */
    id: z.uuid(),
    from: DayKeySchema,
    to: DayKeySchema,
    place: z.string().trim().min(1).max(80),
    keptTaskIds: z.array(z.uuid()).max(10),
  })
  .refine((r) => r.from <= r.to && daysSpanned(r.from, r.to) <= MAX_AWAY_DAYS, {
    message: `the window must run forward and cover at most ${MAX_AWAY_DAYS} days`,
    path: ['to'],
  });

export const AwayVerdictRequestSchema = z.object({
  day: DayKeySchema,
  verified: z.enum(['yes', 'no', 'unknown']),
  distanceKm: z.number().int().min(0).max(20_000).multipleOf(10).optional(),
});

export const HeartbeatSchema = z.object({
  at: z.number().int().nonnegative(),
  bootId: z.string().min(1).max(64),
  uptimeSeconds: z.number().int().nonnegative(),
  utcOffsetMinutes: UtcOffsetSchema,
  guardEnabled: z.boolean(),
});

export const ReadingLogSchema = z.object({
  id: z.uuid(),
  day: DayKeySchema,
  title: z.string().trim().min(1).max(200),
  source: z.enum(['book', 'pdf', 'article']),
  pages: z.number().int().min(1).max(2000).optional(),
  minutes: z.number().int().min(1).max(1440).optional(),
  summary: z.string().trim().min(1).max(2000),
});

export const MAX_ATTEMPTS_PER_BATCH = 500;

export const MathAttemptSchema = z.object({
  id: z.uuid(),
  day: DayKeySchema,
  at: z.number().int().nonnegative(),
  topicId: z.string().min(1).max(64),
  difficulty: z.number().int().min(1).max(5),
  correct: z.boolean(),
  answerType: z.enum(['typed', 'choice']),
});

export const MathAttemptBatchSchema = z.object({
  attempts: z.array(MathAttemptSchema).min(1).max(MAX_ATTEMPTS_PER_BATCH),
});

export const DayRecordSchema = z.object({
  day: DayKeySchema,
  kind: z.enum(['normal', 'bad', 'away']),
  away: z
    .object({
      place: z.string(),
      keptTaskIds: z.array(z.string()),
      verified: z.enum(['pending', 'yes', 'no', 'unknown']),
    })
    .optional(),
});

export const TodaySchema = z.object({
  day: DayKeySchema,
  serverTime: z.number().int(),
  plan: PlanSchema.nullable(),
  dayRecord: DayRecordSchema.nullable(),
  balanceSeconds: z.number().int(),
  earnedTodaySeconds: z.number().int().nonnegative(),
  verdicts: z.array(VerdictSchema),
});

export type Heartbeat = z.infer<typeof HeartbeatSchema>;
export type ReadingLog = z.infer<typeof ReadingLogSchema>;
export type MathAttempt = z.infer<typeof MathAttemptSchema>;
