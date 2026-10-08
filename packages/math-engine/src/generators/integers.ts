import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator } from '../types';

const show = (n: number): string => (n < 0 ? `(${n})` : String(n));

const HINTS = {
  '+': 'Adding a negative number is the same as subtracting it.',
  '-': 'Subtracting a number is the same as adding its opposite.',
  '×': 'Same signs give a positive product; different signs give a negative product.',
} as const;

export const integersGenerator: Generator = {
  topicId: 'integers',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const limit = 5 * difficulty + 5;
    const a = rng.int(-limit, limit);
    const op = rng.pick(['+', '-', '×'] as const);
    const drawn = rng.int(-limit, limit);
    const b = op === '×' && drawn === 1 ? 2 : drawn;
    const value = op === '+' ? a + b : op === '-' ? a - b : a * b;
    const steps =
      op === '-'
        ? [`${show(a)} - ${show(b)} = ${show(a)} + ${show(-b)}`, `= ${value + 0}`]
        : [`${show(a)} ${op} ${show(b)} = ${value + 0}`];
    return {
      topicId: 'integers',
      seed,
      difficulty,
      prompt: `Calculate: ${show(a)} ${op} ${show(b)}`,
      answer: { type: 'number', value: rational(value) },
      hints: [HINTS[op]],
      steps,
    };
  },
};
