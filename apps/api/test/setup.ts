import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

/** D1 storage is shared by the tests in a file, so every test starts from empty tables. */
beforeEach(async () => {
  const { results } = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table'
     AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'`,
  ).all<{ name: string }>();
  await env.DB.batch(results.map((t) => env.DB.prepare(`DELETE FROM ${t.name}`)));
});
