import { createApp } from './app';
import type { Bindings } from './env';
import { runScheduled } from './scheduled';

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  },
} satisfies ExportedHandler<Bindings>;
