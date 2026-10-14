import { earnedSeconds } from '@futureflow/core';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { deviceToday } from '../http/day';
import { ok } from '../http/envelope';
import { grantBase } from '../ledger/base-grant';

export const todayRoutes = new Hono<AppEnv>().get('/today', async (c) => {
  const { deps, device } = c.var;
  const { ledger, plans, days } = deps.repos;
  const now = deps.now();
  const day = deviceToday(device, now);

  const [plan, entry, dayEvents, totals] = await Promise.all([
    plans.get(day),
    days.entry(day),
    ledger.forDay(day),
    ledger.totals(),
  ]);

  const paid = await grantBase(deps, day, dayEvents, totals.outstandingBorrow);

  return ok(c, {
    day,
    serverTime: now,
    plan,
    dayRecord: entry?.record ?? null,
    balanceSeconds: totals.balance + paid.reduce((sum, e) => sum + e.seconds, 0),
    earnedTodaySeconds: earnedSeconds([...dayEvents, ...paid]),
    verdicts: await deps.repos.verification.verdictsForDay(day),
  });
});
