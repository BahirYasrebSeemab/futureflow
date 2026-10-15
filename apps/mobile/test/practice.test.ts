import { answerText, newProgress, type TopicProgress } from '@/lib/math/engine';
import { displayAnswer } from '@/lib/math/display';
import { giveUp, gradeAttempt, serveProblem, type Served } from '@/lib/math/practice';

const answerOf = (s: Served): string =>
  s.problem.answer.type === 'choice'
    ? String(s.problem.answer.correctIndex)
    : answerText(s.problem.answer);

const empty = { progress: new Map<string, TopicProgress>(), itemRating: () => undefined };
const FIRST = 'whole-number-operations';
const ctx = (over: Partial<Parameters<typeof gradeAttempt>[2]> = {}) => ({
  usedHints: false,
  seenBefore: false,
  today: '2026-10-14',
  at: 1,
  id: '01920000-0000-7000-8000-000000000001',
  current: newProgress(FIRST),
  ...over,
});

test('a fresh learner starts at the first topic, in the target band, deterministically', () => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  expect(served.topicId).toBe(FIRST);
  expect(served.expected).toBeGreaterThanOrEqual(0.7);
  expect(served.expected).toBeLessThanOrEqual(0.85);
  expect(served.key).toBe(`${FIRST}:42:${served.difficulty}`);
  expect(serveProblem(empty, '2026-10-14', 42)!.problem.prompt).toBe(served.problem.prompt);
});

test('a correct answer raises the rating, counts toward mastery and earns', () => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  const g = gradeAttempt(served, answerOf(served), ctx());
  expect(g).toMatchObject({ outcome: 'correct', earns: true, reason: null });
  if (g.outcome === 'unreadable') throw new Error('graded');
  expect(g.progress.rating).toBeGreaterThan(1000);
  expect(g.progress.streak).toBe(1);
  expect(g.attempt).toMatchObject({
    id: '01920000-0000-7000-8000-000000000001',
    topicId: served.topicId,
    difficulty: served.difficulty,
    correct: true,
    answerType: 'typed',
    day: '2026-10-14',
    at: 1,
  });
  expect(g.itemKey).toBe(`${FIRST}:${served.difficulty}`);
  expect(g.itemRating).toBeLessThan(served.itemRating);
});

test('unreadable changes nothing', () => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  expect(gradeAttempt(served, 'abc', ctx())).toEqual({ outcome: 'unreadable' });
  expect(gradeAttempt(served, '', ctx())).toEqual({ outcome: 'unreadable' });
});

test('a wrong answer shows the right one, resets the streak and earns nothing', () => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  const g = gradeAttempt(served, '-999999', ctx({ current: { ...newProgress(FIRST), streak: 3 } }));
  expect(g).toMatchObject({
    outcome: 'incorrect',
    earns: false,
    reason: 'wrong',
    answer: displayAnswer(served.problem),
  });
  if (g.outcome === 'unreadable') throw new Error('graded');
  expect(g.progress.streak).toBe(0);
  expect(g.progress.rating).toBeLessThan(1000);
});

test.each([
  ['used_hints', { usedHints: true }],
  ['repeat', { seenBefore: true }],
] as const)('a correct answer earns nothing when %s', (reason, over) => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  expect(gradeAttempt(served, answerOf(served), ctx(over))).toMatchObject({
    outcome: 'correct',
    earns: false,
    reason,
  });
});

test('a repeated problem never earns, even when right', () => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  const g = gradeAttempt(served, answerOf(served), ctx({ seenBefore: true }));
  expect(g).toMatchObject({ earns: false, reason: 'repeat' });
});

test('too easy (predicted above 90%) earns nothing', () => {
  const strongProgress = { ...newProgress(FIRST), rating: 2400 };
  const strong = { progress: new Map([[FIRST, strongProgress]]), itemRating: () => undefined };
  const served = serveProblem(strong, '2026-10-14', 42)!;
  expect(served.expected).toBeGreaterThan(0.9);
  expect(gradeAttempt(served, answerOf(served), ctx({ current: strongProgress }))).toMatchObject({
    earns: false,
    reason: 'too_easy',
  });
});

test('a due review is served first and marked as a review', () => {
  const due: TopicProgress = {
    ...newProgress('fractions'),
    mastered: true,
    nextReviewDay: '2026-10-14',
  };
  const state = { progress: new Map([['fractions', due]]), itemRating: () => undefined };
  const served = serveProblem(state, '2026-10-14', 7)!;
  expect([served.topicId, served.isReview]).toEqual(['fractions', true]);
});

test('a chosen topic is served even when another is next', () => {
  expect(serveProblem(empty, '2026-10-14', 3, 'fractions')!.topicId).toBe('fractions');
});

test('a stored item rating moves the difficulty choice', () => {
  // A new learner (1000) is in band only at difficulty 1 (item 800, p≈0.76).
  expect(serveProblem(empty, '2026-10-14', 5)!.difficulty).toBe(1);
  // If difficulty 1 has proven much harder (2000), no level is in band; the closest is difficulty 2.
  const hardOnes = (key: string) => (key.endsWith(':1') ? 2000 : undefined);
  expect(
    serveProblem({ progress: new Map(), itemRating: hardOnes }, '2026-10-14', 5)!.difficulty,
  ).toBe(2);
});

test('showing the answer counts as a wrong attempt', () => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  expect(giveUp(served, ctx())).toMatchObject({
    outcome: 'incorrect',
    earns: false,
    reason: 'wrong',
    answer: displayAnswer(served.problem),
    attempt: { correct: false },
  });
});

test('a wrong decimal answer shows the right answer as a decimal, not a fraction', () => {
  // Find a decimals problem whose answer is not a whole number.
  let served: Served | null = null;
  for (let seed = 1; seed < 200 && served === null; seed++) {
    const s = serveProblem(empty, '2026-10-14', seed, 'decimals')!;
    if (s.problem.answer.type === 'number' && s.problem.answer.value.den !== 1) served = s;
  }
  if (served === null) throw new Error('no fractional decimals problem found');
  const g = giveUp(served, ctx({ current: newProgress('decimals') }));
  if (g.outcome === 'unreadable') throw new Error('graded');
  expect(g.answer).not.toContain('/');
  expect(g.answer).toBe(displayAnswer(served.problem));
});
