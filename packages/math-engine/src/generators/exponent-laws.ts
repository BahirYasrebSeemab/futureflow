import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

const monomial = (coefficient: number, exponent: number): string =>
  `${coefficient === 1 ? '' : coefficient}x^${exponent}`;

export const exponentLawsGenerator: Generator = {
  topicId: 'exponent-laws',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const exponent = (): number => rng.int(2, 5);
    const coefficient = (): number => rng.int(2, 6);
    const make = (
      prompt: string,
      c: number,
      n: number,
      hint: string,
      steps: string[],
    ): Problem => ({
      topicId: 'exponent-laws',
      seed,
      difficulty,
      prompt: `Simplify: ${prompt}`,
      answer: { type: 'expression', text: monomial(c, n), form: 'monomial' },
      hints: [hint],
      steps: [...steps, monomial(c, n)],
    });

    if (difficulty === 1) {
      const [a, b] = [exponent(), exponent()];
      return make(`x^${a} × x^${b}`, 1, a + b, 'Same base, multiplying: add the exponents.', [
        `Add the exponents: ${a} + ${b} = ${a + b}`,
      ]);
    }
    if (difficulty === 2) {
      const b = exponent();
      const a = b + rng.int(2, 4);
      return make(`x^${a} ÷ x^${b}`, 1, a - b, 'Same base, dividing: subtract the exponents.', [
        `Subtract the exponents: ${a} - ${b} = ${a - b}`,
      ]);
    }
    if (difficulty === 3) {
      const [a, b] = [exponent(), rng.int(2, 3)];
      return make(`(x^${a})^${b}`, 1, a * b, 'A power of a power: multiply the exponents.', [
        `Multiply the exponents: ${a} × ${b} = ${a * b}`,
      ]);
    }
    if (difficulty === 4) {
      const [c1, a, c2, b] = [coefficient(), exponent(), coefficient(), exponent()];
      return make(
        `(${c1}x^${a})(${c2}x^${b})`,
        c1 * c2,
        a + b,
        'Multiply the numbers, then add the exponents.',
        [
          `Multiply the coefficients: ${c1} × ${c2} = ${c1 * c2}`,
          `Add the exponents: ${a} + ${b} = ${a + b}`,
        ],
      );
    }
    const [c, a, b] = [rng.int(2, 4), exponent(), rng.int(2, 3)];
    return make(
      `(${c}x^${a})^${b}`,
      c ** b,
      a * b,
      'Raise the number to the power, and multiply the exponents.',
      [
        `Raise the coefficient: ${c}^${b} = ${c ** b}`,
        `Multiply the exponents: ${a} × ${b} = ${a * b}`,
      ],
    );
  },
};
