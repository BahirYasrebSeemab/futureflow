import { isoWeekKey } from '@mflow/core';
import type { CoachMessage, CoachRepo } from '../../ports';

type Row = {
  seq: number;
  id: string;
  role: CoachMessage['role'];
  kind: CoachMessage['kind'];
  text: string;
  day: string;
  reply_to: string | null;
  created_at: number;
};

const COLUMNS = 'seq, id, role, kind, text, day, reply_to, created_at';

const toMessage = (r: Row): CoachMessage => ({
  id: r.id,
  role: r.role,
  kind: r.kind,
  text: r.text,
  day: r.day,
  ...(r.reply_to === null ? {} : { replyTo: r.reply_to }),
  createdAt: r.created_at,
});

export const d1Coach = (db: D1Database): CoachRepo => {
  const insert = (m: CoachMessage, orIgnore: boolean) =>
    db
      .prepare(
        `INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO coach_messages
           (id, role, kind, text, day, week, reply_to, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(m.id, m.role, m.kind, m.text, m.day, isoWeekKey(m.day), m.replyTo ?? null, m.createdAt)
      .run();

  return {
    async addOwnerMessage(m) {
      return (await insert(m, true)).meta.changes === 1;
    },
    async replyTo(id) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM coach_messages WHERE reply_to = ?1`)
        .bind(id)
        .first<Row>();
      return row === null ? null : toMessage(row);
    },
    async addCoachMessage(m) {
      await insert(m, true);
    },
    async page(since, limit) {
      const { results } = await db
        .prepare(`SELECT ${COLUMNS} FROM coach_messages WHERE seq > ?1 ORDER BY seq LIMIT ?2`)
        .bind(since, limit)
        .all<Row>();
      return { messages: results.map(toMessage), next: results.at(-1)?.seq ?? since };
    },
    async recent(sinceDay, limit) {
      const { results } = await db
        .prepare(
          `SELECT ${COLUMNS} FROM (SELECT ${COLUMNS} FROM coach_messages WHERE day >= ?1
           ORDER BY seq DESC LIMIT ?2) ORDER BY seq`,
        )
        .bind(sinceDay, limit)
        .all<Row>();
      return results.map(toMessage);
    },
    async hasReview(day) {
      const row = await db
        .prepare("SELECT 1 FROM coach_messages WHERE day = ?1 AND kind = 'review'")
        .bind(day)
        .first();
      return row !== null;
    },
    async latestSummary() {
      const row = await db
        .prepare('SELECT text FROM coach_summaries ORDER BY week DESC LIMIT 1')
        .first<{ text: string }>();
      return row?.text ?? null;
    },
    async hasSummary(week) {
      return (
        (await db.prepare('SELECT 1 FROM coach_summaries WHERE week = ?1').bind(week).first()) !==
        null
      );
    },
    async saveSummary(week, text, at) {
      await db
        .prepare(
          `INSERT INTO coach_summaries (week, text, created_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (week) DO NOTHING`,
        )
        .bind(week, text, at)
        .run();
    },
    async messagesForWeek(week) {
      const { results } = await db
        .prepare(`SELECT ${COLUMNS} FROM coach_messages WHERE week = ?1 ORDER BY seq`)
        .bind(week)
        .all<Row>();
      return results.map(toMessage);
    },
    async oldestUnsummarizedWeek(beforeWeek) {
      const row = await db
        .prepare(
          `SELECT week FROM coach_messages
           WHERE week < ?1 AND week NOT IN (SELECT week FROM coach_summaries)
           ORDER BY week LIMIT 1`,
        )
        .bind(beforeWeek)
        .first<{ week: string }>();
      return row?.week ?? null;
    },
    async deleteOld(beforeDay, hardBeforeDay) {
      const result = await db
        .prepare(
          `DELETE FROM coach_messages WHERE day < ?2
             OR (day < ?1 AND week IN (SELECT week FROM coach_summaries))`,
        )
        .bind(beforeDay, hardBeforeDay)
        .run();
      return result.meta.changes;
    },
  };
};
