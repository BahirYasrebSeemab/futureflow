import type { Difficulty } from './types';

export const ELO_SCALE = 400;
export const DEFAULT_K = 32;
export const INITIAL_LEARNER_RATING = 1000;
export const PLACED_RATING = 1200;

/** Probability the learner answers an item of this rating correctly. */
export const expectedScore = (learner: number, item: number): number =>
  1 / (1 + 10 ** ((item - learner) / ELO_SCALE));

export function updateRatings(
  learner: number,
  item: number,
  correct: boolean,
  k = DEFAULT_K,
): Readonly<{ learner: number; item: number }> {
  const delta = k * ((correct ? 1 : 0) - expectedScore(learner, item));
  return { learner: learner + delta, item: item - delta };
}

export const initialItemRating = (difficulty: Difficulty): number => 600 + 200 * difficulty;
