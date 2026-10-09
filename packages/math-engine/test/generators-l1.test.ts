import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { answerText, checkAnswer, countTerms } from '../src/check';
import { algebraicExpressionsGenerator } from '../src/generators/algebraic-expressions';
import { linearEquationsGenerator } from '../src/generators/linear-equations';
import { DEFAULT_REGISTRY } from '../src/generators/registry';
import { toNumber } from '../src/rational';
import { evaluate, identicallyEqual, promptMath, RUNS, seedAndDifficulty } from './oracle';

describe('algebraic-expressions generator', () => {
  it('answer is identical to the prompt and in simplified form', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = algebraicExpressionsGenerator.generate(seed, d);
        if (problem.answer.type !== 'expression') throw new Error('expected an expression');
        expect(identicallyEqual(promptMath(problem.prompt), problem.answer.text)).toBe(true);
        expect(countTerms(problem.answer.text)).toBeLessThanOrEqual(2);
        expect(problem.answer.text).not.toContain('(');
      }),
      RUNS,
    );
  });

  it('rejects the unsimplified prompt itself as an answer', () => {
    const problem = algebraicExpressionsGenerator.generate(12345, 3);
    expect(checkAnswer(problem.answer, promptMath(problem.prompt))).toBe('incorrect');
  });

  it('is deterministic and accepts its own canonical answer', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = algebraicExpressionsGenerator.generate(seed, d);
        expect(algebraicExpressionsGenerator.generate(seed, d)).toEqual(problem);
        expect(checkAnswer(problem.answer, answerText(problem.answer))).toBe('correct');
      }),
      RUNS,
    );
  });
});

describe('linear-equations generator', () => {
  it('answer satisfies the equation', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearEquationsGenerator.generate(seed, d);
        if (problem.answer.type !== 'number') throw new Error('expected a number');
        const [lhs = '', rhs = ''] = promptMath(problem.prompt).split('=');
        const x = toNumber(problem.answer.value);
        expect(evaluate(lhs, { x })).toBeCloseTo(evaluate(rhs, { x }), 9);
        expect(Number.isInteger(x)).toBe(true);
      }),
      RUNS,
    );
  });

  it('puts x on both sides from difficulty 4', () => {
    const problem = linearEquationsGenerator.generate(7, 4);
    const [, rhs = ''] = promptMath(problem.prompt).split('=');
    expect(rhs).toContain('x');
  });

  it('is deterministic and accepts "x = answer"', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearEquationsGenerator.generate(seed, d);
        expect(linearEquationsGenerator.generate(seed, d)).toEqual(problem);
        expect(checkAnswer(problem.answer, `x = ${answerText(problem.answer)}`)).toBe('correct');
      }),
      RUNS,
    );
  });
});

describe('registry', () => {
  it('includes the L1 generators', () => {
    expect(DEFAULT_REGISTRY.has('algebraic-expressions')).toBe(true);
    expect(DEFAULT_REGISTRY.has('linear-equations')).toBe(true);
  });
});
