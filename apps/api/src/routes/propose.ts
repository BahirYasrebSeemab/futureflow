import { DayKeySchema } from '@futureflow/contracts';
import { createDraft, editDraft } from '@futureflow/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { deviceToday, isWithinDays } from '../http/day';
import { fail, ok } from '../http/envelope';
import { valid } from '../http/validate';
import { activeSkills, aiTasks, templateTasks } from '../planning/propose';

const DayParam = z.object({ day: DayKeySchema });

export const proposeRoutes = new Hono<AppEnv>().post(
  '/plans/:day/propose',
  valid('param', DayParam),
  async (c) => {
    const { deps, device } = c.var;
    const { day } = c.req.valid('param');
    const now = deps.now();
    if (!isWithinDays(day, deviceToday(device, now), 0, 1)) return fail(c, 'day_out_of_range');

    const existing = await deps.repos.plans.get(day);
    if (existing?.status === 'locked') return fail(c, 'plan_locked');
    const roadmap = await deps.repos.roadmap.get();
    if (activeSkills(roadmap, day).length === 0) return fail(c, 'nothing_to_plan');

    const fromAi = await aiTasks(deps.ai, roadmap, day, deps.newId);
    const tasks = fromAi ?? templateTasks(roadmap, day, deps.newId);
    const draft = editDraft(existing ?? createDraft(day, []), tasks);
    if (!draft.ok) return fail(c, draft.error);
    if (!(await deps.repos.plans.save(draft.value, now))) return fail(c, 'plan_locked');
    return ok(c, { plan: draft.value, source: fromAi === null ? 'template' : 'ai' });
  },
);
