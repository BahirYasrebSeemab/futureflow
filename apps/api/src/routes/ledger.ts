import { LedgerEventBatchSchema, LedgerQuerySchema } from '@mflow/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { ok } from '../http/envelope';
import { MAX_FUTURE_SKEW_MS } from '../http/day';
import { valid } from '../http/validate';
import { appendEvents } from '../ledger/append';

export const ledgerRoutes = new Hono<AppEnv>()
  .post('/ledger/events', valid('json', LedgerEventBatchSchema), async (c) => {
    const { deps, device } = c.var;
    const now = deps.now();
    const { events } = c.req.valid('json');

    const inFuture = (at: number) => at > now + MAX_FUTURE_SKEW_MS;
    const rejected = events
      .filter((e) => inFuture(e.at))
      .map((e) => ({ id: e.id, reason: 'future_timestamp' as const }));
    const candidates = events.filter((e) => !inFuture(e.at));

    const added = await appendEvents(deps.repos.ledger, candidates, device.id, now);
    const addedSet = new Set(added);
    const ignored = [...new Set(candidates.map((e) => e.id))].filter((id) => !addedSet.has(id));
    return ok(c, { added, ignored, rejected });
  })
  .get('/ledger', valid('query', LedgerQuerySchema), async (c) => {
    const { since, limit } = c.req.valid('query');
    return ok(c, await c.var.deps.repos.ledger.page(since, limit));
  });
