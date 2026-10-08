import { describe, expect, it } from 'vitest';
import { add, equals, gcd, lcm, parseRational, rational, toNumber, toText } from '../src/rational';

describe('rational', () => {
  it('reduces and normalizes the sign onto the numerator', () => {
    expect(rational(2, 4)).toEqual({ num: 1, den: 2 });
    expect(rational(3, -6)).toEqual({ num: -1, den: 2 });
  });

  it('never produces negative zero', () => {
    expect(Object.is(rational(0, -5).num, 0)).toBe(true);
    expect(rational(0, 7)).toEqual({ num: 0, den: 1 });
  });

  it.each([
    [1, 0],
    [1.5, 2],
    [Number.NaN, 1],
  ])('rejects %s/%s', (num, den) => {
    expect(() => rational(num, den)).toThrow(RangeError);
  });

  it('adds, compares and converts', () => {
    expect(add(rational(1, 2), rational(1, 3))).toEqual({ num: 5, den: 6 });
    expect(equals(rational(6, 8), rational(3, 4))).toBe(true);
    expect(equals(rational(1, 3), rational(1, 4))).toBe(false);
    expect(toNumber(rational(3, 4))).toBe(0.75);
    expect(toText(rational(-3, 4))).toBe('-3/4');
    expect(toText(rational(6, 2))).toBe('3');
  });

  it('computes gcd and lcm', () => {
    expect(gcd(12, 18)).toBe(6);
    expect(gcd(-4, 6)).toBe(2);
    expect(lcm(4, 6)).toBe(12);
  });
});

describe('parseRational', () => {
  it.each([
    ['3', { num: 3, den: 1 }],
    ['-3/4', { num: -3, den: 4 }],
    [' 6 / 8 ', { num: 3, den: 4 }],
    ['0.75', { num: 3, den: 4 }],
    ['-.5', { num: -1, den: 2 }],
    ['−2', { num: -2, den: 1 }],
  ])('parses %j', (text, expected) => {
    expect(parseRational(text)).toEqual(expected);
  });

  it.each(['1/0', 'abc', '1.2.3', '', '99999999999999999999'])('returns null for %j', (text) => {
    expect(parseRational(text)).toBeNull();
  });
});
