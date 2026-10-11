import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';
import { fail } from './envelope';

type Issues = { issues: readonly { path: readonly PropertyKey[]; message: string }[] };

/** Paths and rule messages only: submitted values are never echoed back. */
const describeIssues = (error: Issues): string =>
  error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ');

export const valid = <Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) return fail(c, 'invalid_request', describeIssues(result.error));
  });
