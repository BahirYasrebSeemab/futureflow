import { describe, expect, it } from 'vitest';
import { GATES, ONTARIO_GRAPH } from '../src/curriculum';
import { validateGraph } from '../src/graph';

describe('ONTARIO_GRAPH', () => {
  it('is a valid graph', () => {
    expect(validateGraph(ONTARIO_GRAPH).ok).toBe(true);
  });

  it('starts from arithmetic and covers L0, L1 and L2 in order', () => {
    const levels = ONTARIO_GRAPH.topics.map((topic) => topic.level);
    expect(ONTARIO_GRAPH.topics[0]?.id).toBe('whole-number-operations');
    expect([...new Set(levels)]).toEqual(['L0', 'L1', 'L2']);
  });

  it('includes the MPM2D strands', () => {
    const ids = ONTARIO_GRAPH.topics.map((topic) => topic.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'quadratic-relations',
        'analytic-geometry',
        'right-triangle-trigonometry',
      ]),
    );
  });
});

describe('GATES', () => {
  it('requires 2 passes at 75% for gate A and 3 at 80% for challenge gates', () => {
    expect(GATES.find((g) => g.id === 'A')).toEqual({
      id: 'A',
      level: 'L2',
      minScore: 0.75,
      requiredPasses: 2,
    });
    expect(
      GATES.filter((g) => g.id !== 'A').every((g) => g.minScore === 0.8 && g.requiredPasses === 3),
    ).toBe(true);
  });
});
