import { formatLinear, signed } from '../format';
import { createRng } from '../rng';
import type { Generator } from '../types';

const xTerm = (c: number): string =>
  c === 0 ? '' : ` ${c < 0 ? '-' : '+'} ${Math.abs(c) === 1 ? '' : Math.abs(c)}x`;
const constant = (n: number): string => (n === 0 ? '' : ` ${signed(n)}`);

export const algebraicExpressionsGenerator: Generator = {
  topicId: 'algebraic-expressions',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const a = rng.int(2, 1 + difficulty);
    const b = rng.pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
    const c = rng.int(-4, 4);
    const d = rng.int(-9, 9);
    const p = a + c;
    const q = a * b + d;
    const answer = formatLinear(p, q);
    return {
      topicId: 'algebraic-expressions',
      seed,
      difficulty,
      prompt: `Simplify: ${a}(x ${signed(b)})${xTerm(c)}${constant(d)}`,
      answer: { type: 'expression', text: answer, maxTerms: 2 },
      hints: ['Distribute first, then collect the x terms and the number terms separately.'],
      steps: [
        `Distribute: ${a}x ${signed(a * b)}${xTerm(c)}${constant(d)}`,
        `Collect like terms: ${answer}`,
      ],
    };
  },
};
