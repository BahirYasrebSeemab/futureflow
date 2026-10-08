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

describe('checkAnswer: review fixes', () => {
  const linear: Answer = { type: 'expression', text: '2x+2' };

  it.each(['banana', '3c+2', 'x = 3'])(
    'treats %j as unreadable on an expression problem (foreign symbols or an equation)',
    (given) => {
      expect(checkAnswer(linear, given)).toBe('unreadable');
    },
  );

  it('does not accept a wrong answer that hides behind function names', () => {
    expect(checkAnswer({ type: 'expression', text: 'x' }, 'sin(x)')).toBe('incorrect');
    expect(checkAnswer(linear, 'sin(x)')).toBe('incorrect');
    expect(checkAnswer({ type: 'expression', text: '2x+2' }, 'sqrt(x^2)*2+2')).toBe('incorrect');
  });

  it('accepts true identities the CAS cannot prove, via sampling', () => {
    expect(checkAnswer({ type: 'expression', text: '2^(x+1)' }, '2^x*2')).toBe('correct');
    expect(checkAnswer({ type: 'expression', text: 'x/3' }, '0.333333333x')).toBe('correct');
    expect(checkAnswer({ type: 'expression', text: '2x*2^x' }, '2^(x+1)*x')).toBe('correct');
    expect(checkAnswer({ type: 'expression', text: '2^(x+1)' }, '2^((x+1))')).toBe('correct');
  });

  it('rejects when too few sample points are comparable', () => {
    expect(checkAnswer({ type: 'expression', text: 'ln(x-3)' }, 'ln(x-3)+0.0000001')).toBe(
      'incorrect',
    );
  });

  it.each([
    ['(-3)', -3, 1],
    ['+3', 3, 1],
    ['- 3', -3, 1],
    ['3.', 3, 1],
    ['1 1/6', 7, 6],
    ['-1 1/2', -3, 2],
  ])('reads the number format %j', (given, n, d) => {
    expect(checkAnswer(num(n, d), given)).toBe('correct');
  });
});

describe('checkAnswer: percent sign', () => {
  const percent: Answer = { type: 'number', value: rational(25), unit: 'percent' };

  it('accepts a trailing percent sign when the answer is a percent', () => {
    expect(checkAnswer(percent, '25%')).toBe('correct');
    expect(checkAnswer(percent, '25 %')).toBe('correct');
    expect(checkAnswer(percent, '25')).toBe('correct');
    expect(checkAnswer(percent, '24%')).toBe('incorrect');
  });

  it('marks a percent sign on an amount as incorrect (percent confused with amount)', () => {
    expect(checkAnswer(num(10), '10%')).toBe('incorrect');
  });
});

describe('checkAnswer: inequality', () => {
  const greater: Answer = { type: 'inequality', variable: 'x', op: '>', bound: rational(3) };
  const atLeast: Answer = { type: 'inequality', variable: 'x', op: '≥', bound: rational(3) };

  it.each([
    ['x > 3', 'correct'],
    ['x>3', 'correct'],
    ['3 < x', 'correct'],
    ['x > 6/2', 'correct'],
    ['x >= 3', 'incorrect'],
    ['x < 3', 'incorrect'],
    ['x > 4', 'incorrect'],
    ['y > 3', 'unreadable'],
    ['x >', 'unreadable'],
    ['banana', 'unreadable'],
  ])('x > 3 vs %j is %s', (given, outcome) => {
    expect(checkAnswer(greater, given)).toBe(outcome);
  });

  it.each(['x >= 3', 'x => 3', 'x ≥ 3', '3 <= x', '3 ≤ x'])('x ≥ 3 accepts %j', (given) => {
    expect(checkAnswer(atLeast, given)).toBe('correct');
  });

  it('round-trips through answerText', () => {
    expect(answerText(atLeast)).toBe('x ≥ 3');
    expect(checkAnswer(atLeast, answerText(atLeast))).toBe('correct');
  });
});

describe('checkAnswer: y = prefix on expressions', () => {
  it('accepts "y = …" when y is not part of the expected expression', () => {
    expect(checkAnswer({ type: 'expression', text: '2x+1' }, 'y = 2x + 1')).toBe('correct');
    expect(checkAnswer({ type: 'expression', text: '2x+1' }, 'y = 2x + 3')).toBe('incorrect');
  });
});

describe('checkAnswer: monomial form', () => {
  const answer: Answer = { type: 'expression', text: '6x^7', form: 'monomial' };

  it.each([
    ['6x^7', 'correct'],
    ['6*x^7', 'correct'],
    ['6 x^7', 'correct'],
    ['6x^(7)', 'correct'],
    ['2x^3*3x^4', 'incorrect'],
    ['6x^3*x^4', 'incorrect'],
    ['6x^6', 'incorrect'],
  ])('6x^7 vs %j is %s', (given, outcome) => {
    expect(checkAnswer(answer, given)).toBe(outcome);
  });
});

describe('checkAnswer: multi-digit exponents', () => {
  const answer: Answer = { type: 'expression', text: '8x^12', form: 'monomial' };

  it('reads x^12 as x to the twelfth, not x^1 times 2', () => {
    expect(checkAnswer(answer, '8x^12')).toBe('correct');
    expect(checkAnswer(answer, '16x')).toBe('incorrect');
    expect(checkAnswer({ type: 'expression', text: '4x^10' }, '0')).toBe('incorrect');
  });
});

describe('checkAnswer: π and units', () => {
  it('reads π answers and rejects decimal approximations of them', () => {
    const circle: Answer = { type: 'expression', text: '25π' };
    expect(checkAnswer(circle, '25π')).toBe('correct');
    expect(checkAnswer(circle, '25pi')).toBe('correct');
    expect(checkAnswer(circle, '25*pi')).toBe('correct');
    expect(checkAnswer(circle, '78.5')).toBe('incorrect');
  });

  it.each(['28 cm²', '28cm^2', '28 cm2', '28 m'])('strips the unit in %j', (given) => {
    expect(checkAnswer(num(28), given)).toBe('correct');
  });
});
