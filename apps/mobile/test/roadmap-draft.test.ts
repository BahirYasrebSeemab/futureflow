import { RoadmapSchema } from '@futureflow/contracts';
import {
  addIdentity,
  addMilestone,
  addSkill,
  editIdentity,
  editMilestone,
  editSkill,
  emptyRoadmap,
  removeIdentity,
  removeSkill,
  roadmapProblems,
} from '@/lib/roadmap-draft';

const id = (n: number) => `01920000-0000-7000-8000-${String(n).padStart(12, '0')}`;

function filled() {
  let r = addIdentity(emptyRoadmap(), id(1));
  r = editIdentity(r, id(1), { title: 'Software engineer', why: 'Build things that matter' });
  r = addSkill(r, id(1), id(2), 'github');
  r = editSkill(r, id(2), { name: 'Coding', rubric: 'Ship small commits' });
  r = addMilestone(r, id(2), id(3));
  r = editMilestone(r, id(3), { title: 'Finish the sync engine' });
  return r;
}

test('a complete roadmap has no problems and fits the contract', () => {
  const r = filled();
  expect(roadmapProblems(r)).toEqual([]);
  expect(RoadmapSchema.safeParse(r).success).toBe(true);
});

test('removing an identity removes its skills and milestones', () => {
  const r = removeIdentity(filled(), id(1));
  expect(r).toEqual(emptyRoadmap());
  expect(roadmapProblems(r)).toEqual(['Add at least one identity.']);
});

test('removing a skill removes its milestones', () => {
  expect(removeSkill(filled(), id(2)).milestones).toEqual([]);
});

test('problems name what is missing or wrong', () => {
  let r = addIdentity(emptyRoadmap(), id(1));
  r = addSkill(r, id(1), id(2), 'reading');
  r = addMilestone(r, id(2), id(3));
  r = editIdentity(r, id(1), { deadline: '2027-13-40' });
  expect(roadmapProblems(r)).toEqual([
    'Give each identity a title.',
    'Say why each identity matters.',
    'Deadlines look like 2027-06-30.',
    'Name each skill.',
    'Say how each skill is judged.',
    'Name each milestone.',
  ]);
  for (let i = 0; i < 3; i++) r = addIdentity(r, id(10 + i));
  expect(roadmapProblems(r)).toContain('Up to 3 identities.');
});

test('edits are immutable; a rest day can be set and cleared', () => {
  const r = filled();
  const rested = editSkill(r, id(2), { restWeekday: 5 });
  expect(rested.skills[0]?.restWeekday).toBe(5);
  expect(r.skills[0]?.restWeekday).toBeUndefined();
  expect('restWeekday' in editSkill(rested, id(2), { restWeekday: null }).skills[0]!).toBe(false);
  expect(editMilestone(r, id(3), { done: true }).milestones[0]?.done).toBe(true);
});

test('text longer than the server allows is a problem', () => {
  let r = filled();
  r = editIdentity(r, id(1), { title: 'x'.repeat(81), why: 'y'.repeat(501) });
  r = editSkill(r, id(2), { name: 'n'.repeat(81), rubric: 'r'.repeat(501) });
  r = editMilestone(r, id(3), { title: 'm'.repeat(121) });
  expect(roadmapProblems(r)).toEqual([
    'Identity titles fit in 80 characters.',
    'Each why fits in 500 characters.',
    'Skill names fit in 80 characters.',
    'Each judging note fits in 500 characters.',
    'Milestone titles fit in 120 characters.',
  ]);
  expect(RoadmapSchema.safeParse(r).success).toBe(false);
});

test('length is measured on trimmed text, as the server does', () => {
  const r = editIdentity(filled(), id(1), { title: `  ${'x'.repeat(80)}  ` });
  expect(roadmapProblems(r)).toEqual([]);
  expect(RoadmapSchema.safeParse(r).success).toBe(true);
});
