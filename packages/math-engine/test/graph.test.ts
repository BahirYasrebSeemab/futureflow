import { describe, expect, it } from 'vitest';
import { frontier, isUnlocked, validateGraph, type KnowledgeGraph } from '../src/graph';
import type { Topic } from '../src/types';

const t = (id: string, prerequisites: string[] = []): Topic => ({
  id,
  level: 'L0',
  title: id,
  prerequisites,
});
const graph: KnowledgeGraph = {
  topics: [t('a'), t('b', ['a']), t('c', ['a']), t('d', ['b', 'c'])],
};

describe('validateGraph', () => {
  it('accepts a graph whose prerequisites come first', () => {
    expect(validateGraph(graph)).toEqual({ ok: true, value: graph });
  });

  it.each([
    ['duplicate_topic', [t('a'), t('a')]],
    ['unknown_prerequisite', [t('a', ['zzz'])]],
    ['prerequisite_out_of_order', [t('b', ['a']), t('a')]],
    ['prerequisite_out_of_order', [t('a', ['a'])]],
  ])('reports %s', (error, topics) => {
    expect(validateGraph({ topics })).toEqual({ ok: false, error });
  });
});

describe('isUnlocked / frontier', () => {
  it('unlocks a topic only when all prerequisites are mastered', () => {
    expect(isUnlocked(graph, 'd', new Set(['a', 'b']))).toBe(false);
    expect(isUnlocked(graph, 'd', new Set(['a', 'b', 'c']))).toBe(true);
    expect(isUnlocked(graph, 'missing', new Set())).toBe(false);
  });

  it('lists unlocked, unmastered topics in graph order', () => {
    expect(frontier(graph, new Set()).map((x) => x.id)).toEqual(['a']);
    expect(frontier(graph, new Set(['a'])).map((x) => x.id)).toEqual(['b', 'c']);
    expect(frontier(graph, new Set(['a', 'b', 'c', 'd']))).toEqual([]);
  });
});
