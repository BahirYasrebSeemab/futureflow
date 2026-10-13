import { createApp } from './app';
import type { Bindings } from './env';
import { runScheduled, runUpkeep, UPKEEP_CRON } from './scheduled';

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(controller.cron === UPKEEP_CRON ? runUpkeep(env) : runScheduled(env));
  },
} satisfies ExportedHandler<Bindings>;
