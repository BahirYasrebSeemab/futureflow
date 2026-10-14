import { BankQuerySchema } from '@mflow/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { ok } from '../http/envelope';
import { valid } from '../http/validate';

export const bankRoutes = new Hono<AppEnv>().get(
  '/math/bank',
  valid('query', BankQuerySchema),
  async (c) => {
    const { since, limit } = c.req.valid('query');
    return ok(c, await c.var.deps.repos.bank.page(since, limit));
  },
);
