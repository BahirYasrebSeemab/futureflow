import { exampleProblem, fadedSteps } from '@/lib/math/examples';

test('fadedSteps leaves the last step to the learner', () => {
  expect(fadedSteps(['a'])).toEqual({ shown: [], hidden: 1 });
  expect(fadedSteps(['a', 'b'])).toEqual({ shown: ['a'], hidden: 1 });
  expect(fadedSteps(['a', 'b', 'c', 'd'])).toEqual({ shown: ['a', 'b', 'c'], hidden: 1 });
  expect(fadedSteps([])).toEqual({ shown: [], hidden: 0 });
});

test('an example is an easy problem of the topic, deterministic per seed', () => {
  const p = exampleProblem('fractions', 7);
  expect([p.topicId, p.difficulty]).toEqual(['fractions', 1]);
  expect(exampleProblem('fractions', 7).prompt).toBe(p.prompt);
});

import { pickExamples } from '@/lib/math/examples';

test('examples are redrawn until they differ from the practice problem and each other', () => {
  const p = exampleProblem('fractions', 1);
  const seeds = [1, 1, 1, 2, 2, 3];
  let i = 0;
  const { worked, faded } = pickExamples('fractions', p.prompt, () => seeds[i++] ?? 100 + i);
  expect(worked.prompt).not.toBe(p.prompt);
  expect(faded.prompt).not.toBe(p.prompt);
  expect(faded.prompt).not.toBe(worked.prompt);
});
