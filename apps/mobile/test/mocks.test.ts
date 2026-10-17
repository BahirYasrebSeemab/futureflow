import { checkAnswer, ONTARIO_GRAPH } from '@/lib/math/engine';
import { finishMock, gateProgress, MOCK_LEVELS, startMock } from '@/lib/math/mocks';

const L2_TOPICS = ONTARIO_GRAPH.topics.filter((t) => t.level === 'L2').map((t) => t.id);

test('a mock covers every topic of its level at every difficulty, with 2 minutes a question', () => {
  const exam = startMock('L2', 42, 1_000);
  expect(exam.problems).toHaveLength(L2_TOPICS.length * 5);
  expect(new Set(exam.problems.map((p) => p.topicId))).toEqual(new Set(L2_TOPICS));
  expect(exam.endsAt).toBe(1_000 + exam.problems.length * 120_000);
  expect(MOCK_LEVELS).toEqual(['L0', 'L1', 'L2']);
});

test('unanswered questions count as wrong', () => {
  const exam = startMock('L0', 7, 0);
  const outcomes = exam.problems.map((p, i) => (i < 2 ? checkAnswer(p.answer, '-999999') : null));
  const result = finishMock(exam, outcomes, '2026-10-14');
  expect(result).toMatchObject({
    day: '2026-10-14',
    level: 'L0',
    score: 0,
    problemCount: exam.problems.length,
  });
  const allRight = finishMock(
    exam,
    exam.problems.map(() => 'correct' as const),
    '2026-10-14',
  );
  expect(allRight.score).toBe(1);
});

const l2 = (day: string, score: number) => ({
  day,
  level: 'L2' as const,
  score,
  topicIds: L2_TOPICS,
  problemCount: L2_TOPICS.length * 5,
});

test('same-day mocks do not pass the gate', () => {
  expect(gateProgress([l2('2026-10-14', 0.9), l2('2026-10-14', 0.8)])).toEqual({
    passes: 1,
    required: 2,
    passed: false,
  });
});

test('two passing L2 mocks on two days pass Gate A; a low score or a partial mock does not count', () => {
  expect(gateProgress([l2('2026-10-13', 0.75), l2('2026-10-14', 0.8)]).passed).toBe(true);
  expect(gateProgress([l2('2026-10-13', 0.74), l2('2026-10-14', 0.8)]).passes).toBe(1);
  const partial = { ...l2('2026-10-13', 0.9), topicIds: L2_TOPICS.slice(1) };
  expect(gateProgress([partial, l2('2026-10-14', 0.8)]).passes).toBe(1);
});
