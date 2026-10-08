import { rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator, Problem } from '../types';

const SUPERSCRIPT: Record<number, string> = { 0: '⁰', 2: '²', 3: '³' };

type Part = Readonly<{ text: string; value: number; step: string }>;

const power = (a: number, n: number): Part => ({
  text: `${a}${SUPERSCRIPT[n]}`,
  value: a ** n,
  step:
    n === 0
      ? `${a}⁰ = 1 (any non-zero number to the power 0 is 1)`
      : `${a}${SUPERSCRIPT[n]} = ${a ** n}`,
});

const root = (k: number): Part => ({
  text: `√${k * k}`,
  value: k,
  step: `√${k * k} = ${k}, because ${k}² = ${k * k}`,
});

function single(rng: Rng, difficulty: number): Part {
  if (difficulty === 1) return rng.next() < 0.5 ? power(rng.int(2, 12), 2) : root(rng.int(2, 12));
  return rng.next() < 0.5 ? power(rng.int(2, 6), 3) : root(rng.int(2, 15));
}

export const exponentsAndRootsGenerator: Generator = {
  topicId: 'exponents-and-roots',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const base = {
      topicId: 'exponents-and-roots',
      seed,
      difficulty,
      hints: ['Work out each power and root first, then add or subtract.'],
    } as const;
    const make = (prompt: string, value: number, steps: string[]): Problem => ({
      ...base,
      prompt: `Calculate: ${prompt}`,
      answer: { type: 'number', value: rational(value) },
      steps,
    });

    if (difficulty <= 2) {
      const part = single(rng, difficulty);
      return make(part.text, part.value, [part.step]);
    }
    const left =
      difficulty === 5 && rng.next() < 0.5
        ? power(rng.int(2, 9), 0)
        : power(rng.int(2, 5), rng.pick([2, 3]));
    const right = left.value === 1 ? power(rng.int(2, 12), 2) : root(rng.int(2, 12));
    const op = left.value === 1 ? '+' : rng.pick(['+', '-'] as const);
    const value = op === '+' ? left.value + right.value : left.value - right.value;
    return make(`${left.text} ${op} ${right.text}`, value, [
      left.step,
      right.step,
      `${left.value} ${op} ${right.value} = ${value}`,
    ]);
  },
};
