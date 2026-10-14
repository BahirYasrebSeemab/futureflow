import { DayKeySchema, PlanPutSchema } from '@futureflow/contracts';
import { createDraft, DEFAULT_RULES, editDraft, lockPlan } from '@futureflow/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { deviceToday, isWithinDays } from '../http/day';
import { fail, ok } from '../http/envelope';
import { valid } from '../http/validate';

const DayParam = z.object({ day: DayKeySchema });

/** Night-before planning (tomorrow) and the morning fallback (today). */
const isPlannable = (day: string, today: string) => isWithinDays(day, today, 0, 1);

export const planRoutes = new Hono<AppEnv>()
  .get('/plans/:day', valid('param', DayParam), async (c) => {
    const plan = await c.var.deps.repos.plans.get(c.req.valid('param').day);
    return plan === null ? fail(c, 'not_found') : ok(c, plan);
  })
  .put('/plans/:day', valid('param', DayParam), valid('json', PlanPutSchema), async (c) => {
    const { deps, device } = c.var;
    const { day } = c.req.valid('param');
    const now = deps.now();
    if (!isPlannable(day, deviceToday(device, now))) return fail(c, 'day_out_of_range');

    const existing = (await deps.repos.plans.get(day)) ?? createDraft(day, []);
    const edited = editDraft(existing, c.req.valid('json').tasks);
    if (!edited.ok) return fail(c, edited.error);
    if (!(await deps.repos.plans.save(edited.value, now))) return fail(c, 'plan_locked');
    return ok(c, edited.value);
  })
  .post('/plans/:day/lock', valid('param', DayParam), async (c) => {
    const { deps, device } = c.var;
    const { day } = c.req.valid('param');
    const now = deps.now();
    if (!isPlannable(day, deviceToday(device, now))) return fail(c, 'day_out_of_range');

    const existing = await deps.repos.plans.get(day);
    if (existing === null) return fail(c, 'not_found');
    const locked = lockPlan(existing, now, DEFAULT_RULES);
    if (!locked.ok) return fail(c, locked.error);
    if (!(await deps.repos.plans.save(locked.value, now))) return fail(c, 'plan_locked');
    return ok(c, locked.value);
  });
