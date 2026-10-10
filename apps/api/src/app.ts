import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { v7 as uuidv7 } from 'uuid';
import { d1Repos } from './adapters/d1';
import { requireDevice } from './auth/require-device';
import type { AppEnv } from './env';
import { fail, ok } from './http/envelope';
import { rateLimit } from './http/rate-limit';
import { deviceRoutes, pairRoutes } from './routes/device';
import { ledgerRoutes } from './routes/ledger';
import { planRoutes } from './routes/plans';

/** A full 500-event batch is ~150 KB; anything far larger is a mistake or an attack. */
export const MAX_BODY_BYTES = 256 * 1024;

export type AppOptions = Readonly<{
  now?: () => number;
  newId?: () => string;
  limiter?: (key: string) => Promise<boolean>;
}>;

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const now = options.now ?? (() => Date.now());
  const newId = options.newId ?? (() => uuidv7());
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const limit =
      options.limiter ?? (async (key: string) => (await c.env.RATE_LIMITER.limit({ key })).success);
    c.set('deps', { now, newId, repos: d1Repos(c.env.DB), limit });
    await next();
  });
  app.use(
    '*',
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => fail(c, 'payload_too_large') }),
  );

  const v1 = new Hono<AppEnv>();
  v1.get('/health', (c) => ok(c, { status: 'ok' }));
  v1.route('/', pairRoutes);

  // Everything below needs a paired device. Unknown /v1 paths also answer 401, revealing nothing.
  const authed = new Hono<AppEnv>();
  authed.use(
    '*',
    requireDevice,
    rateLimit((c) => `device:${c.var.device.id}`),
  );
  authed.route('/', deviceRoutes);
  authed.route('/', ledgerRoutes);
  authed.route('/', planRoutes);
  v1.route('/', authed);

  app.route('/v1', v1);
  app.notFound((c) => fail(c, 'not_found'));
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status === 400) {
      return fail(c, 'invalid_request', 'The request body could not be read.');
    }
    // Structured, and never the request data: no bodies, tokens, or error messages from SQL.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'unhandled_error',
        name: error.name,
        route: c.req.routePath,
      }),
    );
    return fail(c, 'internal');
  });
  return app;
}
