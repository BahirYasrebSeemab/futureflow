import { describe, expect, it } from 'vitest';
import { RoadmapSchema } from '../src';

const ids = {
  swe: '01920000-0000-7000-8000-00000000000a',
  debug: '01920000-0000-7000-8000-00000000000b',
  m1: '01920000-0000-7000-8000-00000000000c',
};
const roadmap = {
  identities: [{ id: ids.swe, title: 'Senior software engineer', why: 'Build things that last' }],
  skills: [
    {
      id: ids.debug,
      identityId: ids.swe,
      name: 'Debugging',
      rubric: 'Root cause found and tested',
      verifier: 'github',
      restWeekday: 5,
    },
  ],
  milestones: [
    { id: ids.m1, skillId: ids.debug, title: 'Fix 3 real bugs with tests', done: false },
  ],
};

describe('RoadmapSchema', () => {
  it('accepts a consistent roadmap', () => {
    expect(RoadmapSchema.parse(roadmap)).toEqual(roadmap);
  });

  it.each([
    ['no identity', { ...roadmap, identities: [] }],
    [
      'a skill of an unknown identity',
      { ...roadmap, skills: [{ ...roadmap.skills[0], identityId: ids.m1 }] },
    ],
    [
      'a milestone of an unknown skill',
      { ...roadmap, milestones: [{ ...roadmap.milestones[0], skillId: ids.swe }] },
    ],
    ['a repeated id', { ...roadmap, milestones: [{ ...roadmap.milestones[0], id: ids.debug }] }],
    ['a rest weekday of 7', { ...roadmap, skills: [{ ...roadmap.skills[0], restWeekday: 7 }] }],
    ['an unknown verifier', { ...roadmap, skills: [{ ...roadmap.skills[0], verifier: 'camera' }] }],
  ])('rejects %s', (_label, value) => {
    expect(RoadmapSchema.safeParse(value).success).toBe(false);
  });
});
