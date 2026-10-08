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
    if (difficulty === 5) {
      // Three terms: a power (sometimes the zero power), a square, and a root.
      const first = rng.next() < 0.5 ? power(rng.int(2, 9), 0) : power(rng.int(2, 5), 3);
      const second = power(rng.int(2, 12), 2);
      const third = root(rng.int(2, 15));
      const value = first.value + second.value - third.value;
      return make(`${first.text} + ${second.text} - ${third.text}`, value, [
        first.step,
        second.step,
        third.step,
        `${first.value} + ${second.value} - ${third.value} = ${value}`,
      ]);
    }
    // d3 uses small bases and roots; d4 uses bigger ones, so the two bands never repeat each other.
    const exponent = rng.pick([2, 3]);
    const left =
      difficulty === 3
        ? power(rng.int(2, 5), exponent)
        : power(exponent === 2 ? rng.int(6, 12) : rng.int(4, 6), exponent);
    const right = root(difficulty === 3 ? rng.int(2, 12) : rng.int(13, 20));
    const op = rng.pick(['+', '-'] as const);
    const value = op === '+' ? left.value + right.value : left.value - right.value;
    return make(`${left.text} ${op} ${right.text}`, value, [
      left.step,
      right.step,
      `${left.value} ${op} ${right.value} = ${value}`,
    ]);
  },
};
