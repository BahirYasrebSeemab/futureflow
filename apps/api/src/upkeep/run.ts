import type { Deps } from '../env';
import { analyzeGuard } from './guard';
import { ownerContext } from './owner';
import { runNightly } from './nightly';
import { rollover } from './rollover';
import { runWeekly } from './weekly';

export type UpkeepRun = Readonly<{
  rolledOver: boolean;
  gaps: number;
  nightly: 'ai' | 'template' | null;
  summarized: string | null;
  deleted: number;
}>;

/** The half-hourly upkeep: each step is idempotent, so a missed or repeated tick is harmless. */
export async function upkeep(deps: Deps): Promise<UpkeepRun> {
  const owner = await ownerContext(deps);
  const rolled = await rollover(deps, owner);
  const gaps = await analyzeGuard(deps, owner);
  const nightly = await runNightly(deps, owner);
  const weekly = await runWeekly(deps, owner);
  return {
    rolledOver: rolled !== null && (rolled.granted || rolled.expiredSeconds > 0),
    gaps,
    nightly: nightly?.review ?? null,
    summarized: weekly.summarized,
    deleted: weekly.deleted,
  };
}
