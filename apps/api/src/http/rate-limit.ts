import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import { fail } from './envelope';

export const rateLimit = (keyOf: (c: Context<AppEnv>) => string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!(await c.var.deps.limit(keyOf(c)))) return fail(c, 'rate_limited');
    await next();
  });
