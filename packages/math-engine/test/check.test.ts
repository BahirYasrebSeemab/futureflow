import { describe, expect, it } from 'vitest';
import { answerText, checkAnswer, countTerms, type Answer } from '../src/check';
import { rational } from '../src/rational';

const num = (n: number, d = 1): Answer => ({ type: 'number', value: rational(n, d) });

describe('checkAnswer: number', () => {
  it.each([
    ['3/4', 'correct'],
    ['6/8', 'correct'],
    ['0.75', 'correct'],
    ['x = 3/4', 'correct'],
    ['0.7', 'incorrect'],
    ['banana', 'unreadable'],
    ['', 'unreadable'],
  ])('3/4 vs %j is %s', (given, outcome) => {
    expect(checkAnswer(num(3, 4), given)).toBe(outcome);
  });

  it('accepts long decimals within tolerance but not rough ones', () => {
    expect(checkAnswer(num(1, 3), '0.3333333')).toBe('correct');
    expect(checkAnswer(num(1, 3), '0.333')).toBe('incorrect');
  });
});

describe('checkAnswer: expression', () => {
  const twoXPlusTwo: Answer = { type: 'expression', text: '2x+2' };

  it.each([
    ['2(x+1)', 'correct'],
    ['x+x+2', 'correct'],
    ['2x+3', 'incorrect'],
    ['x^2', 'incorrect'],
    ['2x+', 'unreadable'],
    ['   ', 'unreadable'],
  ])('2x+2 vs %j is %s', (given, outcome) => {
    expect(checkAnswer(twoXPlusTwo, given)).toBe(outcome);
  });

  it('accepts a factored form when no form is required', () => {
    expect(checkAnswer({ type: 'expression', text: 'x^2-5x+6' }, '(x-2)(x-3)')).toBe('correct');
  });

  it('enforces simplified form when maxTerms is set', () => {
    const simplified: Answer = { type: 'expression', text: '5x+6', maxTerms: 2 };
    expect(checkAnswer(simplified, '5x + 6')).toBe('correct');
    expect(checkAnswer(simplified, '6 + 5x')).toBe('correct');
    expect(checkAnswer(simplified, '3(x+2)+2x')).toBe('incorrect');
    expect(checkAnswer(simplified, 'x+4x+6')).toBe('incorrect');
  });
});

describe('checkAnswer: set', () => {
  const roots: Answer = { type: 'set', items: [rational(2), rational(3)] };

  it.each([
    ['3, 2', 'correct'],
    ['x = 2, x = 3', 'correct'],
    ['{2, 3}', 'correct'],
    ['2', 'incorrect'],
    ['2, 4', 'incorrect'],
    ['2, banana', 'unreadable'],
  ])('{2, 3} vs %j is %s', (given, outcome) => {
    expect(checkAnswer(roots, given)).toBe(outcome);
  });
});

describe('checkAnswer: point', () => {
  const point: Answer = { type: 'point', coords: [rational(2), rational(-3)] };

  it.each([
    ['(2, -3)', 'correct'],
    ['2,-3', 'correct'],
    ['(-3, 2)', 'incorrect'],
    ['(2)', 'incorrect'],
    ['(a, b)', 'unreadable'],
  ])('(2, -3) vs %j is %s', (given, outcome) => {
    expect(checkAnswer(point, given)).toBe(outcome);
  });
});

describe('checkAnswer: choice', () => {
  const choice: Answer = { type: 'choice', options: ['a', 'b', 'c'], correctIndex: 1 };

  it.each([
    ['1', 'correct'],
    ['0', 'incorrect'],
    ['7', 'unreadable'],
    ['b', 'unreadable'],
  ])('index 1 vs %j is %s', (given, outcome) => {
    expect(checkAnswer(choice, given)).toBe(outcome);
  });
});

describe('answerText', () => {
  it.each<Answer>([
    num(-3, 4),
    { type: 'expression', text: '5x+6', maxTerms: 2 },
    { type: 'set', items: [rational(2), rational(-1, 2)] },
    { type: 'point', coords: [rational(1), rational(5, 3)] },
    { type: 'choice', options: ['a', 'b'], correctIndex: 0 },
  ])('round-trips through checkAnswer (%o)', (answer) => {
    expect(checkAnswer(answer, answerText(answer))).toBe('correct');
  });
});

describe('countTerms', () => {
  it.each([
    ['5x+6', 2],
    ['-x - 4 + 2x', 3],
    ['7', 1],
    ['2x+-3', 2],
  ])('%j has %i terms', (text, count) => {
    expect(countTerms(text)).toBe(count);
  });
});
