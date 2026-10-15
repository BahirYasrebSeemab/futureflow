import { DayKeySchema } from '@futureflow/contracts';
import type { Roadmap } from './api/client';

type Verifier = Roadmap['skills'][number]['verifier'];
const MAX_IDENTITIES = 3;
const MAX_SKILLS = 12;
const MAX_MILESTONES = 100;

export const emptyRoadmap = (): Roadmap => ({ identities: [], skills: [], milestones: [] });

export const addIdentity = (r: Roadmap, id: string): Roadmap => ({
  ...r,
  identities: [...r.identities, { id, title: '', why: '' }],
});

export function editIdentity(
  r: Roadmap,
  id: string,
  patch: Partial<{ title: string; why: string; deadline: string | null }>,
): Roadmap {
  return {
    ...r,
    identities: r.identities.map((i) => {
      if (i.id !== id) return i;
      const { deadline, ...rest } = { ...i, ...patch };
      return deadline === null || deadline === undefined || deadline === ''
        ? rest
        : { ...rest, deadline };
    }),
  };
}

/** Removing an identity removes its skills, and their milestones. */
export function removeIdentity(r: Roadmap, id: string): Roadmap {
  const gone = new Set(r.skills.filter((s) => s.identityId === id).map((s) => s.id));
  return {
    identities: r.identities.filter((i) => i.id !== id),
    skills: r.skills.filter((s) => !gone.has(s.id)),
    milestones: r.milestones.filter((m) => !gone.has(m.skillId)),
  };
}

export const addSkill = (
  r: Roadmap,
  identityId: string,
  id: string,
  verifier: Verifier,
): Roadmap => ({
  ...r,
  skills: [...r.skills, { id, identityId, name: '', rubric: '', verifier }],
});

export function editSkill(
  r: Roadmap,
  id: string,
  patch: Partial<{ name: string; rubric: string; verifier: Verifier; restWeekday: number | null }>,
): Roadmap {
  return {
    ...r,
    skills: r.skills.map((s) => {
      if (s.id !== id) return s;
      const { restWeekday, ...rest } = { ...s, ...patch };
      return restWeekday === null || restWeekday === undefined ? rest : { ...rest, restWeekday };
    }),
  };
}

/** Removing a skill removes its milestones. */
export const removeSkill = (r: Roadmap, id: string): Roadmap => ({
  ...r,
  skills: r.skills.filter((s) => s.id !== id),
  milestones: r.milestones.filter((m) => m.skillId !== id),
});

export const addMilestone = (r: Roadmap, skillId: string, id: string): Roadmap => ({
  ...r,
  milestones: [...r.milestones, { id, skillId, title: '', done: false }],
});

export const editMilestone = (
  r: Roadmap,
  id: string,
  patch: Partial<{ title: string; done: boolean }>,
): Roadmap => ({
  ...r,
  milestones: r.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)),
});

export const removeMilestone = (r: Roadmap, id: string): Roadmap => ({
  ...r,
  milestones: r.milestones.filter((m) => m.id !== id),
});

const blank = (text: string) => text.trim() === '';

/** What would make the server refuse the roadmap (RoadmapSchema), in plain words, once each. */
export function roadmapProblems(r: Roadmap): string[] {
  const checks: [boolean, string][] = [
    [r.identities.length === 0, 'Add at least one identity.'],
    [r.identities.length > MAX_IDENTITIES, `Up to ${MAX_IDENTITIES} identities.`],
    [r.identities.some((i) => blank(i.title)), 'Give each identity a title.'],
    [r.identities.some((i) => blank(i.why)), 'Say why each identity matters.'],
    [
      r.identities.some(
        (i) => i.deadline !== undefined && !DayKeySchema.safeParse(i.deadline).success,
      ),
      'Deadlines look like 2027-06-30.',
    ],
    [r.skills.length > MAX_SKILLS, `Up to ${MAX_SKILLS} skills.`],
    [r.skills.some((s) => blank(s.name)), 'Name each skill.'],
    [r.skills.some((s) => blank(s.rubric)), 'Say how each skill is judged.'],
    [r.milestones.length > MAX_MILESTONES, `Up to ${MAX_MILESTONES} milestones.`],
    [r.milestones.some((m) => blank(m.title)), 'Name each milestone.'],
  ];
  return checks.filter(([failed]) => failed).map(([, message]) => message);
}
