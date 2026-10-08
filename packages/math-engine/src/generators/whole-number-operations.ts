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

export const wholeNumberOperationsGenerator: Generator = {
  topicId: 'whole-number-operations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const op = rng.pick(['+', '-', '×', '÷'] as const);
    const [a, b, value] = operands(rng, op, difficulty - 1);
    const step =
      op === '÷'
        ? `${a} ÷ ${b} = ${value}, because ${b} × ${value} = ${a}`
        : `${a} ${op} ${b} = ${value}`;
    return {
      topicId: 'whole-number-operations',
      seed,
      difficulty,
      prompt: `Calculate: ${a} ${op} ${b}`,
      answer: { type: 'number', value: rational(value) },
      hints: [HINTS[op]],
      steps: [step],
    };
  },
};
