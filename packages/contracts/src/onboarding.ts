import { VERIFIER_KINDS } from '@mflow/core';
import { z } from 'zod';
import { DayKeySchema, PlanSchema } from './schemas';

export const IdentitySchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(80),
  why: z.string().trim().min(1).max(500),
  deadline: DayKeySchema.optional(),
});

export const SkillSchema = z.object({
  id: z.uuid(),
  identityId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  rubric: z.string().trim().min(1).max(500),
  /** How this skill's tasks are checked by default. */
  verifier: z.enum(VERIFIER_KINDS),
  /** 0 = Sunday … 6 = Saturday: no tasks for this skill that day. */
  restWeekday: z.number().int().min(0).max(6).optional(),
});

export const MilestoneSchema = z.object({
  id: z.uuid(),
  skillId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  targetDate: DayKeySchema.optional(),
  done: z.boolean(),
});

export const RoadmapSchema = z
  .object({
    identities: z.array(IdentitySchema).min(1).max(3),
    skills: z.array(SkillSchema).max(12),
    milestones: z.array(MilestoneSchema).max(100),
  })
  .superRefine((r, ctx) => {
    const identityIds = new Set(r.identities.map((i) => i.id));
    const skillIds = new Set(r.skills.map((s) => s.id));
    const all = [...r.identities, ...r.skills, ...r.milestones].map((x) => x.id);
    if (new Set(all).size !== all.length)
      ctx.addIssue({ code: 'custom', message: 'ids must be unique' });
    r.skills.forEach((s, i) => {
      if (!identityIds.has(s.identityId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'unknown identity',
          path: ['skills', i, 'identityId'],
        });
      }
    });
    r.milestones.forEach((m, i) => {
      if (!skillIds.has(m.skillId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'unknown skill',
          path: ['milestones', i, 'skillId'],
        });
      }
    });
  });

export const ProposeResponseSchema = z.object({
  plan: PlanSchema,
  source: z.enum(['ai', 'template']),
});

export type Roadmap = z.infer<typeof RoadmapSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
