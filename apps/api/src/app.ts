import type { FetchLike } from '@mflow/ai';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { v7 as uuidv7 } from 'uuid';
import { d1Repos } from './adapters/d1';
import { aiFromEnv, timeoutFetch } from './ai';
import { requireDevice } from './auth/require-device';
import type { AppEnv, Bindings, Deps } from './env';
import { fail, ok } from './http/envelope';
import { rateLimit } from './http/rate-limit';
import { dayTypeRoutes } from './routes/day-types';
import { deviceRoutes, pairRoutes } from './routes/device';
import { githubRoutes } from './routes/github';
import { guardRoutes } from './routes/guard';
import { ledgerRoutes } from './routes/ledger';
import { onboardingRoutes } from './routes/onboarding';
import { planRoutes } from './routes/plans';
import { proposeRoutes } from './routes/propose';
import { telemetryRoutes } from './routes/telemetry';
import { todayRoutes } from './routes/today';
import { verifyRoutes } from './routes/verify';

/**
 * The largest batch the schemas accept (500 events with a 128-character refId and a 500-character
 * reason) is ~385 KB, so it must fit. Anything far larger is a mistake or an attack.
 */
export const MAX_BODY_BYTES = 512 * 1024;

export type AppOptions = Readonly<{
  now?: () => number;
  newId?: () => string;
  limiter?: (key: string) => Promise<boolean>;
  /** Outgoing HTTP for AI providers; tests pass a fake. */
  fetch?: FetchLike;
}>;

/** Everything a request or a cron run needs, from the Worker env plus test overrides. */
export function makeDeps(env: Bindings, options: AppOptions = {}): Deps {
  const now = options.now ?? (() => Date.now());
  const newId = options.newId ?? (() => uuidv7());
  const fetchImpl = options.fetch ?? timeoutFetch;
  const limit =
    options.limiter ?? (async (key: string) => (await env.RATE_LIMITER.limit({ key })).success);
  const repos = d1Repos(env.DB);
  return {
    now,
    newId,
    repos,
    limit,
    fetch: fetchImpl,
    ai: aiFromEnv(env, repos.aiUsage, fetchImpl, now),
    settings: {
      githubTokenKey: env.GITHUB_TOKEN_KEY,
      judgeAutoDecide: env.JUDGE_AUTO_DECIDE === 'on',
    },
  };
}

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('deps', makeDeps(c.env, options));
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
  authed.route('/', dayTypeRoutes);
  authed.route('/', telemetryRoutes);
  authed.route('/', todayRoutes);
  authed.route('/', onboardingRoutes);
  authed.route('/', proposeRoutes);
  authed.route('/', githubRoutes);
  authed.route('/', verifyRoutes);
  authed.route('/', guardRoutes);
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
