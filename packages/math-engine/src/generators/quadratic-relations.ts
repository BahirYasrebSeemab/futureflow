import { formatPolynomial, show, signed } from '../format';
import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

const H_VALUES = [-6, -5, -4, -3, -2, 1, 2, 3, 4, 5, 6];

const coefficientText = (a: number): string => (a === 1 ? '' : a === -1 ? '-' : String(a));

/** a(x - h)^2 + k, written the way a textbook does. */
const vertexForm = (a: number, h: number, k: number): string =>
  `${coefficientText(a)}(${formatPolynomial([1, -h])})^2${k === 0 ? '' : ` ${signed(k)}`}`;

export const quadraticRelationsGenerator: Generator = {
  topicId: 'quadratic-relations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const a = rng.pick([-3, -2, -1, 1, 2, 3]);
    const h = rng.pick(H_VALUES);
    const k = rng.int(-9, 9);
    const f = vertexForm(a, h, k);
    const base = { topicId: 'quadratic-relations', seed, difficulty } as const;
    const vertexHint = 'In y = a(x - h)^2 + k, the vertex is (h, k).';

    if (difficulty === 1) {
      return {
        ...base,
        prompt: `For y = ${f}, what is the vertex?`,
        answer: { type: 'point', coords: [rational(h), rational(k)] },
        hints: [vertexHint],
        steps: [
          `In y = a(x - h)^2 + k the vertex is (h, k)`,
          `Here h = ${h} and k = ${k}, so the vertex is (${h}, ${k})`,
        ],
      };
    }
    if (difficulty === 2) {
      return {
        ...base,
        prompt: `For y = ${f}, what is the axis of symmetry?`,
        answer: { type: 'number', value: rational(h) },
        hints: ['The axis of symmetry is the vertical line through the vertex: x = h.'],
        steps: [`The vertex is (${h}, ${k})`, `The axis of symmetry is x = ${h}`],
      };
    }
    if (difficulty === 3) {
      const isMinimum = a > 0;
      return {
        ...base,
        prompt: `For y = ${f}, what is the ${isMinimum ? 'minimum' : 'maximum'} value of y?`,
        answer: { type: 'number', value: rational(k) },
        hints: [
          'If a > 0 the parabola opens up (a minimum at the vertex); if a < 0 it opens down (a maximum).',
        ],
        steps: [
          `a = ${a} is ${isMinimum ? 'positive, so the parabola opens up' : 'negative, so the parabola opens down'}`,
          `The ${isMinimum ? 'minimum' : 'maximum'} is the y-value of the vertex: ${k}`,
        ],
      };
    }
    if (difficulty === 4) {
      const intercept = a * h * h + k;
      return {
        ...base,
        prompt: `For y = ${f}, what is the y-intercept?`,
        answer: { type: 'number', value: rational(intercept) },
        hints: ['The y-intercept is where x = 0.'],
        steps: [`Substitute x = 0: ${a} × ${show(-h)}² + ${show(k)} = ${intercept}`],
      };
    }
    const r = rng.pick(H_VALUES);
    const drawn = rng.pick(H_VALUES);
    const s = drawn === r ? -r : drawn;
    const factored = `${coefficientText(a)}(${formatPolynomial([1, -r])})(${formatPolynomial([1, -s])})`;
    const problem: Problem = {
      ...base,
      prompt: `For y = ${factored}, what are the zeros?`,
      answer: { type: 'set', items: [rational(r), rational(s)] },
      hints: ['The zeros are where y = 0: set each factor to zero.'],
      steps: [
        `Set y = 0: ${formatPolynomial([1, -r])} = 0 or ${formatPolynomial([1, -s])} = 0`,
        `x = ${r} or x = ${s}`,
      ],
    };
    return problem;
  },
};
