import { z } from 'zod';
import type { BankEntry, BankRepo } from '../../ports';

type Row = {
  seq: number;
  id: string;
  week: string;
  topic_id: string;
  difficulty: number;
  seed: number;
  story: string;
  prompt: string;
  answer_json: string;
  hints_json: string;
  steps_json: string;
  created_at: number;
};

const Strings = z.array(z.string());

const toEntry = (r: Row): BankEntry => ({
  id: r.id,
  topicId: r.topic_id,
  difficulty: r.difficulty,
  seed: r.seed,
  story: r.story,
  prompt: r.prompt,
  answer: JSON.parse(r.answer_json) as unknown,
  hints: Strings.parse(JSON.parse(r.hints_json)),
  steps: Strings.parse(JSON.parse(r.steps_json)),
  week: r.week,
  createdAt: r.created_at,
});

export const d1Bank = (db: D1Database): BankRepo => ({
  async weekCounts(week) {
    const { results } = await db
      .prepare(
        `SELECT topic_id, status, count(*) AS n FROM problem_bank WHERE week = ?1
         GROUP BY topic_id, status`,
      )
      .bind(week)
      .all<{ topic_id: string; status: 'accepted' | 'rejected'; n: number }>();
    const byTopic = new Map<string, number>();
    let accepted = 0;
    let attempted = 0;
    for (const r of results) {
      attempted += r.n;
      if (r.status === 'accepted') {
        accepted += r.n;
        byTopic.set(r.topic_id, (byTopic.get(r.topic_id) ?? 0) + r.n);
      }
    }
    return { accepted, attempted, byTopic };
  },

  async add(entry, status, reason) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO problem_bank
           (id, week, topic_id, difficulty, seed, story, prompt, answer_json, hints_json, steps_json,
            status, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      )
      .bind(
        entry.id,
        entry.week,
        entry.topicId,
        entry.difficulty,
        entry.seed,
        entry.story,
        entry.prompt,
        JSON.stringify(entry.answer),
        JSON.stringify(entry.hints),
        JSON.stringify(entry.steps),
        status,
        reason,
        entry.createdAt,
      )
      .run();
  },

  async page(since, limit) {
    const { results } = await db
      .prepare(
        `SELECT seq, id, week, topic_id, difficulty, seed, story, prompt, answer_json, hints_json,
                steps_json, created_at
         FROM problem_bank WHERE status = 'accepted' AND seq > ?1 ORDER BY seq LIMIT ?2`,
      )
      .bind(since, limit)
      .all<Row>();
    return { problems: results.map(toEntry), next: results.at(-1)?.seq ?? since };
  },
});
