import { describe, expect, it } from 'vitest';
import { isReviewDue, newProgress, recordAttempt, type TopicProgress } from '../src/mastery';

const practice = { correct: true, usedHints: false, isReview: false };
const TODAY = '2026-10-08';

const answerTimes = (p: TopicProgress, n: number, outcome = practice): TopicProgress =>
  Array.from({ length: n }).reduce<TopicProgress>(
    (acc) => recordAttempt(acc, outcome, 1000, TODAY),
    p,
  );

describe('recordAttempt: practice', () => {
  it('masters a topic after 5 correct answers in a row and schedules the first review', () => {
    const p = answerTimes(newProgress('fractions'), 5);
    expect(p).toMatchObject({
      mastered: true,
      streak: 5,
      reviewStage: 0,
      nextReviewDay: '2026-10-09',
    });
  });

  it('resets the streak on a wrong answer or a hinted answer', () => {
    const four = answerTimes(newProgress('fractions'), 4);
    expect(recordAttempt(four, { ...practice, correct: false }, 990, TODAY).streak).toBe(0);
    expect(recordAttempt(four, { ...practice, usedHints: true }, 990, TODAY).streak).toBe(0);
  });

  it('stores the new rating', () => {
    expect(recordAttempt(newProgress('fractions'), practice, 1016, TODAY).rating).toBe(1016);
  });
});

describe('recordAttempt: reviews', () => {
  const mastered = answerTimes(newProgress('fractions'), 5);
  const review = { correct: true, usedHints: false, isReview: true };

  it('pushes the next review further out after each successful review', () => {
    const once = recordAttempt(mastered, review, 1000, '2026-10-09');
    expect(once).toMatchObject({ reviewStage: 1, nextReviewDay: '2026-10-12' });
  });

  it('graduates after the last interval (no more reviews)', () => {
    const late = { ...mastered, reviewStage: 4, nextReviewDay: '2026-12-01' };
    const done = recordAttempt(late, review, 1000, '2026-12-01');
    expect(done.mastered).toBe(true);
    expect(done.nextReviewDay).toBeUndefined();
    expect(done.reviewStage).toBe(5);
  });

  it('reopens practice when a review is failed', () => {
    const failed = recordAttempt(mastered, { ...review, correct: false }, 950, '2026-10-09');
    expect(failed).toEqual({
      topicId: 'fractions',
      rating: 950,
      streak: 0,
      mastered: false,
      reviewStage: 0,
    });
  });

  it('ignores extra practice on a mastered topic for scheduling', () => {
    const extra = recordAttempt(mastered, { ...practice, correct: false }, 990, TODAY);
    expect(extra).toMatchObject({ mastered: true, nextReviewDay: '2026-10-09', rating: 990 });
  });
});

describe('isReviewDue', () => {
  it('is due on or after the review day, only for mastered topics', () => {
    const mastered = answerTimes(newProgress('fractions'), 5);
    expect(isReviewDue(mastered, '2026-10-08')).toBe(false);
    expect(isReviewDue(mastered, '2026-10-09')).toBe(true);
    expect(isReviewDue(newProgress('fractions'), '2026-10-09')).toBe(false);
  });
});
