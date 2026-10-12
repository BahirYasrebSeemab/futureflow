import { z } from 'zod';
import { DayKeySchema } from './schemas';

const SEGMENT = '(?!\\.{1,2}(?:/|$))[A-Za-z0-9_.-]{1,100}';

/** `owner/name`, as GitHub spells it. `.` and `..` are refused: they would act as URL path steps. */
export const RepoNameSchema = z.string().regex(new RegExp(`^${SEGMENT}/${SEGMENT}$`));

export const GithubLinkRequestSchema = z
  .object({
    /** A fine-grained, read-only token (Contents + Metadata). Sealed at rest, never echoed. */
    token: z.string().trim().min(20).max(255),
    repos: z.array(RepoNameSchema).min(1).max(10),
  })
  .refine((r) => new Set(r.repos).size === r.repos.length, {
    message: 'repositories must be unique',
    path: ['repos'],
  });

export const GithubLinkSchema = z.object({
  login: z.string(),
  repos: z.array(RepoNameSchema),
  status: z.enum(['ok', 'invalid']),
});

export const VerdictRequestSchema = z.object({
  day: DayKeySchema,
  outcome: z.enum(['pass', 'fail']),
});

export const VerdictSchema = z.object({
  day: DayKeySchema,
  taskId: z.string(),
  outcome: z.enum(['pass', 'fail', 'pending']),
  confidence: z.number().min(0).max(1),
  by: z.enum(['code', 'judge', 'coach', 'owner']),
  evidenceIds: z.array(z.string()),
  /** For a pending judge verdict: what the judge would decide. */
  suggestion: z.enum(['pass', 'fail']).optional(),
});
