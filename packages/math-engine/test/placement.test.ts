import { describe, expect, it } from 'vitest';
import type { KnowledgeGraph } from '../src/graph';
import {
  placementProbe,
  placementProgress,
  recordPlacementAnswer,
  startPlacement,
  type PlacementState,
} from '../src/placement';

/** Simulates a learner who knows exactly the first `known` topics. */
function run(topicCount: number, known: number): { state: PlacementState; asked: number } {
  let state = startPlacement(topicCount);
  let asked = 0;
  for (let probe = placementProbe(state); probe !== null; probe = placementProbe(state)) {
    state = recordPlacementAnswer(state, probe < known);
    asked += 1;
  }
  return { state, asked };
}

describe('placement', () => {
  it.each([
    [8, 0, 4],
    [8, 8, 6],
    [8, 3, 4],
    [26, 13, 10],
  ])('with %i topics and %i known, finds the frontier', (topics, known, maxAsked) => {
    const { state, asked } = run(topics, known);
    expect(state.low).toBe(known);
    expect(asked).toBeLessThanOrEqual(maxAsked);
  });

  it('asks nothing for an empty graph', () => {
    expect(placementProbe(startPlacement(0))).toBeNull();
  });

  it('ignores answers after placement is done', () => {
    const done = run(4, 4).state;
    expect(recordPlacementAnswer(done, false)).toBe(done);
  });

  it('marks topics before the frontier as mastered with a review due today', () => {
    const graph: KnowledgeGraph = {
      topics: ['a', 'b', 'c'].map((id) => ({ id, level: 'L0', title: id, prerequisites: [] })),
    };
    const progress = placementProgress(graph, { low: 2, high: 2, correctAtProbe: 0 }, '2026-10-08');
    expect(progress.get('a')).toMatchObject({
      mastered: true,
      rating: 1200,
      nextReviewDay: '2026-10-08',
    });
    expect(progress.get('b')?.mastered).toBe(true);
    expect(progress.get('c')).toMatchObject({ mastered: false, rating: 1000 });
  });
});
