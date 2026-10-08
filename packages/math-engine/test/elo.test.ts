import { describe, expect, it } from 'vitest';
import { expectedScore, initialItemRating, updateRatings } from '../src/elo';

describe('expectedScore', () => {
  it('is 0.5 for equal ratings and about 0.91 for a 400-point lead', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(expectedScore(1400, 1000)).toBeCloseTo(0.909, 3);
  });
});

describe('updateRatings', () => {
  it('moves learner and item by the same amount in opposite directions', () => {
    expect(updateRatings(1000, 1000, true)).toEqual({ learner: 1016, item: 984 });
    expect(updateRatings(1000, 1000, false)).toEqual({ learner: 984, item: 1016 });
  });

  it('rewards beating a hard item more than an easy one', () => {
    const hard = updateRatings(1000, 1400, true).learner - 1000;
    const easy = updateRatings(1000, 600, true).learner - 1000;
    expect(hard).toBeGreaterThan(easy);
  });
});

describe('initialItemRating', () => {
  it('spreads difficulties from 800 to 1600', () => {
    expect(initialItemRating(1)).toBe(800);
    expect(initialItemRating(5)).toBe(1600);
  });
});
