import type { Roadmap } from '@mflow/contracts';
import type { RoadmapRepo } from '../../ports';

type IdentityRow = { id: string; title: string; why: string; deadline: string | null };
type SkillRow = {
  id: string;
  identity_id: string;
  name: string;
  rubric: string;
  verifier: Roadmap['skills'][number]['verifier'];
  rest_weekday: number | null;
};
type MilestoneRow = {
  id: string;
  skill_id: string;
  title: string;
  target_date: string | null;
  done: number;
};

export const d1Roadmap = (db: D1Database): RoadmapRepo => ({
  async get() {
    const [identities, skills, milestones] = await db.batch([
      db.prepare('SELECT id, title, why, deadline FROM identities ORDER BY position'),
      db.prepare(
        'SELECT id, identity_id, name, rubric, verifier, rest_weekday FROM skills ORDER BY position',
      ),
      db.prepare('SELECT id, skill_id, title, target_date, done FROM milestones ORDER BY position'),
    ]);
    return {
      identities: ((identities?.results ?? []) as IdentityRow[]).map((r) => ({
        id: r.id,
        title: r.title,
        why: r.why,
        ...(r.deadline === null ? {} : { deadline: r.deadline }),
      })),
      skills: ((skills?.results ?? []) as SkillRow[]).map((r) => ({
        id: r.id,
        identityId: r.identity_id,
        name: r.name,
        rubric: r.rubric,
        verifier: r.verifier,
        ...(r.rest_weekday === null ? {} : { restWeekday: r.rest_weekday }),
      })),
      milestones: ((milestones?.results ?? []) as MilestoneRow[]).map((r) => ({
        id: r.id,
        skillId: r.skill_id,
        title: r.title,
        ...(r.target_date === null ? {} : { targetDate: r.target_date }),
        done: r.done === 1,
      })),
    };
  },

  async replace(roadmap, at) {
    // Children first on delete, parents first on insert; `key` is the array index (the order).
    await db.batch([
      db.prepare('DELETE FROM milestones'),
      db.prepare('DELETE FROM skills'),
      db.prepare('DELETE FROM identities'),
      db
        .prepare(
          `INSERT INTO identities (id, title, why, deadline, position, updated_at)
           SELECT value->>'id', value->>'title', value->>'why', value->>'deadline', key, ?2
           FROM json_each(?1)`,
        )
        .bind(JSON.stringify(roadmap.identities), at),
      db
        .prepare(
          `INSERT INTO skills (id, identity_id, name, rubric, verifier, rest_weekday, position, updated_at)
           SELECT value->>'id', value->>'identityId', value->>'name', value->>'rubric',
                  value->>'verifier', value->>'restWeekday', key, ?2
           FROM json_each(?1)`,
        )
        .bind(JSON.stringify(roadmap.skills), at),
      db
        .prepare(
          `INSERT INTO milestones (id, skill_id, title, target_date, done, position, updated_at)
           SELECT value->>'id', value->>'skillId', value->>'title', value->>'targetDate',
                  value->>'done', key, ?2
           FROM json_each(?1)`,
        )
        .bind(JSON.stringify(roadmap.milestones), at),
    ]);
  },
});
