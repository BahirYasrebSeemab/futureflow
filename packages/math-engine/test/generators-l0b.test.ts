import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { wholeNumberOperationsGenerator } from '../src/generators/whole-number-operations';
import { toNumber } from '../src/rational';
import { expectGeneratorContract } from './contract';
import { evaluate, promptMath, RUNS, seedAndDifficulty } from './oracle';
import { factorsAndMultiplesGenerator } from '../src/generators/factors-and-multiples';
import { decimalsGenerator } from '../src/generators/decimals';
import { checkAnswer } from '../src/check';
import { decimalText } from '../src/format';

const numberAnswer = (answer: { type: string; value?: { num: number; den: number } }): number => {
  if (answer.type !== 'number' || answer.value === undefined) throw new Error('expected a number');
  return toNumber(answer.value);
};

expectGeneratorContract(wholeNumberOperationsGenerator);

describe('whole-number-operations oracle', () => {
  it('matches the CAS and never goes negative or fractional', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = wholeNumberOperationsGenerator.generate(seed, d);
        const value = numberAnswer(problem.answer);
        expect(evaluate(promptMath(problem.prompt))).toBeCloseTo(value, 9);
        expect(Number.isInteger(value) && value >= 0).toBe(true);
      }),
      RUNS,
    );
  });
});

const bruteGcf = (a: number, b: number): number => {
  for (let k = Math.min(a, b); k >= 1; k -= 1) if (a % k === 0 && b % k === 0) return k;
  return 1;
};
const bruteLcm = (a: number, b: number): number => {
  for (let k = Math.max(a, b); ; k += 1) if (k % a === 0 && k % b === 0) return k;
};

expectGeneratorContract(factorsAndMultiplesGenerator);

describe('factors-and-multiples oracle', () => {
  it('agrees with brute force', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = factorsAndMultiplesGenerator.generate(seed, d);
        const match = /(greatest common factor|least common multiple) of (\d+) and (\d+)/.exec(
          problem.prompt,
        );
        if (match === null) throw new Error(`unexpected prompt: ${problem.prompt}`);
        const [, kind, a, b] = match;
        const expected =
          kind === 'greatest common factor'
            ? bruteGcf(Number(a), Number(b))
            : bruteLcm(Number(a), Number(b));
        expect(numberAnswer(problem.answer)).toBe(expected);
      }),
      RUNS,
    );
  });
});

expectGeneratorContract(decimalsGenerator);

describe('decimals oracle', () => {
  it('matches the CAS, stays non-negative, and accepts the decimal form', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = decimalsGenerator.generate(seed, d);
        const value = numberAnswer(problem.answer);
        expect(evaluate(promptMath(problem.prompt))).toBeCloseTo(value, 9);
        expect(value).toBeGreaterThanOrEqual(0);
        if (problem.answer.type !== 'number') throw new Error('expected a number');
        expect(checkAnswer(problem.answer, decimalText(problem.answer.value))).toBe('correct');
      }),
      RUNS,
    );
  });
});
