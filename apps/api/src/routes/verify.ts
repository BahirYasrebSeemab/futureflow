import { VerdictRequestSchema } from '@mflow/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { fail, ok } from '../http/envelope';
import { valid } from '../http/validate';
import { openDays, requiredFor, runVerification, settle } from '../verification/run';

const TaskParam = z.object({ taskId: z.string().min(1).max(64) });
/** Verifiers the phone computes itself; GitHub and reading go through the judge first. */
const PHONE_VERIFIED = new Set(['math', 'usage']);

export const verifyRoutes = new Hono<AppEnv>()
  .post('/verify', async (c) => {
    const { deps } = c.var;
    const run = await runVerification(deps);
    return ok(c, { ...run, verdicts: await deps.repos.verification.verdictsForDay(run.day) });
  })
  .post(
    '/verdicts/:taskId',
    valid('param', TaskParam),
    valid('json', VerdictRequestSchema),
    async (c) => {
      const { deps, device } = c.var;
      const { taskId } = c.req.valid('param');
      const { day, outcome } = c.req.valid('json');
      if (!openDays(deps.now(), device.utcOffsetMinutes).includes(day)) {
        return fail(c, 'day_out_of_range');
      }

      const plan = await deps.repos.plans.get(day);
      if (plan === null || plan.status !== 'locked') return fail(c, 'plan_not_locked');
      const required = await requiredFor(deps, plan);
      const task = plan.tasks.find((t) => t.id === taskId);
      if (task === undefined || !required.some((r) => r.taskId === taskId))
        return fail(c, 'not_found');

      const previous = (await deps.repos.verification.verdictsForDay(day)).find(
        (v) => v.taskId === taskId,
      );
      const byPhone = PHONE_VERIFIED.has(task.verifier);
      if (previous?.outcome === 'pass' || (!byPhone && previous?.outcome !== 'pending')) {
        return fail(c, 'verdict_not_pending');
      }
      const verdict = {
        day,
        taskId,
        outcome,
        confidence: 1,
        by: byPhone ? ('code' as const) : ('owner' as const),
        evidenceIds: previous?.evidenceIds ?? [],
      };
      await deps.repos.verification.saveVerdict(verdict, deps.now());
      await settle(deps, plan, required);
      return ok(c, verdict);
    },
  );
