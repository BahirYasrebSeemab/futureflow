import { rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

const ADD_MAX = [20, 100, 1000, 1000, 10000];
const FIRST_MAX = [10, 12, 99, 99, 999];
const SECOND_MAX = [10, 12, 9, 99, 99];

type Op = '+' | '-' | '×' | '÷';

const HINTS: Record<Op, string> = {
  '+': 'Add the ones, then the tens, then the hundreds, carrying when a column reaches 10.',
  '-': 'Subtract column by column from the right, borrowing from the next column when needed.',
  '×': 'Multiply by each digit of the second number, then add the partial products.',
  '÷': 'Ask: which number times the divisor gives the dividend?',
};

/** [left, right, answer] for the operation, all whole numbers ≥ 0. */
function operands(rng: Rng, op: Op, level: number): [number, number, number] {
  const addMax = ADD_MAX[level] as number;
  const firstMax = FIRST_MAX[level] as number;
  const secondMax = SECOND_MAX[level] as number;
  if (op === '+') {
    const [a, b] = [rng.int(0, addMax), rng.int(0, addMax)];
    return [a, b, a + b];
  }
  if (op === '-') {
    const [x, y] = [rng.int(0, addMax), rng.int(0, addMax)];
    return [Math.max(x, y), Math.min(x, y), Math.abs(x - y)];
  }
  if (op === '×') {
    const [a, b] = [rng.int(2, firstMax), rng.int(2, secondMax)];
    return [a, b, a * b];
  }
  const [divisor, quotient] = [rng.int(2, secondMax), rng.int(2, firstMax)];
  return [divisor * quotient, divisor, quotient];
}

/** Partial products: 37 × 46 → 37 × 40, 37 × 6, then add. Assumes a, b ≥ 10 and b ≤ 99. */
function multiplySteps(a: number, b: number): string[] {
  const ones = b % 10;
  const tens = b - ones;
  const onesStep =
    ones === 0
      ? 'No ones to multiply'
      : ones === 1
        ? `One more ${a}: ${a}`
        : `${a} × ${ones} = ${a * ones}`;
  return [
    `Split ${b} into ${tens} and ${ones}`,
    `${a} × ${tens} = ${a * tens}`,
    onesStep,
    `Add the partial products: ${a * tens} + ${a * ones} = ${a * b}`,
  ];
}

/** Chunking: take away the biggest easy multiples of the divisor, place value by place value. */
function divideSteps(dividend: number, divisor: number, quotient: number): string[] {
  const chunks = String(quotient)
    .split('')
    .map((digit, i, all) => Number(digit) * 10 ** (all.length - 1 - i))
    .filter((chunk) => chunk > 0);
  let remaining = dividend;
  const chunkSteps = chunks.map((chunk) => {
    const taken = divisor * chunk;
    const before = remaining;
    remaining -= taken;
    return chunk === 1
      ? `One more ${divisor}: ${before} - ${divisor} = ${remaining}`
      : `${divisor} × ${chunk} = ${taken}; ${before} - ${taken} = ${remaining}`;
  });
  const total =
    chunks.length > 1
      ? `Add the chunks: ${chunks.join(' + ')} = ${quotient}`
      : `So ${dividend} ÷ ${divisor} = ${quotient}`;
  return [`Take away groups of ${divisor}`, ...chunkSteps, total];
}

function stepsFor(op: Op, a: number, b: number, value: number): string[] {
  if (op === '×' && a >= 10 && b >= 10) return multiplySteps(a, b);
  if (op === '÷' && value >= 10) return divideSteps(a, b, value);
  if (op === '÷') return [`${a} ÷ ${b} = ${value}, because ${b} × ${value} = ${a}`];
  return [`${a} ${op} ${b} = ${value}`];
}

export const wholeNumberOperationsGenerator: Generator = {
  topicId: 'whole-number-operations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const op = rng.pick(['+', '-', '×', '÷'] as const);
    const [a, b, value] = operands(rng, op, difficulty - 1);
    return {
      topicId: 'whole-number-operations',
      seed,
      difficulty,
      prompt: `Calculate: ${a} ${op} ${b}`,
      answer: { type: 'number', value: rational(value) },
      hints: [HINTS[op]],
      steps: stepsFor(op, a, b, value),
    };
  },
};
