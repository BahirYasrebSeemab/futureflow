import { PairRequestSchema } from '@mflow/contracts';
import { Hono } from 'hono';
import { constantTimeEqual, newToken, sha256Hex } from '../auth/token';
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
    const device = {
      id: deps.newId(),
      name: body.deviceName,
      utcOffsetMinutes: body.utcOffsetMinutes,
    };
    const token = newToken();
    const paired = await deps.repos.devices.pair(
      codeHash,
      device,
      await sha256Hex(token),
      deps.now(),
    );
    if (!paired) return fail(c, 'code_used');
    return ok(c, { deviceId: device.id, token }, 201);
  },
);

/** Authenticated: lets the phone check its token and see what the server knows about it. */
export const deviceRoutes = new Hono<AppEnv>().get('/device/me', (c) => ok(c, c.var.device));
