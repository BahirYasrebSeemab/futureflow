import { Hono } from 'hono';
import { v7 as uuidv7 } from 'uuid';
import type { AppEnv } from './env';
import { fail, ok } from './http/envelope';

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
    c.set('deps', { now, newId });
    await next();
  });

  const v1 = new Hono<AppEnv>();
  v1.get('/health', (c) => ok(c, { status: 'ok' }));
  app.route('/v1', v1);

  app.notFound((c) => fail(c, 'not_found'));
  return app;
}
