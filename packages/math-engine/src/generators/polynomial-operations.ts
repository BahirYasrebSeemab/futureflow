import { formatPolynomial } from '../format';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

type Poly = readonly number[];

/** Product of two polynomials given as coefficient lists (highest power first). */
const multiply = (p: Poly, q: Poly): number[] =>
  p
    .flatMap((a, i) => q.map((b, j) => ({ power: i + j, value: a * b })))
    .reduce<number[]>(
      (sum, t) => {
        const out = [...sum];
        out[t.power] = (out[t.power] ?? 0) + t.value;
        return out;
      },
      Array.from({ length: p.length + q.length - 1 }, () => 0),
    );

/** Every partial product, uncombined: (x + 2)(x + 3) → "x^2 + 3x + 2x + 6". */
function partialProducts(p: Poly, q: Poly): string {
  const degree = p.length + q.length - 2;
  const terms = p.flatMap((a, i) =>
    q.map((b, j) => {
      const coefficients = Array.from({ length: degree + 1 }, (_, k) => (k === i + j ? a * b : 0));
      return formatPolynomial(coefficients);
    }),
  );
  return terms
    .filter((t) => t !== '0')
    .map((t, i) => (i === 0 ? t : t.startsWith('-') ? `- ${t.slice(1)}` : `+ ${t}`))
    .join(' ');
}

const nonZero = (rng: Rng, limit: number): number =>
  rng.int(1, limit) * (rng.next() < 0.5 ? -1 : 1);
const factor = (p: Poly): string => `(${formatPolynomial(p)})`;

export const polynomialOperationsGenerator: Generator = {
  topicId: 'polynomial-operations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    let left: Poly;
    let right: Poly;
    let shown: string;

    if (difficulty <= 2) {
      const [a, b] =
        difficulty === 1 ? [rng.int(1, 9), rng.int(1, 9)] : [nonZero(rng, 9), nonZero(rng, 9)];
      [left, right] = [
        [1, a],
        [1, b],
      ];
      shown = `${factor(left)}${factor(right)}`;
    } else if (difficulty === 3) {
      [left, right] = [
        [rng.int(2, 4), nonZero(rng, 7)],
        [rng.int(2, 4), nonZero(rng, 7)],
      ];
      shown = `${factor(left)}${factor(right)}`;
    } else if (difficulty === 4) {
      left = [rng.int(1, 3), nonZero(rng, 9)];
      right = left;
      shown = `${factor(left)}^2`;
    } else if (rng.next() < 0.5) {
      const [p, a] = [rng.int(1, 4), rng.int(2, 9)];
      [left, right] = [
        [p, a],
        [p, -a],
      ];
      shown = `${factor(left)}${factor(right)}`;
    } else {
      const k = nonZero(rng, 4) * (rng.next() < 0.5 ? 1 : 2);
      [left, right] = [
        [k, 0],
        [1, nonZero(rng, 6), nonZero(rng, 9)],
      ];
      shown = `${formatPolynomial(left)}${factor(right)}`;
    }

    const product = multiply(left, right);
    const answer = formatPolynomial(product);
    const expanded = partialProducts(left, right);
    return {
      topicId: 'polynomial-operations',
      seed,
      difficulty,
      prompt: `Expand and simplify: ${shown}`,
      answer: { type: 'expression', text: answer, maxTerms: product.filter((c) => c !== 0).length },
      hints: [
        'Multiply every term in the first bracket by every term in the second, then collect like terms.',
      ],
      steps:
        expanded === answer
          ? [`Multiply each term: ${answer}`]
          : [`Multiply each term: ${expanded}`, `Collect like terms: ${answer}`],
    };
  },
};
