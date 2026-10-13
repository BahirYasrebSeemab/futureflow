import { z } from 'zod';
import { DayKeySchema } from './schemas';

export const CoachMessageRequestSchema = z.object({
  /** Client-generated (UUIDv7): a retried send finds its message and its reply. */
  id: z.uuid(),
  text: z.string().trim().min(1).max(2000),
});

export const CoachMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['owner', 'coach']),
  kind: z.enum(['chat', 'review']),
  text: z.string(),
  day: DayKeySchema,
  replyTo: z.string().optional(),
  createdAt: z.number().int(),
});

export const CoachQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const CoachPageSchema = z.object({
  messages: z.array(CoachMessageSchema),
  next: z.number().int().nonnegative(),
});

export const GuardDaySchema = z.object({
  day: DayKeySchema,
  phoneOffMinutes: z.number().int().nonnegative(),
  guardDisabledMinutes: z.number().int().nonnegative(),
  gaps: z.array(
    z.object({ kind: z.enum(['phone_off', 'guard_disabled']), from: z.number(), to: z.number() }),
  ),
});

export type CoachMessage = z.infer<typeof CoachMessageSchema>;
