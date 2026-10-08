import { decimalText } from '../format';
import { add, mul, rational, toNumber, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

type Op = '+' | '-' | '×' | '÷';

const HINTS: Record<Op, string> = {
  '+': 'Line up the decimal points, then add as with whole numbers.',
  '-': 'Line up the decimal points, then subtract as with whole numbers.',
  '×': 'Multiply as whole numbers, then count the decimal places in both factors.',
  '÷': 'Divide as whole numbers, then put the decimal point back in the same place.',
};

/** A number that really has a decimal part: whole.fraction with a non-zero fraction. */
const decimal = (rng: Rng, maxWhole: number, scale: number): Rational =>
  rational(rng.int(0, maxWhole) * scale + rng.int(1, scale - 1), scale);

const oneDecimal = (rng: Rng): Rational => rational(10 * rng.int(1, 9) + rng.int(1, 9), 10);

const decimalPlaces = (r: Rational): number => (decimalText(r).split('.')[1] ?? '').length;

/** The digits without the decimal point: 4.3 → 43. */
const digitsOnly = (r: Rational): number => toNumber(mul(r, rational(10 ** decimalPlaces(r))));

function multiplySteps(x: Rational, y: Rational, value: Rational): string[] {
  const [xp, yp] = [decimalPlaces(x), decimalPlaces(y)];
  return [
    `Multiply without the decimal points: ${digitsOnly(x)} × ${digitsOnly(y)} = ${digitsOnly(x) * digitsOnly(y)}`,
    `Count the decimal places: ${xp} + ${yp} = ${xp + yp}, so the answer is ${decimalText(value)}`,
  ];
}

function divideSteps(dividend: Rational, divisor: Rational, quotient: Rational): string[] {
  const tenths = toNumber(mul(dividend, rational(10)));
  return [
    `Divide as whole numbers: ${tenths} ÷ ${toNumber(divisor)} = ${toNumber(mul(quotient, rational(10)))}`,
    `Put the decimal point back one place from the right: ${decimalText(quotient)}`,
  ];
}

export const decimalsGenerator: Generator = {
  topicId: 'decimals',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const op =
      difficulty <= 2 ? rng.pick(['+', '-'] as const) : rng.pick(['+', '-', '×', '÷'] as const);
    const base = { topicId: 'decimals', seed, difficulty, hints: [HINTS[op]] } as const;

    if (op === '+' || op === '-') {
      const scale = difficulty <= 2 ? 10 : 100;
      const [x, y] = [decimal(rng, 10 * difficulty, scale), decimal(rng, 10 * difficulty, scale)];
      const [big, small] = toNumber(x) >= toNumber(y) ? [x, y] : [y, x];
      const [left, right] = op === '+' ? [x, y] : [big, small];
      const value = op === '+' ? add(x, y) : add(big, rational(-small.num, small.den));
      const [ls, rs, vs] = [decimalText(left), decimalText(right), decimalText(value)];
      return {
        ...base,
        prompt: `Calculate: ${ls} ${op} ${rs}`,
        answer: { type: 'number', value },
        steps: [`Line up the decimal points: ${ls} ${op} ${rs} = ${vs}`],
      };
    }
    if (op === '×') {
      const x = oneDecimal(rng);
      const y = difficulty >= 4 ? oneDecimal(rng) : rational(rng.int(2, 9));
      const value = mul(x, y);
      return {
        ...base,
        prompt: `Calculate: ${decimalText(x)} × ${decimalText(y)}`,
        answer: { type: 'number', value },
        steps: multiplySteps(x, y, value),
      };
    }
    const d = rng.int(2, 9);
    const drawn = 10 * rng.int(1, 9) + rng.int(1, 9);
    // Keep the dividend a real decimal: if d × drawn ends in 0, the next tenth never does.
    const tenths = (d * drawn) % 10 === 0 ? drawn + 1 : drawn;
    const [divisor, quotient] = [rational(d), rational(tenths, 10)];
    const dividend = mul(quotient, divisor);
    return {
      ...base,
      prompt: `Calculate: ${decimalText(dividend)} ÷ ${decimalText(divisor)}`,
      answer: { type: 'number', value: quotient },
      steps: divideSteps(dividend, divisor, quotient),
    };
  },
};
