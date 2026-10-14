import { PairRequestSchema } from '@futureflow/contracts';
import { Hono } from 'hono';
import { constantTimeEqual, sha256Hex } from '../auth/token';
import type { AppEnv } from '../env';
import { fail, ok } from '../http/envelope';
import { rateLimit } from '../http/rate-limit';
import { valid } from '../http/validate';

const MIN_SETUP_CODE_LENGTH = 16;

/** Public: trades the one-time setup code for a device token. */
export const pairRoutes = new Hono<AppEnv>().post(
  '/device/pair',
  rateLimit(() => 'pair'),
  valid('json', PairRequestSchema),
  async (c) => {
    const secret = c.env.SETUP_CODE;
    if (secret === undefined || secret.length < MIN_SETUP_CODE_LENGTH) {
      return fail(c, 'pairing_disabled');
    }
    const body = c.req.valid('json');
    const codeHash = await sha256Hex(body.code);
    if (!constantTimeEqual(codeHash, await sha256Hex(secret))) return fail(c, 'invalid_code');

    const { deps } = c.var;
    const tokenHash = await sha256Hex(body.token);
    const device = {
      id: deps.newId(),
      name: body.deviceName,
      utcOffsetMinutes: body.utcOffsetMinutes,
    };
    if (await deps.repos.devices.pair(codeHash, device, tokenHash, deps.now())) {
      return ok(c, { deviceId: device.id }, 201);
    }
    // The code is used. If it was used by this same phone (same token), this is a retry whose
    // first answer was lost: tell it which device it is. Anyone else gets a conflict.
    const paired = await deps.repos.devices.findByTokenHash(tokenHash);
    return paired === null ? fail(c, 'code_used') : ok(c, { deviceId: paired.id });
  },
);

/** Authenticated: lets the phone check its token and see what the server knows about it. */
export const deviceRoutes = new Hono<AppEnv>().get('/device/me', (c) => ok(c, c.var.device));
