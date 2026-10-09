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
        const equation = promptMath(problem.prompt).replace(/\. (Round|Give).*$/, '');
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

describe('review fixes (P2d-1)', () => {
  const brackets = (text: string): string[] =>
    [...text.matchAll(/\(([^()]+)\)/g)].map((m) => m[1] ?? '');
  const linearCoefficients = (inner: string): [number, number] => {
    const compact = inner.replace(/\s+/g, '');
    const m = /^(-?\d*)x([+-]\d+)?$/.exec(compact);
    if (m === null) throw new Error(`not linear: ${inner}`);
    const p = m[1] === '' ? 1 : m[1] === '-' ? -1 : Number(m[1]);
    return [p, Number(m[2] ?? '0')];
  };
  const gcdOf = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcdOf(b, a % b));

  it('every factoring model answer is fully factored (no common factor left in a bracket)', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = factoringGenerator.generate(seed, d);
        if (problem.answer.type !== 'expression') throw new Error('expected an expression');
        for (const inner of brackets(problem.answer.text)) {
          const [p, q] = linearCoefficients(inner);
          expect(gcdOf(p, q), problem.answer.text).toBe(1);
        }
      }),
      RUNS,
    );
  });

  it('every factoring step that names the factors names a correct factorization', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = factoringGenerator.generate(seed, d);
        const original = promptMath(problem.prompt);
        for (const step of problem.steps) {
          const claim = /(?:factors are|grouping:|Divide each term by \d+:) (.+)$/.exec(step);
          if (claim === null) continue;
          for (const x of SAMPLE_X)
            expect(evaluate(claim[1] ?? '', { x }), step).toBeCloseTo(evaluate(original, { x }), 6);
        }
      }),
      RUNS,
    );
  });

  it('quadratic-equations steps: the factored form equals the equation and every stated root solves it', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = quadraticEquationsGenerator.generate(seed, d);
        const [lhs = ''] = promptMath(problem.prompt)
          .replace(/\. (Round|Give).*$/, '')
          .split('=');
        for (const step of problem.steps) {
          const factored = /^Factor: (.+) = 0$/.exec(step);
          if (factored)
            for (const x of SAMPLE_X)
              expect(evaluate(factored[1] ?? '', { x }), step).toBeCloseTo(evaluate(lhs, { x }), 6);
          const roots = /^x = (\S+) or x = (\S+)$/.exec(step);
          if (roots)
            for (const r of [roots[1], roots[2]])
              expect(Math.abs(evaluate(lhs, { x: evaluate(r ?? '') })), step).toBeLessThan(1e-9);
          const formula = /^x = \((-?\d+) ± √(\d+)\) ÷ (\d+)$/.exec(step);
          if (formula && problem.answer.type === 'set') {
            const [b, disc, twoA] = [Number(formula[1]), Number(formula[2]), Number(formula[3])];
            const expected = [(b + Math.sqrt(disc)) / twoA, (b - Math.sqrt(disc)) / twoA].map(
              (v) => Math.round(v * 100) / 100,
            );
            expect(problem.answer.items.map(toNumber).sort()).toEqual(expected.sort());
          }
        }
      }),
      RUNS,
    );
  });

  it('quadratic-relations steps state the same vertex and zeros as the answer', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = quadraticRelationsGenerator.generate(seed, d);
        const f = (x: number): number =>
          evaluate(/^For y = (.+), /.exec(problem.prompt)?.[1] ?? '', { x });
        for (const step of problem.steps) {
          const vertex = /vertex is \((-?\d+), (-?\d+)\)/.exec(step);
          if (vertex) {
            expect(f(Number(vertex[1])), step).toBeCloseTo(Number(vertex[2]), 9);
            expect(f(Number(vertex[1]) - 1)).toBeCloseTo(f(Number(vertex[1]) + 1), 9);
          }
          const zeros = /^x = (-?\d+) or x = (-?\d+)$/.exec(step);
          if (zeros)
            for (const z of [zeros[1], zeros[2]]) expect(f(Number(z)), step).toBeCloseTo(0, 9);
        }
      }),
      RUNS,
    );
  });

  it('labels: a horizontal line is not an axis of symmetry, and roots are x-values', () => {
    const axis = quadraticRelationsGenerator.generate(4, 2);
    if (axis.answer.type !== 'number') throw new Error('expected a number');
    const h = toNumber(axis.answer.value);
    expect(checkAnswer(axis.answer, `x = ${h}`)).toBe('correct');
    expect(checkAnswer(axis.answer, `y = ${h}`)).toBe('incorrect');
    const roots = quadraticEquationsGenerator.generate(4, 2);
    if (roots.answer.type !== 'set') throw new Error('expected a set');
    const [r = 0, s = 0] = roots.answer.items.map(toNumber);
    expect(checkAnswer(roots.answer, `y = ${r}, y = ${s}`)).toBe('incorrect');
  });

  it('d4 quadratic equations say "exact" and are not secretly d2 problems', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const problem = quadraticEquationsGenerator.generate(seed, 4);
        expect(problem.prompt).toMatch(/Give exact answers/);
        expect(problem.prompt).not.toMatch(/^Solve: x\^2/);
      }),
      RUNS,
    );
  });
});
