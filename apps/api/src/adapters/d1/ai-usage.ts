import type { UsageCounter } from '@futureflow/ai';

export const d1AiUsage = (db: D1Database): UsageCounter => ({
  async used(provider, day) {
    const row = await db
      .prepare('SELECT count FROM ai_usage WHERE provider = ?1 AND day = ?2')
      .bind(provider, day)
      .first<{ count: number }>();
    return row?.count ?? 0;
  },
  async tryUse(provider, day, cap) {
    // One statement: insert or increment only while under the cap, so concurrent calls cannot
    // overshoot. A row comes back only when the call was counted.
    const row = await db
      .prepare(
        `INSERT INTO ai_usage (provider, day, count) SELECT ?1, ?2, 1 WHERE ?3 > 0
         ON CONFLICT (provider, day) DO UPDATE SET count = count + 1 WHERE count < ?3
         RETURNING count`,
      )
      .bind(provider, day, cap)
      .first<{ count: number }>();
    return row !== null;
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
