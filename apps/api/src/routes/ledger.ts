import { LedgerEventBatchSchema, LedgerQuerySchema } from '@futureflow/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { ok } from '../http/envelope';
import { MAX_FUTURE_SKEW_MS } from '../http/day';
import { valid } from '../http/validate';
import { appendEvents } from '../ledger/append';
import { creditLateSpend } from '../ledger/late-spend';
import { screenUnlocks } from '../ledger/unlocks';

export const ledgerRoutes = new Hono<AppEnv>()
  .post('/ledger/events', valid('json', LedgerEventBatchSchema), async (c) => {
    const { deps, device } = c.var;
    const now = deps.now();
    const { events } = c.req.valid('json');

    const inFuture = (at: number) => at > now + MAX_FUTURE_SKEW_MS;
    const ahead = events
      .filter((e) => inFuture(e.at))
      .map((e) => ({ id: e.id, reason: 'future_timestamp' as const }));
    const timely = events.filter((e) => !inFuture(e.at));
    const refusedUnlocks = await screenUnlocks(deps.repos.ledger, timely);
    const refusedIds = new Set(refusedUnlocks.map((r) => r.id));
    const rejected = [...ahead, ...refusedUnlocks];
    const candidates = timely.filter((e) => !refusedIds.has(e.id));

    const added = await appendEvents(deps.repos.ledger, candidates, device.id, now);
    const addedSet = new Set(added);
    await creditLateSpend(
      deps.repos.ledger,
      candidates.filter((e) => addedSet.has(e.id)),
      deps.newId,
      now,
    );
    const ignored = [...new Set(candidates.map((e) => e.id))].filter((id) => !addedSet.has(id));
    return ok(c, { added, ignored, rejected });
  })
  .get('/ledger', valid('query', LedgerQuerySchema), async (c) => {
    const { since, limit } = c.req.valid('query');
    return ok(c, await c.var.deps.repos.ledger.page(since, limit));
  });
