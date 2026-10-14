import {
  addDays,
  DEFAULT_RULES,
  earn,
  expireFromBalances,
  type LedgerEvent,
} from '@futureflow/core';
import type { Deps } from '../env';
import { appendEvents } from '../ledger/append';
import { ownerOf, type Owner } from './owner';

/**
 * At the boundary: unused time through yesterday expires (debt is paid first, core rule), and today's
 * base grant is paid. Both are once per day by business key, so every upkeep tick may call this.
 */
export async function rollover(
  deps: Deps,
  owner?: Owner | null,
): Promise<{ expiredSeconds: number; granted: boolean } | null> {
  const o = await ownerOf(deps, owner);
  if (o === null) return null;
  const { day } = o;
  const yesterday = addDays(day, -1);
  const { ledger } = deps.repos;
  const now = deps.now();

  const [running, todayEvents] = await Promise.all([
    ledger.balanceThrough(yesterday),
    ledger.forDay(day),
  ]);
  // Everything still unused through yesterday expires: normally just yesterday's leftover (older
  // days already expired), plus any reward paid to yesterday after its expiry (grace window), so
  // late time is usable on the day it arrives and never carries over for good. Debt is never
  // expired: a negative running balance expires nothing.
  const expire = expireFromBalances(running, running, {
    day: yesterday,
    at: now,
    newId: deps.newId,
  });
  // The base grant never repays debt (core rule), so the borrow total is not needed here.
  const grant = earn(
    todayEvents,
    { kind: 'base_grant' },
    { day, at: now, newId: deps.newId },
    DEFAULT_RULES,
    {
      planLocked: false,
      outstandingBorrow: 0,
    },
  );
  const base: LedgerEvent[] = grant.ok ? grant.value : [];
  const written = await appendEvents(
    ledger,
    [...(expire === null ? [] : [expire]), ...base],
    null,
    now,
  );
  return {
    expiredSeconds: expire !== null && written.includes(expire.id) ? -expire.seconds : 0,
    granted: base.some((e) => written.includes(e.id)),
  };
}
