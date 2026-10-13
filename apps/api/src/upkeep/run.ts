import type { Deps } from '../env';
import { analyzeGuard } from './guard';
import { ownerContext } from './owner';
import { runNightly, type NightlyReview } from './nightly';
import { rollover } from './rollover';
import { runWeekly } from './weekly';

export type UpkeepRun = Readonly<{
  rolledOver: boolean;
  gaps: number;
  nightly: NightlyReview | null;
  summarized: string | null;
  deleted: number;
}>;

/** Runs one step; a failure is logged by step name (never data) and the next steps still run. */
async function step<T>(name: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'unknown';
    console.error(
      JSON.stringify({ level: 'error', event: 'upkeep_step_failed', step: name, name: errorName }),
    );
    return fallback;
  }
}

/** The half-hourly upkeep: each step is idempotent, so a missed or repeated tick is harmless. */
export async function upkeep(deps: Deps): Promise<UpkeepRun> {
  const owner = await ownerContext(deps);
  const rolled = await step('rollover', () => rollover(deps, owner), null);
  const gaps = await step('guard', () => analyzeGuard(deps), 0);
  const nightly = await step('nightly', () => runNightly(deps, owner), null);
  const weekly = await step('weekly', () => runWeekly(deps, owner), {
    summarized: null,
    deleted: 0,
  });
  return {
    rolledOver: rolled !== null && (rolled.granted || rolled.expiredSeconds > 0),
    gaps,
    nightly: nightly?.review ?? null,
    summarized: weekly.summarized,
    deleted: weekly.deleted,
  };
}
