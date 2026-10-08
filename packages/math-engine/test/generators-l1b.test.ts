import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { linearInequalitiesGenerator } from '../src/generators/linear-inequalities';
import { toNumber } from '../src/rational';
import { expectGeneratorContract } from './contract';
import { evaluate, numberAnswer, promptMath, RUNS, seedAndDifficulty } from './oracle';
import { linearRelationsGenerator } from '../src/generators/linear-relations';
import { exponentLawsGenerator } from '../src/generators/exponent-laws';

const holds = (left: number, op: string, right: number): boolean =>
  op === '<'
    ? left < right
    : op === '≤'
      ? left <= right
      : op === '>'
        ? left > right
        : left >= right;

expectGeneratorContract(linearInequalitiesGenerator);

describe('linear-inequalities oracle', () => {
  it('the answer is true exactly where the original inequality is true', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearInequalitiesGenerator.generate(seed, d);
        if (problem.answer.type !== 'inequality') throw new Error('expected an inequality');
        const match = /^Solve: (.+) ([<>≤≥]) (-?\d+)$/.exec(problem.prompt);
        if (match === null) throw new Error(`unexpected prompt: ${problem.prompt}`);
        const [, lhs = '', op = '', rhs = ''] = match;
        const bound = toNumber(problem.answer.bound);
        for (const x of [bound - 0.5, bound, bound + 0.5]) {
          expect(holds(x, problem.answer.op, bound)).toBe(
            holds(evaluate(lhs, { x }), op, Number(rhs)),
          );
        }
      }),
      RUNS,
    );
  });

  it('flips the sign when dividing by a negative', () => {
    const flipped = Array.from({ length: 200 }, (_, seed) =>
      linearInequalitiesGenerator.generate(seed, 4),
    ).filter((p) => /^Solve: -/.test(p.prompt));
    expect(flipped.length).toBeGreaterThan(0);
    for (const p of flipped) expect(p.steps.join(' ')).toMatch(/flip/);
  });
});

expectGeneratorContract(linearRelationsGenerator);

describe('linear-relations oracle', () => {
  it('values, slopes and equations agree with the numbers in the prompt', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearRelationsGenerator.generate(seed, d);
        const points = [...problem.prompt.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [
          Number(m[1]),
          Number(m[2]),
        ]);
        const evaluateAt = /^For y = (.+), find y when x = (-?\d+)\.$/.exec(problem.prompt);
        if (evaluateAt) {
          expect(numberAnswer(problem.answer)).toBeCloseTo(
            evaluate(evaluateAt[1] ?? '', { x: Number(evaluateAt[2]) }),
            9,
          );
        } else if (/^Find the slope/.test(problem.prompt)) {
          const [[x1, y1] = [], [x2, y2] = []] = points;
          expect(numberAnswer(problem.answer)).toBeCloseTo(
            ((y2 ?? 0) - (y1 ?? 0)) / ((x2 ?? 0) - (x1 ?? 1)),
            9,
          );
        } else {
          if (problem.answer.type !== 'expression') throw new Error('expected an equation');
          for (const [x = 0, y = 0] of points)
            expect(evaluate(problem.answer.text, { x })).toBeCloseTo(y, 9);
          const slope = /slope (-?\d+)/.exec(problem.prompt);
          if (slope)
            expect(
              evaluate(problem.answer.text, { x: 1 }) - evaluate(problem.answer.text, { x: 0 }),
            ).toBeCloseTo(Number(slope[1]), 9);
        }
      }),
      RUNS,
    );
  });
});

expectGeneratorContract(exponentLawsGenerator);

describe('exponent-laws oracle', () => {
  it('answer equals the prompt numerically and is a single simplified term', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = exponentLawsGenerator.generate(seed, d);
        if (problem.answer.type !== 'expression') throw new Error('expected an expression');
        for (const x of [1.3, 2.1, -0.7]) {
          expect(evaluate(problem.answer.text, { x })).toBeCloseTo(
            evaluate(promptMath(problem.prompt), { x }),
            6,
          );
        }
        expect(problem.answer.text).toMatch(/^-?\d*x\^\d+$/);
      }),
      RUNS,
    );
  });
});
