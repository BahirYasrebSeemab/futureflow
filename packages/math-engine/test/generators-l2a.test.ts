import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkAnswer, countTerms } from '../src/check';
import { polynomialOperationsGenerator } from '../src/generators/polynomial-operations';
import { expectGeneratorContract } from './contract';
import { afterLabel, evaluate, holdsAt, promptMath, RUNS, seedAndDifficulty } from './oracle';
import { factoringGenerator } from '../src/generators/factoring';
import { quadraticEquationsGenerator } from '../src/generators/quadratic-equations';
import { toNumber } from '../src/rational';
import { quadraticRelationsGenerator } from '../src/generators/quadratic-relations';
import { linearSystemsGenerator } from '../src/generators/linear-systems';
import { DEFAULT_REGISTRY } from '../src/generators/registry';

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

expectGeneratorContract(quadraticRelationsGenerator);

describe('quadratic-relations oracle', () => {
  it('agrees with the parabola evaluated by the CAS', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = quadraticRelationsGenerator.generate(seed, d);
        const match = /^For y = (.+), (.+)\?$/.exec(problem.prompt);
        if (match === null) throw new Error(`unexpected prompt: ${problem.prompt}`);
        const f = (x: number): number => evaluate(match[1] ?? '', { x });
        const { answer } = problem;
        if (answer.type === 'point') {
          const [h = 0, k = 0] = answer.coords.map(toNumber);
          expect(f(h)).toBeCloseTo(k, 9);
          expect(f(h - 1)).toBeCloseTo(f(h + 1), 9);
          expect(f(h + 1)).not.toBeCloseTo(k, 9);
        } else if (answer.type === 'set') {
          for (const x of answer.items.map(toNumber)) expect(f(x)).toBeCloseTo(0, 9);
        } else if (answer.type === 'number') {
          const value = toNumber(answer.value);
          if (/y-intercept/.test(problem.prompt)) expect(value).toBeCloseTo(f(0), 9);
          else if (/axis of symmetry/.test(problem.prompt))
            expect(f(value - 1)).toBeCloseTo(f(value + 1), 9);
          else {
            const sign = /\(x ([+-]) (\d+)\)/.exec(match[1] ?? '');
            const h = sign === null ? 0 : (sign[1] === '-' ? 1 : -1) * Number(sign[2]);
            expect(f(h)).toBeCloseTo(value, 9);
            expect(f(h + 1) > value).toBe(/minimum/.test(problem.prompt));
          }
        } else throw new Error('unexpected answer type');
      }),
      RUNS,
    );
  });
});

expectGeneratorContract(linearSystemsGenerator);

describe('linear-systems oracle', () => {
  it('the solution satisfies both equations, and every step holds at the solution', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearSystemsGenerator.generate(seed, d);
        if (problem.answer.type !== 'point') throw new Error('expected a point');
        const [x = 0, y = 0] = problem.answer.coords.map(toNumber);
        const equations = (problem.prompt.split(': ')[1] ?? '').split(' and ');
        expect(equations).toHaveLength(2);
        for (const equation of equations) expect(holdsAt(equation, { x, y }), equation).toBe(true);
        for (const step of problem.steps)
          expect(holdsAt(afterLabel(step), { x, y }), step).toBe(true);
      }),
      RUNS,
    );
  });

  it('marks a swapped point as incorrect', () => {
    const problem = linearSystemsGenerator.generate(5, 3);
    if (problem.answer.type !== 'point') throw new Error('expected a point');
    const [x = 0, y = 0] = problem.answer.coords.map(toNumber);
    if (x !== y) expect(checkAnswer(problem.answer, `(${y}, ${x})`)).toBe('incorrect');
  });
});

describe('Grade 10 algebra coverage', () => {
  it('registers all five algebra topics', () => {
    for (const id of [
      'polynomial-operations',
      'factoring',
      'quadratic-equations',
      'quadratic-relations',
      'linear-systems',
    ]) {
      expect(DEFAULT_REGISTRY.has(id), id).toBe(true);
    }
  });
});
