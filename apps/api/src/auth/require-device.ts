import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import { fail } from '../http/envelope';
import { sha256Hex } from './token';

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/i;

/** Resolves `Authorization: Bearer <token>` to a paired, unrevoked device, or answers 401. */
export const requireDevice = createMiddleware<AppEnv>(async (c, next) => {
  const token = BEARER.exec(c.req.header('authorization') ?? '')?.[1];
  if (token === undefined) return fail(c, 'unauthorized');
  const device = await c.var.deps.repos.devices.findByTokenHash(await sha256Hex(token));
  if (device === null) return fail(c, 'unauthorized');
  c.set('device', device);
  await next();
});
