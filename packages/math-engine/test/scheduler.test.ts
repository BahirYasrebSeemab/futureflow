import { describe, expect, it } from 'vitest';
import { initialItemRating } from '../src/elo';
import type { KnowledgeGraph } from '../src/graph';
import { newProgress, type TopicProgress } from '../src/mastery';
import { earnsTime, nextTopic, pickDifficulty } from '../src/scheduler';
import type { Topic } from '../src/types';

describe('pickDifficulty', () => {
  it.each([
    [1000, 1],
    [1400, 3],
    [300, 1],
    [2500, 5],
  ])('learner %i gets difficulty %i', (rating, difficulty) => {
    expect(pickDifficulty(rating, initialItemRating)).toBe(difficulty);
  });
});

describe('earnsTime', () => {
  it('pays only for problems that are not too easy', () => {
    expect(earnsTime(0.9)).toBe(true);
    expect(earnsTime(0.91)).toBe(false);
  });
});

describe('nextTopic', () => {
  const t = (id: string, prerequisites: string[] = []): Topic => ({
    id,
    level: 'L0',
    title: id,
    prerequisites,
  });
  const graph: KnowledgeGraph = { topics: [t('a'), t('b', ['a']), t('c', ['a']), t('d', ['b'])] };
  const mastered = (id: string, nextReviewDay: string): TopicProgress => ({
    ...newProgress(id),
    mastered: true,
    nextReviewDay,
  });
  const TODAY = '2026-10-08';

  it('starts at the first topic for a new learner', () => {
    expect(nextTopic(graph, new Map(), TODAY)).toBe('a');
  });

  it('serves the earliest due review first', () => {
    const progress = new Map([
      ['a', mastered('a', '2026-10-07')],
      ['b', mastered('b', '2026-10-05')],
    ]);
    expect(nextTopic(graph, progress, TODAY)).toBe('b');
  });

  it('prefers the roadmap topic when it is unlocked', () => {
    const progress = new Map([['a', mastered('a', '2026-11-01')]]);
    expect(nextTopic(graph, progress, TODAY, 'c')).toBe('c');
  });

  it('ignores a locked roadmap topic and falls back to the frontier', () => {
    const progress = new Map([['a', mastered('a', '2026-11-01')]]);
    expect(nextTopic(graph, progress, TODAY, 'd')).toBe('b');
  });

  it('returns null when everything is mastered and nothing is due', () => {
    const progress = new Map(graph.topics.map((x) => [x.id, mastered(x.id, '2026-12-01')]));
    expect(nextTopic(graph, progress, TODAY)).toBeNull();
  });
});
