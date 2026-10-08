import type { DayKey } from '@mflow/core';
import type { CheckOutcome } from './check';
import type { GeneratorRegistry } from './generators/registry';
import type { KnowledgeGraph } from './graph';
import { createRng } from './rng';
import type { Difficulty, Gate, Generator, LevelId, Problem } from './types';

export const MOCK_DIFFICULTY: Difficulty = 3;
const MAX_SEED = 2 ** 31 - 1;

export type MockExam = Readonly<{ level: LevelId; problems: readonly Problem[] }>;

export function buildMockExam(
  graph: KnowledgeGraph,
  registry: GeneratorRegistry,
  level: LevelId,
  seed: number,
  size: number,
): MockExam {
  const generators = graph.topics
    .filter((t) => t.level === level)
    .map((t) => registry.get(t.id))
    .filter((g): g is Generator => g !== undefined);
  if (generators.length === 0 || size <= 0) return { level, problems: [] };
  const rng = createRng(seed);
  const problems = Array.from({ length: size }, (_, i) =>
    (generators[i % generators.length] as Generator).generate(
      rng.int(0, MAX_SEED),
      MOCK_DIFFICULTY,
    ),
  );
  return { level, problems };
}

export const scoreMock = (outcomes: readonly CheckOutcome[]): number =>
  outcomes.length === 0 ? 0 : outcomes.filter((o) => o === 'correct').length / outcomes.length;

export type MockResult = Readonly<{ day: DayKey; level: LevelId; score: number }>;

/** Passing twice on the same day doesn't prove retention, so only distinct days count. */
export function gatePassed(gate: Gate, results: readonly MockResult[]): boolean {
  const passingDays = new Set(
    results.filter((r) => r.level === gate.level && r.score >= gate.minScore).map((r) => r.day),
  );
  return passingDays.size >= gate.requiredPasses;
}
