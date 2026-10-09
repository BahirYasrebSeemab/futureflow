import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

const HINT =
  'Order: brackets, exponents, multiplication and division (left to right), then addition and subtraction.';

export const orderOfOperationsGenerator: Generator = {
  topicId: 'order-of-operations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const max = 4 + 3 * difficulty;
    const base = { topicId: 'order-of-operations', seed, difficulty, hints: [HINT] } as const;
    const make = (prompt: string, value: number, steps: string[]): Problem => ({
      ...base,
      prompt: `Calculate: ${prompt}`,
      answer: { type: 'number', value: rational(value) },
      steps,
    });

    if (difficulty === 1) {
      const [a, b, c] = [rng.int(1, max), rng.int(2, max), rng.int(2, max)];
      return make(`${a} + ${b} × ${c}`, a + b * c, [
        `Multiply first: ${b} × ${c} = ${b * c}`,
        `Then add: ${a} + ${b * c} = ${a + b * c}`,
      ]);
    }
    if (difficulty === 2) {
      const [a, b, c, d] = [rng.int(1, max), rng.int(1, max), rng.int(2, max), rng.int(1, max)];
      const value = (a + b) * c - d;
      return make(`(${a} + ${b}) × ${c} - ${d}`, value, [
        `Brackets first: ${a} + ${b} = ${a + b}`,
        `Multiply: ${a + b} × ${c} = ${(a + b) * c}`,
        `Subtract: ${(a + b) * c} - ${d} = ${value}`,
      ]);
    }
    const c = rng.pick([2, 3, 4]);
    const b = c * rng.int(1, difficulty + 1);
    const a = rng.int(1, 2 * max);
    const quotient = (b * b) / c;
    return make(`${a} - ${b}² ÷ ${c}`, a - quotient, [
      `Exponent first: ${b}² = ${b * b}`,
      `Divide: ${b * b} ÷ ${c} = ${quotient}`,
      `Subtract: ${a} - ${quotient} = ${a - quotient}`,
    ]);
  },
};
