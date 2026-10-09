import { addDays, type DayKey } from '@mflow/core';
import { INITIAL_LEARNER_RATING } from './elo';

export type TopicProgress = Readonly<{
  topicId: string;
  rating: number;
  streak: number;
  mastered: boolean;
  reviewStage: number;
  nextReviewDay?: DayKey;
}>;

export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 16, 35] as const;
export const MASTERY_STREAK = 5;

export const newProgress = (topicId: string, rating = INITIAL_LEARNER_RATING): TopicProgress => ({
  topicId,
  rating,
  streak: 0,
  mastered: false,
  reviewStage: 0,
});

export type AttemptOutcome = Readonly<{ correct: boolean; usedHints: boolean; isReview: boolean }>;

export function recordAttempt(
  p: TopicProgress,
  outcome: AttemptOutcome,
  rating: number,
  today: DayKey,
): TopicProgress {
  if (!p.mastered) {
    const streak = outcome.correct && !outcome.usedHints ? p.streak + 1 : 0;
    if (streak < MASTERY_STREAK) return { ...p, rating, streak };
    const nextReviewDay = addDays(today, REVIEW_INTERVALS_DAYS[0]);
    return { ...p, rating, streak, mastered: true, reviewStage: 0, nextReviewDay };
  }
  if (!outcome.isReview) return { ...p, rating };
  if (!outcome.correct) return newProgress(p.topicId, rating);

  const reviewStage = p.reviewStage + 1;
  const interval = REVIEW_INTERVALS_DAYS[reviewStage];
  if (interval === undefined) {
    return { topicId: p.topicId, rating, streak: p.streak, mastered: true, reviewStage };
  }
  return { ...p, rating, reviewStage, nextReviewDay: addDays(today, interval) };
}

export const isReviewDue = (p: TopicProgress, today: DayKey): boolean =>
  p.mastered && p.nextReviewDay !== undefined && p.nextReviewDay <= today;
