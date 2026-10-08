import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';

const draw = (seed: number, n: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('createRng', () => {
  it('repeats the same sequence for the same seed', () => {
    expect(draw(42, 5)).toEqual(draw(42, 5));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(1, 5)).not.toEqual(draw(2, 5));
  });

  it('returns numbers in [0, 1)', () => {
    expect(draw(7, 1000).every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('int stays within inclusive bounds and reaches both ends', () => {
    const rng = createRng(3);
    const values = Array.from({ length: 2000 }, () => rng.int(-2, 2));
    expect(Math.min(...values)).toBe(-2);
    expect(Math.max(...values)).toBe(2);
  });

  it('pick returns an element and rejects an empty list', () => {
    const rng = createRng(9);
    expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});
