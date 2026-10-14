import { CoachMessageRequestSchema, CoachQuerySchema } from '@futureflow/contracts';
import { addDays } from '@futureflow/core';
import { Hono } from 'hono';
import {
  coachPrompt,
  coachSystem,
  RECENT_DAYS,
  RECENT_MESSAGES,
  todayFacts,
} from '../coach/persona';
import type { AppEnv } from '../env';
import { deviceToday } from '../http/day';
import { fail, ok } from '../http/envelope';
import { valid } from '../http/validate';

export const coachRoutes = new Hono<AppEnv>()
  .get('/coach/messages', valid('query', CoachQuerySchema), async (c) => {
    const { since, limit } = c.req.valid('query');
    return ok(c, await c.var.deps.repos.coach.page(since, limit));
  })
  .post('/coach/messages', valid('json', CoachMessageRequestSchema), async (c) => {
    const { deps, device } = c.var;
    const { id, text } = c.req.valid('json');
    const now = deps.now();
    const day = deviceToday(device, now);
    const message = {
      id,
      role: 'owner' as const,
      kind: 'chat' as const,
      text,
      day,
      createdAt: now,
    };

    const isNew = await deps.repos.coach.addOwnerMessage(message);
    const existing = isNew ? null : await deps.repos.coach.replyTo(id);
    if (existing !== null) return ok(c, { message, reply: existing });

    const [roadmap, summary, facts, recent] = await Promise.all([
      deps.repos.roadmap.get(),
      deps.repos.coach.latestSummary(),
      todayFacts(deps, day),
      deps.repos.coach.recent(addDays(day, -RECENT_DAYS), RECENT_MESSAGES + 1),
    ]);
    const history = recent.filter((m) => m.id !== id).slice(-RECENT_MESSAGES);
    const answer = await deps.ai.talkText({
      system: coachSystem(roadmap),
      prompt: coachPrompt({ summary, facts, history, message: text }),
      importance: 'flourish',
    });
    if (!answer.ok) return fail(c, 'coach_unavailable');

    const reply = {
      id: deps.newId(),
      role: 'coach' as const,
      kind: 'chat' as const,
      text: answer.value.trim(),
      day,
      replyTo: id,
      createdAt: deps.now(),
    };
    await deps.repos.coach.addCoachMessage(reply);
    return ok(c, { message, reply }, 201);
  });
