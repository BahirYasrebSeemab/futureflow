import { rational, toText } from '../rational';
import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

export const ratiosAndRatesGenerator: Generator = {
  topicId: 'ratios-and-rates',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const base = { topicId: 'ratios-and-rates', seed, difficulty } as const;

    if (difficulty === 3 && rng.next() < 0.5) {
      const [hours, speed] = [rng.int(2, 6), rng.int(4, 24) * 5];
      const distance = hours * speed;
      return {
        ...base,
        prompt: `A car travels ${distance} km in ${hours} hours. How many km does it travel per hour?`,
        answer: { type: 'number', value: rational(speed) },
        hints: ['A rate per hour means: divide by the number of hours.'],
        steps: [`${distance} ÷ ${hours} = ${speed} km per hour`],
      };
    }

    const b = rng.int(2, 4 + difficulty);
    if (difficulty <= 3) {
      const [a, k] = [rng.int(1, 3 * b), rng.int(2, 2 + difficulty)];
      const c = b * k;
      const problem: Problem = {
        ...base,
        prompt: `Solve for x: ${a}/${b} = x/${c}`,
        answer: { type: 'number', value: rational(a * k) },
        hints: ['Find what the bottom number was multiplied by, then do the same to the top.'],
        steps: [`${c} ÷ ${b} = ${k}`, `x = ${a} × ${k} = ${a * k}`],
      };
      return problem;
    }

    // Built backwards from a whole-number x, so dividing on paper never ends in a repeating decimal.
    const [a, t] = [rng.int(2, 3 * b), rng.int(2, 2 + difficulty)];
    const [c, x] = [a * t, b * t];
    const value = rational(x);
    return {
      ...base,
      prompt: `Solve for x: ${a}/${b} = ${c}/x`,
      answer: { type: 'number', value },
      hints: ['Cross-multiply, then divide.'],
      steps: [`Cross-multiply: ${a} × x = ${b} × ${c}`, `x = ${b * c} ÷ ${a} = ${toText(value)}`],
    };
  },
};
