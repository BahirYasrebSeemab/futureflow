import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyticGeometryGenerator } from '../src/generators/analytic-geometry';
import { toNumber } from '../src/rational';
import { expectGeneratorContract } from './contract';
import { evaluate, numberAnswer, RUNS, seedAndDifficulty } from './oracle';

const points = (text: string): [number, number][] =>
  [...text.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);

expectGeneratorContract(analyticGeometryGenerator);

describe('analytic-geometry oracle', () => {
  it('agrees with coordinate geometry on the prompt points', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = analyticGeometryGenerator.generate(seed, d);
        const [[x1, y1] = [0, 0], [x2, y2] = [0, 0]] = points(problem.prompt);
        if (/midpoint/.test(problem.prompt)) {
          if (problem.answer.type !== 'point') throw new Error('expected a point');
          expect(problem.answer.coords.map(toNumber)).toEqual([(x1 + x2) / 2, (y1 + y2) / 2]);
        } else if (/length/.test(problem.prompt)) {
          const exact = Math.hypot(x2 - x1, y2 - y1);
          expect(Math.abs(numberAnswer(problem.answer) - exact)).toBeLessThanOrEqual(0.05 + 1e-9);
          if (!/Round/.test(problem.prompt)) expect(numberAnswer(problem.answer)).toBe(exact);
        } else if (/perpendicular/.test(problem.prompt)) {
          const m = Number(/y = (-?\d+)x/.exec(problem.prompt)?.[1]);
          expect(numberAnswer(problem.answer) * m).toBeCloseTo(-1, 9);
        } else {
          if (problem.answer.type !== 'expression') throw new Error('expected an equation');
          const m = Number(/parallel to y = (-?\d+)x/.exec(problem.prompt)?.[1]);
          const [[px, py] = [0, 0]] = points(problem.prompt);
          expect(evaluate(problem.answer.text, { x: px })).toBeCloseTo(py, 9);
          expect(
            evaluate(problem.answer.text, { x: px + 1 }) - evaluate(problem.answer.text, { x: px }),
          ).toBeCloseTo(m, 9);
        }
      }),
      RUNS,
    );
  });
});
