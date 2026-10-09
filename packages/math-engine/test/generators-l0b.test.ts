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
import { percentsGenerator } from '../src/generators/percents';
import { ratiosAndRatesGenerator } from '../src/generators/ratios-and-rates';
import { exponentsAndRootsGenerator } from '../src/generators/exponents-and-roots';

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

expectGeneratorContract(percentsGenerator);

describe('percents oracle', () => {
  it('agrees with plain arithmetic parsed from the prompt', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = percentsGenerator.generate(seed, d);
        const value = numberAnswer(problem.answer);
        const of = /^What is (\d+)% of (\d+)\?$/.exec(problem.prompt);
        const whatPercent = /^What percent of (\d+) is (\d+)\?$/.exec(problem.prompt);
        const increase = /^Increase (\d+) by (\d+)%$/.exec(problem.prompt);
        if (of) expect(value).toBeCloseTo((Number(of[1]) * Number(of[2])) / 100, 9);
        else if (whatPercent)
          expect(value).toBeCloseTo((Number(whatPercent[2]) / Number(whatPercent[1])) * 100, 9);
        else if (increase)
          expect(value).toBeCloseTo(Number(increase[1]) * (1 + Number(increase[2]) / 100), 9);
        else throw new Error(`unexpected prompt: ${problem.prompt}`);
      }),
      RUNS,
    );
  });

  it('only uses the harder forms from their difficulty', () => {
    expect(percentsGenerator.generate(3, 1).prompt).toMatch(/^What is /);
  });
});

expectGeneratorContract(ratiosAndRatesGenerator);

describe('ratios-and-rates oracle', () => {
  it('answer satisfies the proportion, or the rate parsed from the prompt', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = ratiosAndRatesGenerator.generate(seed, d);
        const x = numberAnswer(problem.answer);
        const rate = /travels (\d+) km in (\d+) hours/.exec(problem.prompt);
        if (rate) {
          expect(x).toBe(Number(rate[1]) / Number(rate[2]));
          return;
        }
        const [lhs = '', rhs = ''] = promptMath(problem.prompt).split('=');
        expect(evaluate(lhs, { x })).toBeCloseTo(evaluate(rhs, { x }), 9);
      }),
      RUNS,
    );
  });
});

expectGeneratorContract(exponentsAndRootsGenerator);

describe('exponents-and-roots oracle', () => {
  it('matches the CAS', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = exponentsAndRootsGenerator.generate(seed, d);
        expect(evaluate(promptMath(problem.prompt))).toBeCloseTo(numberAnswer(problem.answer), 9);
      }),
      RUNS,
    );
  });
});

describe('review fixes: L0 generators', () => {
  const hard = fc.tuple(
    fc.integer({ min: 0, max: 2 ** 31 - 1 }),
    fc.constantFrom(4 as const, 5 as const),
  );

  it('ratios at d4-5 always have a whole-number x', () => {
    fc.assert(
      fc.property(hard, ([seed, d]) => {
        expect(
          Number.isInteger(numberAnswer(ratiosAndRatesGenerator.generate(seed, d).answer)),
        ).toBe(true);
      }),
      RUNS,
    );
  });

  it('decimals prompts always contain a decimal', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        expect(decimalsGenerator.generate(seed, d).prompt).toMatch(/\d\.\d/);
      }),
      RUNS,
    );
  });

  it('decimal × and ÷ steps teach the method, not just the result', () => {
    fc.assert(
      fc.property(hard, ([seed, d]) => {
        const problem = decimalsGenerator.generate(seed, d);
        const steps = problem.steps.join(' | ');
        if (problem.prompt.includes('×')) expect(steps).toMatch(/decimal places/);
        if (problem.prompt.includes('÷')) expect(steps).toMatch(/whole numbers/);
      }),
      RUNS,
    );
  });

  it('multi-digit whole-number × and ÷ show partial work ending in the answer', () => {
    fc.assert(
      fc.property(hard, ([seed, d]) => {
        const problem = wholeNumberOperationsGenerator.generate(seed, d);
        const match = /^Calculate: (\d+) ([×÷]) (\d+)$/.exec(problem.prompt);
        if (match === null) return;
        const [, a, op, b] = match;
        const value = numberAnswer(problem.answer);
        const multiDigit = op === '×' ? Number(a) >= 10 && Number(b) >= 10 : value >= 10;
        if (!multiDigit) return;
        expect(problem.steps.length).toBeGreaterThanOrEqual(3);
        expect(problem.steps.at(-1)).toMatch(new RegExp(`\\b${value}$`));
      }),
      RUNS,
    );
  });

  it('percents at d1 always have whole-number answers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        expect(Number.isInteger(numberAnswer(percentsGenerator.generate(seed, 1).answer))).toBe(
          true,
        );
      }),
      RUNS,
    );
  });

  it('exponents d4 differs from d3, and d5 has three terms', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        expect(exponentsAndRootsGenerator.generate(seed, 4).prompt).not.toBe(
          exponentsAndRootsGenerator.generate(seed, 3).prompt,
        );
        expect(
          promptMath(exponentsAndRootsGenerator.generate(seed, 5).prompt).match(/ [+-] /g),
        ).toHaveLength(2);
      }),
      RUNS,
    );
  });
});
