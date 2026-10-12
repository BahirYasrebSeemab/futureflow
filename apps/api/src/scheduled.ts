import { makeDeps, type AppOptions } from './app';
import type { Bindings } from './env';
import { runVerification, type VerificationRun } from './verification/run';

/** The hourly tick (spec §11): collect GitHub evidence, judge, pay. Logs counts only. */
export async function runScheduled(
  env: Bindings,
  options: AppOptions = {},
): Promise<VerificationRun> {
  const run = await runVerification(makeDeps(env, options));
  console.log(JSON.stringify({ level: 'info', event: 'verification_run', ...run }));
  return run;
}
