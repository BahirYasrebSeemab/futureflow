import { describe, expect, it } from 'vitest';
import { GATES, ONTARIO_GRAPH } from '../src/curriculum';
import { fractionsGenerator } from '../src/generators/fractions';
import { integersGenerator } from '../src/generators/integers';
import { orderOfOperationsGenerator } from '../src/generators/order-of-operations';
import { createRegistry, DEFAULT_REGISTRY } from '../src/generators/registry';
import {
  buildMockExam,
  gatePassed,
  mockTopicIds,
  scoreMock,
  type MockResult,
} from '../src/mock-exam';

const gateA = GATES.find((g) => g.id === 'A');
if (gateA === undefined) throw new Error('gate A missing');

describe('buildMockExam', () => {
  it('covers every L0 topic that has a generator, evenly, at difficulty 3', () => {
    const registry = createRegistry([
      integersGenerator,
      fractionsGenerator,
      orderOfOperationsGenerator,
    ]);
    const exam = buildMockExam(ONTARIO_GRAPH, registry, 'L0', 42, 6);
    expect(exam.problems.map((p) => p.topicId)).toEqual([
      'integers',
      'order-of-operations',
      'fractions',
      'integers',
      'order-of-operations',
      'fractions',
    ]);
    expect(exam.problems.every((p) => p.difficulty === 3)).toBe(true);
  });

  it('is reproducible from its seed', () => {
    const a = buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L1', 7, 4);
    expect(buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L1', 7, 4)).toEqual(a);
  });

  it('is empty for a level without generators or a non-positive size', () => {
    expect(buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L2', 1, 5).problems).toEqual([]);
    expect(buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L0', 1, 0).problems).toEqual([]);
  });
});

describe('scoreMock', () => {
  it('counts unreadable as wrong', () => {
    expect(scoreMock(['correct', 'incorrect', 'unreadable', 'correct'])).toBe(0.5);
    expect(scoreMock([])).toBe(0);
  });
});

describe('gatePassed', () => {
  const l2 = ONTARIO_GRAPH.topics.filter((t) => t.level === 'L2').map((t) => t.id);
  const pass = (day: string, score = 0.8, topicIds: readonly string[] = l2): MockResult => ({
    day,
    level: 'L2',
    score,
    topicIds,
  });

  it('needs the required passes on distinct days', () => {
    expect(gatePassed(gateA, [pass('2026-10-08'), pass('2026-10-08')], ONTARIO_GRAPH)).toBe(false);
    expect(gatePassed(gateA, [pass('2026-10-08'), pass('2026-10-10')], ONTARIO_GRAPH)).toBe(true);
  });

  it('ignores low scores and other levels', () => {
    expect(gatePassed(gateA, [pass('2026-10-08', 0.74), pass('2026-10-09')], ONTARIO_GRAPH)).toBe(
      false,
    );
    const otherLevel: MockResult = { day: '2026-10-08', level: 'L1', score: 1, topicIds: l2 };
    expect(gatePassed(gateA, [otherLevel, pass('2026-10-09')], ONTARIO_GRAPH)).toBe(false);
  });

  it('never counts a mock that skipped a topic of the level', () => {
    const partial = l2.slice(0, -1);
    expect(
      gatePassed(
        gateA,
        [pass('2026-10-08', 1, partial), pass('2026-10-09', 1, partial)],
        ONTARIO_GRAPH,
      ),
    ).toBe(false);
    expect(
      gatePassed(
        gateA,
        [pass('2026-10-08', 1, ['factoring']), pass('2026-10-09', 1, ['factoring'])],
        ONTARIO_GRAPH,
      ),
    ).toBe(false);
  });
});

describe('mockTopicIds', () => {
  it('lists the distinct topics an exam covered', () => {
    const exam = buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L1', 3, 10);
    expect(mockTopicIds(exam)).toEqual([...new Set(exam.problems.map((p) => p.topicId))]);
  });
});
