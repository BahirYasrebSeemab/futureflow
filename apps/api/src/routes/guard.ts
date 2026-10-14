import { DayKeySchema } from '@futureflow/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { ok } from '../http/envelope';
import { valid } from '../http/validate';
import { guardDay } from '../upkeep/guard';

export const guardRoutes = new Hono<AppEnv>().get(
  '/guard/:day',
  valid('param', z.object({ day: DayKeySchema })),
  async (c) =>
    ok(c, await guardDay(c.var.deps, c.req.valid('param').day, c.var.device.utcOffsetMinutes)),
);
