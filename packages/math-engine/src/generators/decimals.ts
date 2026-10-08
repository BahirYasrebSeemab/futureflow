import { decimalText } from '../format';
import { add, mul, rational, toNumber, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

type Op = '+' | '-' | '×' | '÷';

const HINTS: Record<Op, string> = {
  '+': 'Line up the decimal points, then add as with whole numbers.',
  '-': 'Line up the decimal points, then subtract as with whole numbers.',
  '×': 'Multiply as whole numbers, then count the decimal places in both factors.',
  '÷': 'Divide as with whole numbers and keep the decimal point above where it is in the dividend.',
};

/** [left, right, answer] as exact rationals. */
function operands(rng: Rng, op: Op, difficulty: number): [Rational, Rational, Rational] {
  const scale = difficulty <= 2 ? 10 : 100;
  if (op === '+' || op === '-') {
    const x = rational(rng.int(1, 100 * difficulty), scale);
    const y = rational(rng.int(1, 100 * difficulty), scale);
    if (op === '+') return [x, y, add(x, y)];
    const [big, small] = toNumber(x) >= toNumber(y) ? [x, y] : [y, x];
    return [big, small, add(big, rational(-small.num, small.den))];
  }
  if (op === '×') {
    const x = rational(rng.int(11, 99), 10);
    const y = difficulty >= 4 ? rational(rng.int(11, 99), 10) : rational(rng.int(2, 9));
    return [x, y, mul(x, y)];
  }
  const divisor = rational(rng.int(2, 9));
  const quotient = rational(rng.int(11, 99), 10);
  return [mul(quotient, divisor), divisor, quotient];
}

export const decimalsGenerator: Generator = {
  topicId: 'decimals',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const op =
      difficulty <= 2 ? rng.pick(['+', '-'] as const) : rng.pick(['+', '-', '×', '÷'] as const);
    const [x, y, value] = operands(rng, op, difficulty);
    const [xs, ys, vs] = [decimalText(x), decimalText(y), decimalText(value)];
    return {
      topicId: 'decimals',
      seed,
      difficulty,
      prompt: `Calculate: ${xs} ${op} ${ys}`,
      answer: { type: 'number', value },
      hints: [HINTS[op]],
      steps: [`${xs} ${op} ${ys} = ${vs}`],
    };
  },
};
