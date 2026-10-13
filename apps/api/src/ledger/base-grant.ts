import { DEFAULT_RULES, earn, type LedgerEvent } from '@mflow/core';
import type { Deps } from '../env';
import { appendEvents } from './append';

/** "Paid at the day boundary, or on the first sync of the day" (spec §6.3); returns what was written. */
export async function grantBase(
  deps: Deps,
  day: string,
  dayEvents: readonly LedgerEvent[],
  outstandingBorrow: number,
): Promise<LedgerEvent[]> {
  const now = deps.now();
  const grant = earn(
    dayEvents,
    { kind: 'base_grant' },
    { day, at: now, newId: deps.newId },
    DEFAULT_RULES,
    {
      planLocked: false,
      outstandingBorrow,
    },
  );
  if (!grant.ok) return [];
  const written = await appendEvents(deps.repos.ledger, grant.value, null, now);
  return grant.value.filter((e) => written.includes(e.id));
}
