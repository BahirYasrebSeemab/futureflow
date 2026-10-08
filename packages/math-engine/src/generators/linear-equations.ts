import { formatLinear } from '../format';
import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator } from '../types';

export const linearEquationsGenerator: Generator = {
  topicId: 'linear-equations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const nonZero = (limit: number): number => rng.int(1, limit) * (rng.next() < 0.5 ? -1 : 1);
    const x = rng.int(-10, 10);
    const b = rng.int(-15, 15);
    const base = {
      topicId: 'linear-equations',
      seed,
      difficulty,
      answer: { type: 'number', value: rational(x) },
      hints: ['Do the same thing to both sides until x is alone.'],
    } as const;

    if (difficulty < 4) {
      const a = difficulty === 1 ? rng.int(2, 5) : nonZero(4 + difficulty);
      const c = a * x + b;
      return {
        ...base,
        prompt: `Solve for x: ${formatLinear(a, b)} = ${c}`,
        steps: [
          `Subtract ${b} from both sides: ${a}x = ${c - b}`,
          `Divide both sides by ${a}: x = ${x}`,
        ],
      };
    }

    const a = nonZero(6);
    const drawn = nonZero(6);
    const e = drawn === a ? -a : drawn;
    const f = (a - e) * x + b;
    return {
      ...base,
      prompt: `Solve for x: ${formatLinear(a, b)} = ${formatLinear(e, f)}`,
      steps: [
        `Move the x terms to the left: ${formatLinear(a - e, b)} = ${f}`,
        `Subtract ${b} from both sides: ${a - e}x = ${f - b}`,
        `Divide both sides by ${a - e}: x = ${x}`,
      ],
    };
  },
};
