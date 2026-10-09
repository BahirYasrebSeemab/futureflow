import { describe, expect, it } from 'vitest';
import { formatLinear, signed } from '../src/format';

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
