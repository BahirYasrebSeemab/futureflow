import { AwayRequestSchema, AwayVerdictRequestSchema, BadDayRequestSchema } from '@mflow/contracts';
import {
  addDays,
  applyAwayVerification,
  declareAway,
  declareBadDay,
  DEFAULT_RULES,
  type DayRecord,
} from '@mflow/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Deps } from '../env';
import type { AwayWindow } from '../ports';
import { deviceToday, isWithinDays } from '../http/day';
import { fail, ok } from '../http/envelope';
import { valid } from '../http/validate';
import { guardDay, PHONE_OFF_RECLASSIFY_HOURS } from '../upkeep/guard';
import { openDays } from '../verification/run';

/** How far ahead an away window may start. */
const MAX_AWAY_LEAD_DAYS = 60;

const IdParam = z.object({ id: z.uuid() });

const isSameWindow = (a: AwayWindow, b: AwayWindow): boolean =>
  a.place === b.place &&
  a.from === b.from &&
  a.to === b.to &&
  JSON.stringify(a.keptTaskIds) === JSON.stringify(b.keptTaskIds);

const daysFrom = (from: string, to: string): string[] => {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
};

/** Yesterday may become a bad day next morning when the phone was off for (nearly) all of it (spec §6.5). */
async function phoneWasOff(deps: Deps, day: string, offset: number, now: number): Promise<boolean> {
  const open = openDays(now, offset);
  if (open.length < 2 || open[0] !== day) return false;
  const { phoneOffMinutes } = await guardDay(deps, day, offset);
  return phoneOffMinutes >= PHONE_OFF_RECLASSIFY_HOURS * 60;
}

export const dayTypeRoutes = new Hono<AppEnv>()
  .post('/day-type', valid('json', BadDayRequestSchema), async (c) => {
    const { deps, device } = c.var;
    const { day } = c.req.valid('json');
    const now = deps.now();
    const today = deviceToday(device, now);
    if (day !== today && !(await phoneWasOff(deps, day, device.utcOffsetMinutes, now))) {
      return fail(c, 'day_out_of_range');
    }

    const history = await deps.repos.days.between(addDays(day, -7), addDays(day, 7));
    const declared = declareBadDay(history, day, DEFAULT_RULES);
    if (!declared.ok) return fail(c, declared.error);
    await deps.repos.days.save([{ record: declared.value }], now);
    return ok(c, declared.value, 201);
  })
  .post('/away', valid('json', AwayRequestSchema), async (c) => {
    const { deps, device } = c.var;
    const body = c.req.valid('json');
    const now = deps.now();
    if (!isWithinDays(body.from, deviceToday(device, now), 0, MAX_AWAY_LEAD_DAYS)) {
      return fail(c, 'day_out_of_range');
    }

    const stored = await deps.repos.days.window(body.id);
    if (stored !== null) {
      // A retry of the same request: answer with what was stored, write nothing.
      if (!isSameWindow(stored, body)) return fail(c, 'already_declared');
      return ok(c, { id: stored.id, days: await deps.repos.days.between(stored.from, stored.to) });
    }

    const history = await deps.repos.days.between(body.from, body.to);
    const records: DayRecord[] = [];
    for (const day of daysFrom(body.from, body.to)) {
      const declared = declareAway(history, day, body.place, body.keptTaskIds);
      if (!declared.ok) return fail(c, declared.error);
      records.push(declared.value);
    }
    const window = {
      id: body.id,
      place: body.place,
      from: body.from,
      to: body.to,
      keptTaskIds: body.keptTaskIds,
    };
    await deps.repos.days.save(
      records.map((record) => ({ record, windowId: window.id })),
      now,
      window,
    );
    return ok(c, { id: window.id, days: records }, 201);
  })
  .post(
    '/away/:id/verdict',
    valid('param', IdParam),
    valid('json', AwayVerdictRequestSchema),
    async (c) => {
      const { deps, device } = c.var;
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const now = deps.now();

      const window = await deps.repos.days.window(id);
      if (window === null) return fail(c, 'not_found');
      const inWindow = body.day >= window.from && body.day <= window.to;
      if (!inWindow || body.day > deviceToday(device, now)) return fail(c, 'day_out_of_range');
      const entry = await deps.repos.days.entry(body.day);
      if (entry === null) return fail(c, 'not_found');

      const month = body.day.slice(0, 7);
      const history = await deps.repos.days.between(`${month}-01`, `${month}-31`);
      const record = applyAwayVerification(history, entry.record, body.verified, DEFAULT_RULES);
      await deps.repos.days.save(
        [
          {
            record,
            windowId: id,
            ...(body.distanceKm === undefined ? {} : { distanceKm: body.distanceKm }),
          },
        ],
        now,
      );
      return ok(c, record);
    },
  );
