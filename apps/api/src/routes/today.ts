import { DEFAULT_RULES, earn, earnedSeconds } from '@mflow/core';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { deviceToday } from '../http/day';
import { ok } from '../http/envelope';
import { appendEvents } from '../ledger/append';

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

  // "Paid at the day boundary, or on the first sync of the day" (spec §6.3). Idempotent:
  // core refuses a second grant, and the business key refuses a racing duplicate.
  const grant = earn(
    dayEvents,
    { kind: 'base_grant' },
    { day, at: now, newId: deps.newId },
    DEFAULT_RULES,
    { planLocked: plan?.status === 'locked', outstandingBorrow: totals.outstandingBorrow },
  );
  const written = grant.ok ? await appendEvents(ledger, grant.value, null, now) : [];
  const paid = grant.ok ? grant.value.filter((e) => written.includes(e.id)) : [];

  return ok(c, {
    day,
    serverTime: now,
    plan,
    dayRecord: entry?.record ?? null,
    balanceSeconds: totals.balance + paid.reduce((sum, e) => sum + e.seconds, 0),
    earnedTodaySeconds: earnedSeconds([...dayEvents, ...paid]),
  });
});
