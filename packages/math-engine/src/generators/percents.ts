import { decimalText } from '../format';
import { add, gcd, rational, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Difficulty, Generator, Problem } from '../types';

type Kind = 'of' | 'whatPercent' | 'increase';

const KINDS: Record<Difficulty, readonly Kind[]> = {
  1: ['of'],
  2: ['of', 'whatPercent'],
  3: ['of', 'whatPercent'],
  4: ['of', 'whatPercent', 'increase'],
  5: ['of', 'whatPercent', 'increase'],
};

const EASY_PERCENTS = [10, 20, 25, 50, 75];

const percent = (rng: Rng, difficulty: Difficulty): number =>
  difficulty === 1 ? rng.pick(EASY_PERCENTS) : rng.int(1, 19) * 5;

export const percentsGenerator: Generator = {
  topicId: 'percents',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const kind = rng.pick(KINDS[difficulty]);
    const p = percent(rng, difficulty);
    const base = { topicId: 'percents', seed, difficulty } as const;
    const make = (
      prompt: string,
      value: Rational,
      hint: string,
      steps: string[],
      unit?: 'percent',
    ): Problem => ({
      ...base,
      prompt,
      answer: unit === undefined ? { type: 'number', value } : { type: 'number', value, unit },
      hints: [hint],
      steps,
    });

    if (kind === 'of') {
      // At d1 the amount is a multiple of 100/gcd(p, 100), so the answer is a whole number.
      const n =
        difficulty === 1 ? (100 / gcd(p, 100)) * rng.int(1, 10) : rng.int(2, 20 * difficulty);
      const value = rational(p * n, 100);
      return make(`What is ${p}% of ${n}?`, value, 'A percent is a number out of 100.', [
        `${p}% = ${p}/100`,
        `${p}/100 × ${n} = ${decimalText(value)}`,
      ]);
    }
    if (kind === 'whatPercent') {
      const k = rng.int(1, 5 * difficulty);
      const [whole, part] = [20 * k, (p * k) / 5];
      const ratio = decimalText(rational(part, whole));
      return make(
        `What percent of ${whole} is ${part}?`,
        rational(p),
        'Divide the part by the whole, then multiply by 100.',
        [`${part} ÷ ${whole} = ${ratio}`, `${ratio} × 100 = ${p}%`],
        'percent',
      );
    }
    const n = rng.int(2, 40) * 5;
    const increase = rational(p * n, 100);
    const value = add(rational(n), increase);
    return make(
      `Increase ${n} by ${p}%`,
      value,
      'Find the percent of the number, then add it on.',
      [
        `${p}% of ${n} = ${decimalText(increase)}`,
        `${n} + ${decimalText(increase)} = ${decimalText(value)}`,
      ],
    );
  },
};
