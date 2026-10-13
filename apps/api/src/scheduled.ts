import { makeDeps, type AppOptions } from './app';
import type { Bindings } from './env';
import { upkeep, type UpkeepRun } from './upkeep/run';
import { runVerification, type VerificationRun } from './verification/run';

export const VERIFY_CRON = '0 * * * *';
export const UPKEEP_CRON = '30 * * * *';

/** The hourly tick (spec §11): collect GitHub evidence, judge, pay. Logs counts only. */
export async function runScheduled(
  env: Bindings,
  options: AppOptions = {},
): Promise<VerificationRun> {
  const run = await runVerification(makeDeps(env, options));
  console.log(JSON.stringify({ level: 'info', event: 'verification_run', ...run }));
  return run;
}

/** The half-hourly tick (spec §11): rollover, guard gaps, nightly review, weekly memory. */
export async function runUpkeep(env: Bindings, options: AppOptions = {}): Promise<UpkeepRun> {
  const run = await upkeep(makeDeps(env, options));
  console.log(JSON.stringify({ level: 'info', event: 'upkeep_run', ...run }));
  return run;
}
