import type { Roadmap } from '@mflow/contracts';
import { dayKeyFor, DEFAULT_RULES } from '@mflow/core';
import type { Deps } from '../env';

/** What every upkeep step needs about the owner, looked up once per tick (D1 budget). */
export type Owner = Readonly<{ offset: number; day: string; roadmap: () => Promise<Roadmap> }>;

/** The owner's clock (newest device) and a lazily loaded, shared roadmap; null before pairing. */
export async function ownerContext(deps: Deps): Promise<Owner | null> {
  const offset = await deps.repos.devices.latestOffset();
  if (offset === null) return null;
  let roadmap: Promise<Roadmap> | undefined;
  return {
    offset,
    day: dayKeyFor(deps.now(), offset, DEFAULT_RULES.dayBoundaryHour),
    roadmap: () => (roadmap ??= deps.repos.roadmap.get()),
  };
}

/** Uses the tick's owner when given, else looks it up (steps can also run on their own). */
export const ownerOf = async (deps: Deps, owner?: Owner | null): Promise<Owner | null> =>
  owner === undefined ? ownerContext(deps) : owner;
