import { addDays, expireFromBalances } from '@mflow/core';
import type { Deps } from '../env';
import { appendEvents } from '../ledger/append';
import { grantBase } from '../ledger/base-grant';
import { ownerDay } from '../verification/run';

/**
 * At the boundary: yesterday's unused time expires (after paying older debt, core rule), and today's
 * base grant is paid. Both are once per day by business key, so every upkeep tick may call this.
 * Rewards paid for yesterday later, inside the grace window, are not expired: earned time stays usable.
 */
export async function rollover(
  deps: Deps,
): Promise<{ expiredSeconds: number; granted: boolean } | null> {
  if ((await deps.repos.devices.latestOffset()) === null) return null;
  const { day } = await ownerDay(deps);
  const yesterday = addDays(day, -1);
  const { ledger } = deps.repos;
  const now = deps.now();

  const [yesterdayEvents, running] = await Promise.all([
    ledger.forDay(yesterday),
    ledger.balanceThrough(yesterday),
  ]);
  const dayBalance = yesterdayEvents.reduce((sum, e) => sum + e.seconds, 0);
  const alreadyExpired = yesterdayEvents.some((e) => e.kind === 'expire');
  const expire = alreadyExpired
    ? null
    : expireFromBalances(dayBalance, running, { day: yesterday, at: now, newId: deps.newId });
  const expired = expire === null ? [] : await appendEvents(ledger, [expire], null, now);

  const [todayEvents, totals] = await Promise.all([ledger.forDay(day), ledger.totals()]);
  const granted = await grantBase(deps, day, todayEvents, totals.outstandingBorrow);
  return {
    expiredSeconds: expire !== null && expired.includes(expire.id) ? -expire.seconds : 0,
    granted: granted.length > 0,
  };
}
