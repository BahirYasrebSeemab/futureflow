import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { ok } from '../http/envelope';
import { runVerification } from '../verification/run';

export const verifyRoutes = new Hono<AppEnv>().post('/verify', async (c) => {
  const { deps } = c.var;
  const run = await runVerification(deps);
  return ok(c, { ...run, verdicts: await deps.repos.verification.verdictsForDay(run.day) });
});
