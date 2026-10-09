import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkAnswer, countTerms } from '../src/check';
import { polynomialOperationsGenerator } from '../src/generators/polynomial-operations';
import { expectGeneratorContract } from './contract';
import { afterLabel, evaluate, promptMath, RUNS, seedAndDifficulty } from './oracle';
import { factoringGenerator } from '../src/generators/factoring';

const SAMPLE_X = [1.3, -0.7, 2.9];

expectGeneratorContract(polynomialOperationsGenerator);

describe('polynomial-operations oracle', () => {
  it('answer and every step equal the original product, and the answer is expanded', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = polynomialOperationsGenerator.generate(seed, d);
        if (problem.answer.type !== 'expression') throw new Error('expected an expression');
        const original = promptMath(problem.prompt);
        for (const x of SAMPLE_X) {
          expect(evaluate(problem.answer.text, { x })).toBeCloseTo(evaluate(original, { x }), 6);
          for (const step of problem.steps)
            expect(evaluate(afterLabel(step), { x }), step).toBeCloseTo(
              evaluate(original, { x }),
              6,
            );
        }
        expect(problem.answer.text).not.toContain('(');
        expect(countTerms(problem.answer.text)).toBe(problem.answer.maxTerms);
      }),
      RUNS,
    );
  });
});

expectGeneratorContract(factoringGenerator);

describe('factoring oracle', () => {
  it('the factored answer equals the prompt, and the expanded prompt itself is not accepted', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = factoringGenerator.generate(seed, d);
        if (problem.answer.type !== 'expression') throw new Error('expected an expression');
        const original = promptMath(problem.prompt);
        for (const x of SAMPLE_X)
          expect(evaluate(problem.answer.text, { x })).toBeCloseTo(evaluate(original, { x }), 6);
        expect(problem.answer.form).toBe('factored');
        expect(checkAnswer(problem.answer, original)).toBe('incorrect');
      }),
      RUNS,
    );
  });
});
