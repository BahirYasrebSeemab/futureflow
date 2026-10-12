import { RoadmapSchema } from '@mflow/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { ok } from '../http/envelope';
import { valid } from '../http/validate';

export const onboardingRoutes = new Hono<AppEnv>()
  .get('/onboarding/roadmap', async (c) => ok(c, await c.var.deps.repos.roadmap.get()))
  .put('/onboarding/roadmap', valid('json', RoadmapSchema), async (c) => {
    const { deps } = c.var;
    const roadmap = c.req.valid('json');
    await deps.repos.roadmap.replace(roadmap, deps.now());
    return ok(c, roadmap);
  });
