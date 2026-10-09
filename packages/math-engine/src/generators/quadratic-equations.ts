import { decimalText, formatPolynomial, show } from '../format';
import { equals, rational, roundFloat, toText, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator, Problem } from '../types';

const signedBetween = (rng: Rng, min: number, max: number): number =>
  rng.int(min, max) * (rng.next() < 0.5 ? -1 : 1);

/** Two different values with |v| in [min, max]. */
function twoDistinct(rng: Rng, min: number, max: number): [number, number] {
  const r = signedBetween(rng, min, max);
  const drawn = signedBetween(rng, min, max);
  return [r, drawn === r ? -r : drawn];
}

const factor = (a: number, b: number): string => `(${formatPolynomial([a, b])})`;

export const quadraticEquationsGenerator: Generator = {
  topicId: 'quadratic-equations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const make = (
      prompt: string,
      roots: [Rational, Rational],
      hint: string,
      steps: string[],
    ): Problem => ({
      topicId: 'quadratic-equations',
      seed,
      difficulty,
      prompt: `Solve: ${prompt}`,
      answer: { type: 'set', items: roots, variable: 'x' },
      hints: [hint],
      steps,
    });
    const rootsText = (roots: [Rational, Rational]): string =>
      `x = ${toText(roots[0])} or x = ${toText(roots[1])}`;

    if (difficulty === 1) {
      const [r, s] = twoDistinct(rng, 1, 9);
      const roots: [Rational, Rational] = [rational(r), rational(s)];
      return make(
        `${factor(1, -r)}${factor(1, -s)} = 0`,
        roots,
        'If a product is zero, one of the factors is zero.',
        [
          `Set each factor to zero: ${formatPolynomial([1, -r])} = 0 or ${formatPolynomial([1, -s])} = 0`,
          rootsText(roots),
        ],
      );
    }

    if (difficulty <= 3) {
      const [r, s] = twoDistinct(rng, 2, difficulty === 2 ? 6 : 9);
      const [p, q] = [-r, -s];
      const roots: [Rational, Rational] = [rational(r), rational(s)];
      return make(
        `${formatPolynomial([1, p + q, p * q])} = 0`,
        roots,
        'Factor, then set each factor to zero.',
        [
          `Two numbers that multiply to ${p * q} and add to ${p + q}: ${show(p)} × ${show(q)} = ${p * q} and ${show(p)} + ${show(q)} = ${p + q}`,
          `Factor: ${factor(1, p)}${factor(1, q)} = 0`,
          rootsText(roots),
        ],
      );
    }

    if (difficulty === 4) {
      // p ≥ 2 and r coprime to p: the first root is a true fraction, so the leading coefficient is ≥ 2.
      const [p, q] = [rng.int(2, 3), rng.int(2, 3)];
      let r = signedBetween(rng, 1, 5);
      while (r % p === 0) r += 1;
      const s = signedBetween(rng, 1, 5);
      const rootA = rational(r, p);
      const candidate = rational(s, q);
      // -s/q can't also equal r/p (that would need s = 0), so the two roots are always distinct.
      const roots: [Rational, Rational] = [
        rootA,
        equals(rootA, candidate) ? rational(-s, q) : candidate,
      ];
      const [b1, b2] = [roots[0].num, roots[1].num];
      const [d1, d2] = [roots[0].den, roots[1].den];
      const coefficients = [d1 * d2, -(d1 * b2 + d2 * b1), b1 * b2];
      return make(
        `${formatPolynomial(coefficients)} = 0. Give exact answers (fractions where needed).`,
        roots,
        'Factor (try a × c), then set each factor to zero.',
        [`Factor: ${factor(d1, -b1)}${factor(d2, -b2)} = 0`, rootsText(roots)],
      );
    }

    const a = rng.int(2, 3);
    let b = 0;
    let c = 0;
    let discriminant = 0;
    for (let tries = 0; tries < 50; tries += 1) {
      b = signedBetween(rng, 1, 9);
      c = signedBetween(rng, 2, 9);
      discriminant = b * b - 4 * a * c;
      const root = Math.round(Math.sqrt(Math.max(discriminant, 0)));
      if (discriminant > 0 && root * root !== discriminant) break;
    }
    if (!(discriminant > 0)) [b, c, discriminant] = [3, -2, 9 + 8 * a];
    const sqrt = Math.sqrt(discriminant);
    const roots: [Rational, Rational] = [
      roundFloat((-b + sqrt) / (2 * a), 2),
      roundFloat((-b - sqrt) / (2 * a), 2),
    ];
    return make(
      `${formatPolynomial([a, b, c])} = 0. Round to two decimal places.`,
      roots,
      'Use the quadratic formula: x = (-b ± √(b² - 4ac)) ÷ 2a.',
      [
        `Discriminant: ${show(b)}² - 4 × ${a} × ${show(c)} = ${discriminant}`,
        `x = (${-b} ± √${discriminant}) ÷ ${2 * a}`,
        `x ≈ ${decimalText(roots[0])} or x ≈ ${decimalText(roots[1])}`,
      ],
    );
  },
};
