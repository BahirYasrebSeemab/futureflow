import { describe, expect, it } from 'vitest';
import { decimalText, formatLinear, signed } from '../src/format';
import { rational } from '../src/rational';

describe('signed', () => {
  it('writes the sign with a space', () => {
    expect(signed(3)).toBe('+ 3');
    expect(signed(-3)).toBe('- 3');
    expect(signed(0)).toBe('+ 0');
  });
});

describe('formatLinear', () => {
  it.each([
    [3, -2, '3x - 2'],
    [1, 4, 'x + 4'],
    [-1, 0, '-x'],
    [0, 5, '5'],
    [0, 0, '0'],
    [-2, 7, '-2x + 7'],
  ])('formatLinear(%s, %s) = %s', (p, q, text) => {
    expect(formatLinear(p, q)).toBe(text);
  });
});

describe('decimalText', () => {
  it.each([
    [17, 4, '4.25'],
    [-3, 10, '-0.3'],
    [5, 1, '5'],
    [1, 8, '0.125'],
    [0, 1, '0'],
  ])('%i/%i = %s', (num, den, text) => {
    expect(decimalText(rational(num, den))).toBe(text);
  });

  it('rejects a non-terminating decimal', () => {
    expect(() => decimalText(rational(1, 3))).toThrow(RangeError);
  });
});
