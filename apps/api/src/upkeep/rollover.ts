import { addDays, DEFAULT_RULES, earn, expireFromBalances, type LedgerEvent } from '@mflow/core';
import type { Deps } from '../env';
import { appendEvents } from '../ledger/append';
import { ownerOf, type Owner } from './owner';

/**
 * At the boundary: yesterday's unused time expires (after paying older debt, core rule), and today's
 * base grant is paid. Both are once per day by business key, so every upkeep tick may call this.
 * Rewards paid for yesterday later, inside the grace window, are not expired: earned time stays usable.
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

  const [yesterdayEvents, running, todayEvents] = await Promise.all([
    ledger.forDay(yesterday),
    ledger.balanceThrough(yesterday),
    ledger.forDay(day),
  ]);
  const dayBalance = yesterdayEvents.reduce((sum, e) => sum + e.seconds, 0);
  const alreadyExpired = yesterdayEvents.some((e) => e.kind === 'expire');
  const expire = alreadyExpired
    ? null
    : expireFromBalances(dayBalance, running, { day: yesterday, at: now, newId: deps.newId });
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
