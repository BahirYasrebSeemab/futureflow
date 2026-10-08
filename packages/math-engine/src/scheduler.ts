import type { DayKey } from '@mflow/core';
import { expectedScore } from './elo';
import { frontier, isUnlocked, type KnowledgeGraph } from './graph';
import { isReviewDue, type TopicProgress } from './mastery';
import { DIFFICULTIES, type Difficulty } from './types';

/** Desirable difficulty: fastest learning happens at a high-but-imperfect success rate. */
export const TARGET_BAND = { min: 0.7, max: 0.85 } as const;
export const TARGET_MIDPOINT = 0.775;
export const EARNING_MAX_EXPECTED = 0.9;

export function pickDifficulty(
  learnerRating: number,
  itemRating: (difficulty: Difficulty) => number,
): Difficulty {
  const scored = DIFFICULTIES.map((d) => ({ d, p: expectedScore(learnerRating, itemRating(d)) }));
  const inBand = scored.filter((s) => s.p >= TARGET_BAND.min && s.p <= TARGET_BAND.max);
  if (inBand.length > 0) return inBand.reduce((hardest, s) => (s.p < hardest.p ? s : hardest)).d;
  const distance = (p: number): number => Math.abs(p - TARGET_MIDPOINT);
  return scored.reduce((best, s) => (distance(s.p) < distance(best.p) ? s : best)).d;
}

/** Problems you'd almost surely get right are practice, not work: they earn no phone time. */
export const earnsTime = (expected: number): boolean => expected <= EARNING_MAX_EXPECTED;

export function nextTopic(
  graph: KnowledgeGraph,
  progress: ReadonlyMap<string, TopicProgress>,
  today: DayKey,
  roadmapTopicId?: string,
): string | null {
  const due = [...progress.values()].filter((p) => isReviewDue(p, today));
  if (due.length > 0) {
    return due.reduce((first, p) =>
      (p.nextReviewDay ?? '') < (first.nextReviewDay ?? '') ? p : first,
    ).topicId;
  }
  const mastered = new Set([...progress.values()].filter((p) => p.mastered).map((p) => p.topicId));
  if (
    roadmapTopicId !== undefined &&
    !mastered.has(roadmapTopicId) &&
    isUnlocked(graph, roadmapTopicId, mastered)
  ) {
    return roadmapTopicId;
  }
  return frontier(graph, mastered)[0]?.id ?? null;
}
