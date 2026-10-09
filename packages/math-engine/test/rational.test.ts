import { describe, expect, it } from 'vitest';
import {
  add,
  equals,
  gcd,
  lcm,
  mul,
  parseRational,
  rational,
  roundFloat,
  roundSafely,
  roundToCents,
  toNumber,
  toText,
} from '../src/rational';

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

describe('mul', () => {
  it('multiplies and reduces', () => {
    expect(mul(rational(2, 3), rational(9, 4))).toEqual({ num: 3, den: 2 });
  });
});

describe('roundToCents (exact half-up)', () => {
  it.each([
    [4862025, 1000, 486203],
    [19775, 1000, 1978],
    [37855, 1000, 3786],
    [68365, 1000, 6837],
    [64975, 1000, 6498],
    [564887, 10000, 5649],
    [5, 1, 500],
  ])('%i/%i rounds to %i cents', (num, den, cents) => {
    expect(roundToCents(rational(num, den))).toEqual(rational(cents, 100));
  });
});

describe('roundFloat', () => {
  it('rounds an irrational value to the given places', () => {
    expect(roundFloat(Math.SQRT2, 2)).toEqual(rational(141, 100));
    expect(roundFloat(-Math.PI, 1)).toEqual(rational(-31, 10));
  });
});

describe('roundSafely', () => {
  it('rounds when the value is clearly on one side of a half', () => {
    expect(roundSafely(6.8829, 1)).toEqual(rational(69, 10));
    expect(roundSafely(36.03, 0)).toEqual(rational(36));
  });

  it('refuses values within 0.001 of a rounding boundary', () => {
    expect(roundSafely(6.85005, 1)).toBeNull();
    expect(roundSafely(36.4996, 0)).toBeNull();
  });
});
