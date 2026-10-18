import type { TelemetryRepo } from '../../ports';

export const d1Telemetry = (db: D1Database): TelemetryRepo => ({
  async addHeartbeats(deviceId, beats, receivedAt) {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO heartbeats
         (device_id, at, boot_id, uptime_seconds, guard_enabled, guard_since_uptime, received_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    );
    const results = await db.batch(
      beats.map((beat) =>
        insert.bind(
          deviceId,
          beat.at,
          beat.bootId,
          beat.uptimeSeconds,
          beat.guardEnabled ? 1 : 0,
          beat.guardSinceUptimeSeconds ?? null,
          receivedAt,
        ),
      ),
    );
    return results.reduce((n, r) => n + r.meta.changes, 0);
  },

  async addReading(deviceId, log, at) {
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO reading_logs
           (id, device_id, day, title, source, pages, minutes, summary, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        log.id,
        deviceId,
        log.day,
        log.title,
        log.source,
        log.pages ?? null,
        log.minutes ?? null,
        log.summary,
        at,
      )
      .run();
    return result.meta.changes === 1;
  },

  async addAttempts(deviceId, attempts, receivedAt) {
    if (attempts.length === 0) return [];
    const { results } = await db
      .prepare(
        `INSERT OR IGNORE INTO math_attempts
           (id, device_id, day, at, topic_id, difficulty, correct, answer_type, received_at)
         SELECT value->>'id', ?2, value->>'day', value->>'at', value->>'topicId',
                value->>'difficulty', value->>'correct', value->>'answerType', ?3
         FROM json_each(?1)
         RETURNING id`,
      )
      .bind(JSON.stringify(attempts), deviceId, receivedAt)
      .all<{ id: string }>();
    return results.map((r) => r.id);
  },

  async mathSummary(day) {
    const row = await db
      .prepare(
        'SELECT count(*) AS attempts, COALESCE(SUM(correct), 0) AS correct FROM math_attempts WHERE day = ?1',
      )
      .bind(day)
      .first<{ attempts: number; correct: number }>();
    return { attempts: row?.attempts ?? 0, correct: row?.correct ?? 0 };
  },

  async recentTopics(sinceDay) {
    const { results } = await db
      .prepare(
        `SELECT topic_id FROM math_attempts WHERE day >= ?1
         GROUP BY topic_id ORDER BY count(*) DESC, topic_id`,
      )
      .bind(sinceDay)
      .all<{ topic_id: string }>();
    return results.map((r) => r.topic_id);
  },
});
