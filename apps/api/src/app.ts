import { Hono } from 'hono';
import { v7 as uuidv7 } from 'uuid';
import { d1Repos } from './adapters/d1';
import { requireDevice } from './auth/require-device';
import type { AppEnv } from './env';
import { fail, ok } from './http/envelope';
import { rateLimit } from './http/rate-limit';
import { deviceRoutes, pairRoutes } from './routes/device';

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
  v1.route('/', authed);

  app.route('/v1', v1);
  app.notFound((c) => fail(c, 'not_found'));
  return app;
}
