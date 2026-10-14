import type { Plan } from '@futureflow/core';
import { PlanSchema } from '@futureflow/contracts';
import type { PlanRepo } from '../../ports';

type PlanRow = {
  day: string;
  status: Plan['status'];
  tasks_json: string;
  locked_at: number | null;
};

const TasksSchema = PlanSchema.shape.tasks;

export const d1Plans = (db: D1Database): PlanRepo => ({
  async get(day) {
    const row = await db
      .prepare('SELECT day, status, tasks_json, locked_at FROM plans WHERE day = ?1')
      .bind(day)
      .first<PlanRow>();
    if (row === null) return null;
    return {
      day: row.day,
      status: row.status,
      // Stored JSON is an edge too: it is validated on the way out.
      tasks: TasksSchema.parse(JSON.parse(row.tasks_json)),
      ...(row.locked_at === null ? {} : { lockedAt: row.locked_at }),
    };
  },

  async save(plan, at) {
    const result = await db
      .prepare(
        `INSERT INTO plans (day, status, tasks_json, locked_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (day) DO UPDATE SET
           status = excluded.status, tasks_json = excluded.tasks_json,
           locked_at = excluded.locked_at, updated_at = excluded.updated_at
         WHERE plans.status = 'draft'`,
      )
      .bind(plan.day, plan.status, JSON.stringify(plan.tasks), plan.lockedAt ?? null, at)
      .run();
    return result.meta.changes === 1;
  },
});
