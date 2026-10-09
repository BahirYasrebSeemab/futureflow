import { formatPolynomial, show } from '../format';
import { gcd } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator, Problem } from '../types';

const MAX_TRIES = 20;
const factor = (a: number, b: number): string => `(${formatPolynomial([a, b])})`;

/** A non-zero integer with |n| in [min, max]. */
const signedBetween = (rng: Rng, min: number, max: number): number =>
  rng.int(min, max) * (rng.next() < 0.5 ? -1 : 1);

/** A value b with |b| in [min, max] and gcd(a, b) = 1 (falls back to 1, which is coprime to anything). */
function coprimeTo(rng: Rng, a: number, min: number, max: number): number {
  for (let tries = 0; tries < MAX_TRIES; tries += 1) {
    const b = signedBetween(rng, min, max);
    if (gcd(a, b) === 1) return b;
  }
  return 1;
}

export const factoringGenerator: Generator = {
  topicId: 'factoring',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const make = (
      coefficients: number[],
      answer: string,
      hint: string,
      steps: string[],
    ): Problem => ({
      topicId: 'factoring',
      seed,
      difficulty,
      prompt: `Factor: ${formatPolynomial(coefficients)}`,
      answer: { type: 'expression', text: answer, form: 'factored' },
      hints: [hint],
      steps,
    });

    if (difficulty === 1) {
      const [k, m] = [rng.int(2, 6), rng.int(1, 5)];
      const n = coprimeTo(rng, m, 1, 9);
      const answer = `${k}${factor(m, n)}`;
      return make(
        [k * m, k * n],
        answer,
        'Find the greatest common factor of the terms and divide it out.',
        [`The greatest common factor of the terms is ${k}`, `Divide each term by ${k}: ${answer}`],
      );
    }

    if (difficulty <= 3) {
      const p = signedBetween(rng, 2, difficulty === 2 ? 6 : 9);
      const drawn = signedBetween(rng, 2, difficulty === 2 ? 6 : 9);
      const q = p + drawn === 0 ? drawn + Math.sign(drawn) : drawn;
      const answer = `${factor(1, p)}${factor(1, q)}`;
      return make(
        [1, p + q, p * q],
        answer,
        'Find two numbers that multiply to the constant and add to the middle coefficient.',
        [
          `Two numbers that multiply to ${p * q} and add to ${p + q}: ${show(p)} × ${show(q)} = ${p * q} and ${show(p)} + ${show(q)} = ${p + q}`,
          `So the factors are ${answer}`,
        ],
      );
    }

    if (difficulty === 4) {
      const [m, n] = [rng.int(1, 3), rng.int(2, 9)];
      const square = m === 1 ? 'x^2' : `(${m}x)^2`;
      const answer = `${factor(m, n)}${factor(m, -n)}`;
      return make(
        [m * m, 0, -n * n],
        answer,
        'A difference of squares: a^2 - b^2 = (a + b)(a - b).',
        [
          `This is a difference of squares: ${square} - ${n}^2`,
          `a^2 - b^2 = (a + b)(a - b), so the factors are ${answer}`,
        ],
      );
    }

    const [p, q] = [rng.int(1, 3), rng.int(2, 3)];
    const r = coprimeTo(rng, p, 1, 5);
    const drawn = coprimeTo(rng, q, 1, 5);
    const s = Math.abs(r * drawn) < 2 ? coprimeTo(rng, q, 2, 5) * Math.sign(drawn) : drawn;
    const [a, b, c] = [p * q, p * s + r * q, r * s];
    const [m1, m2] = [p * s, r * q];
    const answer = `${factor(p, r)}${factor(q, s)}`;
    return make(
      [a, b, c],
      answer,
      'Find two numbers that multiply to a × c and add to b, split the middle term, then group.',
      [
        `a × c = ${a} × ${show(c)} = ${a * c}`,
        `Two numbers that multiply to ${a * c} and add to ${b}: ${show(m1)} × ${show(m2)} = ${a * c} and ${show(m1)} + ${show(m2)} = ${b}`,
        `Factor by grouping: ${answer}`,
      ],
    );
  },
};
