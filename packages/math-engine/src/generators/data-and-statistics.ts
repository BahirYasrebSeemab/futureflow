import { decimalText } from '../format';
import { rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Difficulty, Generator } from '../types';

type Stat = 'mean' | 'median' | 'mode' | 'range';

const STATS: Record<Difficulty, readonly Stat[]> = {
  1: ['range', 'mode'],
  2: ['median'],
  3: ['mean'],
  4: ['median', 'mean'],
  5: ['mean', 'median', 'mode', 'range'],
};

const HINTS: Record<Stat, string> = {
  mean: 'Mean = sum of the values ÷ number of values.',
  median: 'Sort the values; the median is the middle one (or the average of the middle two).',
  mode: 'The mode is the value that appears most often.',
  range: 'Range = largest value − smallest value.',
};

/** A shuffled copy (Fisher–Yates); the input is not changed. */
function shuffled(rng: Rng, items: readonly number[]): number[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j] as number, out[i] as number];
  }
  return out;
}

/** `count` different values from 1..max, in random order. */
const distinct = (rng: Rng, count: number, max: number): number[] =>
  shuffled(
    rng,
    Array.from({ length: max }, (_, i) => i + 1),
  ).slice(0, count);

export const dataAndStatisticsGenerator: Generator = {
  topicId: 'data-and-statistics',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const stat = rng.pick(STATS[difficulty]);
    const evenCount = stat === 'median' && difficulty >= 4;
    const count = evenCount ? 6 : difficulty >= 5 ? 9 : 5 + 2 * rng.int(0, 1);
    const max = 10 * (difficulty + 1);

    const pool = distinct(rng, stat === 'mode' ? count - 1 : count, max);
    const repeated = pool[rng.int(0, pool.length - 1)] as number;
    // Shuffle after adding the repeat, so the mode's position gives nothing away.
    const values = stat === 'mode' ? shuffled(rng, [...pool, repeated]) : pool;
    if (stat === 'mean') {
      const total = values.reduce((s, v) => s + v, 0);
      values[values.length - 1] = (values.at(-1) as number) + ((count - (total % count)) % count);
    }

    const sorted = [...values].sort((x, y) => x - y);
    const sum = values.reduce((s, v) => s + v, 0);
    const half = count / 2;
    let answer: ReturnType<typeof rational>;
    let steps: string[];
    if (stat === 'mean') {
      answer = rational(sum, count);
      steps = [
        `Sum: ${values.join(' + ')} = ${sum}`,
        `Mean = ${sum} ÷ ${count} = ${decimalText(answer)}`,
      ];
    } else if (stat === 'median') {
      const [low, high] = [
        sorted[Math.ceil(half) - 1] as number,
        sorted[Math.floor(half)] as number,
      ];
      answer =
        count % 2 === 1 ? rational(sorted[Math.floor(half)] as number) : rational(low + high, 2);
      steps = [
        `Sorted: ${sorted.join(', ')}`,
        count % 2 === 1
          ? `The middle value is ${decimalText(answer)}`
          : `The middle two are ${low} and ${high}: ${low} + ${high} = ${low + high}, and ${low + high} ÷ 2 = ${decimalText(answer)}`,
      ];
    } else if (stat === 'mode') {
      answer = rational(repeated);
      steps = [
        `Sorted: ${sorted.join(', ')}`,
        `${repeated} appears twice; every other value appears once`,
      ];
    } else {
      const [min, top] = [sorted[0] as number, sorted.at(-1) as number];
      answer = rational(top - min);
      steps = [`Largest ${top}, smallest ${min}`, `Range = ${top} - ${min} = ${top - min}`];
    }

    return {
      topicId: 'data-and-statistics',
      seed,
      difficulty,
      prompt: `Find the ${stat} of: ${values.join(', ')}`,
      answer: { type: 'number', value: answer },
      hints: [HINTS[stat]],
      steps,
    };
  },
};
