import {
  buildMockExam,
  type CheckOutcome,
  DEFAULT_REGISTRY,
  gatePassed,
  GATES,
  type LevelId,
  type MockResult,
  ONTARIO_GRAPH,
  type Problem,
  recommendedMockSize,
  scoreMock,
} from './engine';

/** The levels with generators today; L3–L5 arrive with their phase (P7). */
export const MOCK_LEVELS: readonly LevelId[] = ['L0', 'L1', 'L2'];
export const MS_PER_QUESTION = 120_000;

export type RunningMock = Readonly<{
  level: LevelId;
  problems: readonly Problem[];
  endsAt: number;
}>;

/** Every topic of the level at every mock difficulty (spec §10.7), two minutes a question. */
export function startMock(level: LevelId, seed: number, startedAt: number): RunningMock {
  const size = recommendedMockSize(ONTARIO_GRAPH, DEFAULT_REGISTRY, level);
  const exam = buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, level, seed, size);
  return {
    level,
    problems: exam.problems,
    endsAt: startedAt + exam.problems.length * MS_PER_QUESTION,
  };
}

/** `null` = not answered before the end or the time limit: it counts as wrong. */
export function finishMock(
  mock: RunningMock,
  outcomes: readonly (CheckOutcome | null)[],
  day: string,
): MockResult {
  const scored = mock.problems.map((_, i) => outcomes[i] ?? 'incorrect');
  return {
    day,
    level: mock.level,
    score: scoreMock(scored),
    topicIds: [...new Set(mock.problems.map((p) => p.topicId))],
    problemCount: mock.problems.length,
  };
}

const GATE_A = GATES.find((g) => g.id === 'A');

/** Gate A (L2): passing mocks counted once per day; `gatePassed` decides what counts. */
export function gateProgress(results: readonly MockResult[]): {
  passes: number;
  required: number;
  passed: boolean;
} {
  if (GATE_A === undefined) return { passes: 0, required: 0, passed: false };
  const days = [...new Set(results.map((r) => r.day))];
  const once = { ...GATE_A, requiredPasses: 1 };
  const passes = days.filter((day) =>
    gatePassed(
      once,
      results.filter((r) => r.day === day),
      ONTARIO_GRAPH,
    ),
  ).length;
  return {
    passes,
    required: GATE_A.requiredPasses,
    passed: gatePassed(GATE_A, results, ONTARIO_GRAPH),
  };
}
