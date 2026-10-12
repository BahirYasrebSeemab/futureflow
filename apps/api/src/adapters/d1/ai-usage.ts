import type { UsageCounter } from '@mflow/ai';

export const d1AiUsage = (db: D1Database): UsageCounter => ({
  async used(provider, day) {
    const row = await db
      .prepare('SELECT count FROM ai_usage WHERE provider = ?1 AND day = ?2')
      .bind(provider, day)
      .first<{ count: number }>();
    return row?.count ?? 0;
  },
  async add(provider, day) {
    await db
      .prepare(
        `INSERT INTO ai_usage (provider, day, count) VALUES (?1, ?2, 1)
         ON CONFLICT (provider, day) DO UPDATE SET count = count + 1`,
      )
      .bind(provider, day)
      .run();
  },
});
