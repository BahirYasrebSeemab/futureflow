import type { DayKey } from '@futureflow/core';
import { PLACED_RATING } from './elo';
import type { KnowledgeGraph } from './graph';
import { newProgress, type TopicProgress } from './mastery';

export const QUESTIONS_PER_PROBE = 2;

/** Binary search for the first topic the learner does not know: [low, high) is still unknown. */
export type PlacementState = Readonly<{ low: number; high: number; correctAtProbe: number }>;

export const startPlacement = (topicCount: number): PlacementState => ({
  low: 0,
  high: topicCount,
  correctAtProbe: 0,
});

export const placementProbe = (s: PlacementState): number | null =>
  s.low >= s.high ? null : Math.floor((s.low + s.high) / 2);

/** One wrong answer marks the probe unknown; QUESTIONS_PER_PROBE right answers mark it known. */
export function recordPlacementAnswer(s: PlacementState, correct: boolean): PlacementState {
  const probe = placementProbe(s);
  if (probe === null) return s;
  if (!correct) return { low: s.low, high: probe, correctAtProbe: 0 };
  const streak = s.correctAtProbe + 1;
  if (streak < QUESTIONS_PER_PROBE) return { ...s, correctAtProbe: streak };
  return { low: probe + 1, high: s.high, correctAtProbe: 0 };
}

/** Assumed-known topics get a review due today, so a wrong assumption is caught immediately. */
export function placementProgress(
  graph: KnowledgeGraph,
  s: PlacementState,
  today: DayKey,
): ReadonlyMap<string, TopicProgress> {
  return new Map(
    graph.topics.map((topic, index): [string, TopicProgress] => [
      topic.id,
      index < s.low
        ? { ...newProgress(topic.id, PLACED_RATING), mastered: true, nextReviewDay: today }
        : newProgress(topic.id),
    ]),
  );
}
