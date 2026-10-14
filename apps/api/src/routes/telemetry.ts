import { HeartbeatSchema, MathAttemptBatchSchema, ReadingLogSchema } from '@futureflow/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { deviceToday, isWithinDays, MAX_FUTURE_SKEW_MS } from '../http/day';
import { fail, ok } from '../http/envelope';
import { valid } from '../http/validate';

export const telemetryRoutes = new Hono<AppEnv>()
  .post('/heartbeat', valid('json', HeartbeatSchema), async (c) => {
    const { deps, device } = c.var;
    const beat = c.req.valid('json');
    const now = deps.now();
    // A beat from the future would invent gaps (spec §6.5: reject events well in the future).
    if (beat.at > now + MAX_FUTURE_SKEW_MS) return fail(c, 'clock_ahead');
    await deps.repos.telemetry.addHeartbeat(device.id, beat, now);
    await deps.repos.devices.setUtcOffset(device.id, beat.utcOffsetMinutes);
    return ok(c, { serverTime: now });
  })
  .post('/reading', valid('json', ReadingLogSchema), async (c) => {
    const { deps, device } = c.var;
    const log = c.req.valid('json');
    const now = deps.now();
    // Late logging (after midnight, or the next morning) is fine; older backfills are not.
    if (!isWithinDays(log.day, deviceToday(device, now), 1, 0)) return fail(c, 'day_out_of_range');
    const created = await deps.repos.telemetry.addReading(device.id, log, now);
    return ok(c, { id: log.id, created }, created ? 201 : 200);
  })
  .post('/math/attempts', valid('json', MathAttemptBatchSchema), async (c) => {
    const { deps, device } = c.var;
    const now = deps.now();
    const { attempts } = c.req.valid('json');

    const inFuture = (at: number) => at > now + MAX_FUTURE_SKEW_MS;
    const rejected = attempts
      .filter((a) => inFuture(a.at))
      .map((a) => ({ id: a.id, reason: 'future_timestamp' as const }));
    const candidates = attempts.filter((a) => !inFuture(a.at));

    const added = await deps.repos.telemetry.addAttempts(device.id, candidates, now);
    const addedSet = new Set(added);
    const ignored = [...new Set(candidates.map((a) => a.id))].filter((id) => !addedSet.has(id));
    return ok(c, { added, ignored, rejected });
  });
