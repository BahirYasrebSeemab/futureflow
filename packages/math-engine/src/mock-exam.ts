import type { DayKey } from '@futureflow/core';
import type { CheckOutcome } from './check';
import type { GeneratorRegistry } from './generators/registry';
import type { KnowledgeGraph } from './graph';
import { createRng } from './rng';
import type { Difficulty, Gate, Generator, LevelId, Problem } from './types';

const MAX_SEED = 2 ** 31 - 1;

export type MockExam = Readonly<{ level: LevelId; problems: readonly Problem[] }>;

/** Each round through the topics is one level harder, so every skill variant (d1–d5) is tested. */
export const MOCK_DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5];

const levelGenerators = (
  graph: KnowledgeGraph,
  registry: GeneratorRegistry,
  level: LevelId,
): Generator[] =>
  graph.topics
    .filter((t) => t.level === level)
    .map((t) => registry.get(t.id))
    .filter((g): g is Generator => g !== undefined);

/** Enough problems for every topic at every mock difficulty. */
export const recommendedMockSize = (
  graph: KnowledgeGraph,
  registry: GeneratorRegistry,
  level: LevelId,
): number => levelGenerators(graph, registry, level).length * MOCK_DIFFICULTIES.length;

export function buildMockExam(
  graph: KnowledgeGraph,
  registry: GeneratorRegistry,
  level: LevelId,
  seed: number,
  size: number,
): MockExam {
  const generators = levelGenerators(graph, registry, level);
  if (generators.length === 0 || size <= 0) return { level, problems: [] };
  const rng = createRng(seed);
  const problems = Array.from({ length: size }, (_, i) => {
    const generator = generators[i % generators.length] as Generator;
    const difficulty = MOCK_DIFFICULTIES[
      Math.floor(i / generators.length) % MOCK_DIFFICULTIES.length
    ] as Difficulty;
    return generator.generate(rng.int(0, MAX_SEED), difficulty);
  });
  return { level, problems };
}

export const scoreMock = (outcomes: readonly CheckOutcome[]): number =>
  outcomes.length === 0 ? 0 : outcomes.filter((o) => o === 'correct').length / outcomes.length;

export type MockResult = Readonly<{
  day: DayKey;
  level: LevelId;
  score: number;
  topicIds: readonly string[];
  problemCount: number;
}>;

export const mockTopicIds = (exam: MockExam): string[] => [
  ...new Set(exam.problems.map((p) => p.topicId)),
];

/**
 * A gate passes after `requiredPasses` good mocks on distinct days, and only mocks that
 * covered every topic of the level count: a one-topic "mock" proves nothing about the exam.
 */
export function gatePassed(
  gate: Gate,
  results: readonly MockResult[],
  graph: KnowledgeGraph,
): boolean {
  const required = graph.topics.filter((t) => t.level === gate.level).map((t) => t.id);
  const counts = (r: MockResult): boolean =>
    r.level === gate.level &&
    r.score >= gate.minScore &&
    required.every((id) => r.topicIds.includes(id)) &&
    r.problemCount >= required.length * MOCK_DIFFICULTIES.length;
  return new Set(results.filter(counts).map((r) => r.day)).size >= gate.requiredPasses;
}
