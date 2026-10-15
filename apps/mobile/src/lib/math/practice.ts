import type { MathAttempt } from '@futureflow/contracts';
import {
  answerText,
  checkAnswer,
  DEFAULT_REGISTRY,
  type Difficulty,
  earnsTime,
  expectedScore,
  initialItemRating,
  newProgress,
  nextTopic,
  ONTARIO_GRAPH,
  pickDifficulty,
  type Problem,
  recordAttempt,
  type TopicProgress,
  updateRatings,
} from './engine';

const INITIAL_RATING = 1000;

export type MathState = Readonly<{
  progress: ReadonlyMap<string, TopicProgress>;
  /** By `${topicId}:${difficulty}`; undefined when the item has no history yet. */
  itemRating: (key: string) => number | undefined;
}>;

export type Served = Readonly<{
  problem: Problem;
  topicId: string;
  difficulty: Difficulty;
  seed: number;
  /** `${topicId}:${seed}:${difficulty}`: the same problem served again is a repeat. */
  key: string;
  /** Predicted success when served; above 0.90 the problem is practice and earns nothing. */
  expected: number;
  isReview: boolean;
  learnerRating: number;
  itemRating: number;
}>;

export const itemKey = (topicId: string, difficulty: Difficulty): string =>
  `${topicId}:${difficulty}`;

/** Reviews first, then the next topic; difficulty chosen so success is predicted at 70–85%. */
export function serveProblem(
  state: MathState,
  today: string,
  seed: number,
  topicOverride?: string,
): Served | null {
  const topicId = topicOverride ?? nextTopic(ONTARIO_GRAPH, state.progress, today);
  if (topicId === null) return null;
  const generator = DEFAULT_REGISTRY.get(topicId);
  if (generator === undefined) return null;
  const progress = state.progress.get(topicId);
  const learnerRating = progress?.rating ?? INITIAL_RATING;
  const ratingOf = (d: Difficulty) => state.itemRating(itemKey(topicId, d)) ?? initialItemRating(d);
  const difficulty = pickDifficulty(learnerRating, ratingOf);
  const itemRating = ratingOf(difficulty);
  const isReview =
    progress?.mastered === true &&
    progress.nextReviewDay !== undefined &&
    progress.nextReviewDay <= today;
  return {
    problem: generator.generate(seed, difficulty),
    topicId,
    difficulty,
    seed,
    key: `${topicId}:${seed}:${difficulty}`,
    expected: expectedScore(learnerRating, itemRating),
    isReview,
    learnerRating,
    itemRating,
  };
}

export type NoRewardReason = 'wrong' | 'too_easy' | 'used_hints' | 'repeat';

export type Graded =
  | { outcome: 'unreadable' }
  | {
      outcome: 'correct' | 'incorrect';
      progress: TopicProgress;
      itemKey: string;
      itemRating: number;
      attempt: MathAttempt;
      earns: boolean;
      reason: NoRewardReason | null;
      /** The right answer, as the checker accepts it (shown after a wrong answer). */
      answer: string;
    };

export type GradeContext = Readonly<{
  usedHints: boolean;
  seenBefore: boolean;
  today: string;
  at: number;
  id: string;
  current: TopicProgress;
}>;

function rewardReason(correct: boolean, served: Served, ctx: GradeContext): NoRewardReason | null {
  if (!correct) return 'wrong';
  if (!earnsTime(served.expected)) return 'too_easy';
  if (ctx.usedHints) return 'used_hints';
  if (ctx.seenBefore) return 'repeat';
  return null;
}

/** "Unreadable" never costs anything: ratings, streaks and rewards are untouched. */
export function gradeAttempt(served: Served, given: string, ctx: GradeContext): Graded {
  const outcome = checkAnswer(served.problem.answer, given);
  if (outcome === 'unreadable') return { outcome };
  const correct = outcome === 'correct';
  const ratings = updateRatings(served.learnerRating, served.itemRating, correct);
  const current =
    ctx.current.topicId === served.topicId ? ctx.current : newProgress(served.topicId);
  const progress = recordAttempt(
    current,
    { correct, usedHints: ctx.usedHints, isReview: served.isReview },
    ratings.learner,
    ctx.today,
  );
  const reason = rewardReason(correct, served, ctx);
  const choice = served.problem.answer.type === 'choice';
  return {
    outcome,
    progress,
    itemKey: itemKey(served.topicId, served.difficulty),
    itemRating: ratings.item,
    attempt: {
      id: ctx.id,
      day: ctx.today,
      at: ctx.at,
      topicId: served.topicId,
      difficulty: served.difficulty,
      correct,
      answerType: choice ? 'choice' : 'typed',
    },
    earns: reason === null,
    reason,
    answer:
      served.problem.answer.type === 'choice'
        ? (served.problem.answer.options[served.problem.answer.correctIndex] ?? '')
        : answerText(served.problem.answer),
  };
}
