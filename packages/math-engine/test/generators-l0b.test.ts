import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { wholeNumberOperationsGenerator } from '../src/generators/whole-number-operations';
import { toNumber } from '../src/rational';
import { expectGeneratorContract } from './contract';
import { evaluate, promptMath, RUNS, seedAndDifficulty } from './oracle';

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
