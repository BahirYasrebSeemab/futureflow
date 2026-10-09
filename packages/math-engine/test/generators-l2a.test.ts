import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkAnswer, countTerms } from '../src/check';
import { polynomialOperationsGenerator } from '../src/generators/polynomial-operations';
import { expectGeneratorContract } from './contract';
import { afterLabel, evaluate, promptMath, RUNS, seedAndDifficulty } from './oracle';
import { factoringGenerator } from '../src/generators/factoring';
import { quadraticEquationsGenerator } from '../src/generators/quadratic-equations';
import { toNumber } from '../src/rational';

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

expectGeneratorContract(quadraticEquationsGenerator);

describe('quadratic-equations oracle', () => {
  it('has two distinct roots that satisfy the equation (or match the formula when rounded)', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = quadraticEquationsGenerator.generate(seed, d);
        if (problem.answer.type !== 'set') throw new Error('expected a set');
        const roots = problem.answer.items.map(toNumber);
        expect(roots).toHaveLength(2);
        expect(roots[0]).not.toBe(roots[1]);
        const equation = promptMath(problem.prompt).replace(/\. Round.*$/, '');
        const [lhs = ''] = equation.split('=');
        if (/Round to two/.test(problem.prompt)) {
          const coefficients = /^(-?\d*)x\^2 ([+-]) (\d*)x ([+-]) (\d+) = 0/.exec(equation);
          if (coefficients === null) throw new Error(`unexpected equation: ${equation}`);
          const [, aText = '', bSign, bText = '', cSign, cText = ''] = coefficients;
          const a = Number(aText);
          const b = (bSign === '-' ? -1 : 1) * Number(bText || '1');
          const c = (cSign === '-' ? -1 : 1) * Number(cText);
          const root = (sign: number): number =>
            Math.round(((-b + sign * Math.sqrt(b * b - 4 * a * c)) / (2 * a)) * 100) / 100;
          expect([...roots].sort((x, y) => x - y)).toEqual(
            [root(-1), root(1)].sort((x, y) => x - y),
          );
        } else {
          for (const x of roots) expect(Math.abs(evaluate(lhs, { x }))).toBeLessThan(1e-9);
        }
      }),
      RUNS,
    );
  });

  it('accepts the roots in any order and with x =', () => {
    const problem = quadraticEquationsGenerator.generate(11, 2);
    if (problem.answer.type !== 'set') throw new Error('expected a set');
    const [first, second] = problem.answer.items.map(toNumber);
    expect(checkAnswer(problem.answer, `x = ${second}, x = ${first}`)).toBe('correct');
    expect(checkAnswer(problem.answer, `${first}`)).toBe('incorrect');
  });
});
