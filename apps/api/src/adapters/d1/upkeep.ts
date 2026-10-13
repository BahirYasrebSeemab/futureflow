import type { GuardGap } from '@mflow/core';
import type { UpkeepRepo } from '../../ports';

export const d1Upkeep = (db: D1Database): UpkeepRepo => ({
  async nightlyDone(day) {
    return (
      (await db.prepare('SELECT 1 FROM nightly_runs WHERE day = ?1').bind(day).first()) !== null
    );
  },
  async markNightly(day, at) {
    await db
      .prepare('INSERT OR IGNORE INTO nightly_runs (day, done_at) VALUES (?1, ?2)')
      .bind(day, at)
      .run();
  },
  async devices() {
    const { results } = await db
      .prepare('SELECT id FROM devices WHERE revoked_at IS NULL ORDER BY created_at')
      .all<{ id: string }>();
    return results.map((r) => r.id);
  },
  async gapsBetween(from, to) {
    const { results } = await db
      .prepare(
        'SELECT kind, from_at, to_at FROM guard_gaps WHERE from_at < ?2 AND to_at > ?1 ORDER BY from_at',
      )
      .bind(from, to)
      .all<{ kind: GuardGap['kind']; from_at: number; to_at: number }>();
    return results.map((r) => ({ kind: r.kind, from: r.from_at, to: r.to_at }));
  },

  async saveGaps(deviceId, gaps, seq, at) {
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO guard_gaps (device_id, from_at, to_at, kind, created_at)
           SELECT ?2, value->>'from', value->>'to', value->>'kind', ?3 FROM json_each(?1)`,
        )
        .bind(JSON.stringify(gaps), deviceId, at),
      db
        .prepare(
          `INSERT INTO guard_cursor (device_id, seq) VALUES (?1, ?2)
           ON CONFLICT (device_id) DO UPDATE SET seq = excluded.seq`,
        )
        .bind(deviceId, seq),
    ]);
  },

  async beatsFromCursor(deviceId, limit) {
    const { results } = await db
      .prepare(
        `SELECT seq, at, boot_id, uptime_seconds, guard_enabled FROM heartbeats
         WHERE device_id = ?1
           AND seq >= COALESCE((SELECT seq FROM guard_cursor WHERE device_id = ?1), 0)
         ORDER BY seq LIMIT ?2`,
      )
      .bind(deviceId, limit)
      .all<{
        seq: number;
        at: number;
        boot_id: string;
        uptime_seconds: number;
        guard_enabled: number;
      }>();
    return results.map((r) => ({
      seq: r.seq,
      beat: {
        at: r.at,
        bootId: r.boot_id,
        uptimeSeconds: r.uptime_seconds,
        guardEnabled: r.guard_enabled === 1,
      },
    }));
  },
});
