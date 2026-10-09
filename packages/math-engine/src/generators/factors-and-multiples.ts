import { gcd, rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

const MAX_TRIES = 20;

/** Two different coprime numbers in [2, max]; (2, 3) if the draws keep colliding. */
function coprimePair(rng: Rng, max: number): [number, number] {
  for (let tries = 0; tries < MAX_TRIES; tries += 1) {
    const [m, n] = [rng.int(2, max), rng.int(2, max)];
    if (m !== n && gcd(m, n) === 1) return [m, n];
  }
  return [2, 3];
}

const factorsOf = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => i + 1).filter((k) => n % k === 0);

export const factorsAndMultiplesGenerator: Generator = {
  topicId: 'factors-and-multiples',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const g = rng.int(2, 2 + 2 * difficulty);
    const [m, n] = coprimePair(rng, 3 + difficulty);
    const [a, b] = [g * m, g * n];
    const base = { topicId: 'factors-and-multiples', seed, difficulty } as const;

    if (rng.pick(['gcf', 'lcm'] as const) === 'gcf') {
      return {
        ...base,
        prompt: `Find the greatest common factor of ${a} and ${b}`,
        answer: { type: 'number', value: rational(g) },
        hints: ['List the factors of each number and find the largest one they share.'],
        steps: [
          `Factors of ${a}: ${factorsOf(a).join(', ')}`,
          `Factors of ${b}: ${factorsOf(b).join(', ')}`,
          `The largest shared factor is ${g}`,
        ],
      };
    }
    const lcm = g * m * n;
    return {
      ...base,
      prompt: `Find the least common multiple of ${a} and ${b}`,
      answer: { type: 'number', value: rational(lcm) },
      hints: ['The least common multiple is the smallest number both divide into evenly.'],
      steps: [
        `The greatest common factor of ${a} and ${b} is ${g}`,
        `LCM = ${a} × ${b} ÷ ${g} = ${lcm}`,
      ],
    };
  },
};
