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

/** `count` different values from 1..max, in random order. */
function distinct(rng: Rng, count: number, max: number): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j] as number, pool[i] as number];
  }
  return pool.slice(0, count);
}

export const dataAndStatisticsGenerator: Generator = {
  topicId: 'data-and-statistics',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const stat = rng.pick(STATS[difficulty]);
    const evenCount = stat === 'median' && difficulty >= 4;
    const count = evenCount ? 6 : difficulty >= 5 ? 9 : 5 + 2 * rng.int(0, 1);
    const max = 10 * (difficulty + 1);

    const values =
      stat === 'mode'
        ? (() => {
            const pool = distinct(rng, count - 1, max);
            return [...pool, pool[rng.int(0, pool.length - 1)] as number];
          })()
        : distinct(rng, count, max);
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
          : `The middle two are ${low} and ${high}: (${low} + ${high}) ÷ 2 = ${decimalText(answer)}`,
      ];
    } else if (stat === 'mode') {
      const repeated = values.at(-1) as number;
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
