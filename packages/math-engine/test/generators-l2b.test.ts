import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyticGeometryGenerator } from '../src/generators/analytic-geometry';
import { toNumber } from '../src/rational';
import { expectGeneratorContract } from './contract';
import { evaluate, numberAnswer, RUNS, seedAndDifficulty } from './oracle';
import { similarTrianglesGenerator } from '../src/generators/similar-triangles';
import { rightTriangleTrigonometryGenerator } from '../src/generators/right-triangle-trigonometry';

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

expectGeneratorContract(similarTrianglesGenerator);

describe('similar-triangles oracle', () => {
  it('corresponding sides are in the same ratio', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = similarTrianglesGenerator.generate(seed, d);
        const n = [...problem.prompt.matchAll(/(\d+(?:\.\d+)?) c?m\b/g)].map((m) => Number(m[1]));
        const answer = numberAnswer(problem.answer);
        if (/shadow/.test(problem.prompt)) {
          const [pole = 0, poleShadow = 1, treeShadow = 0] = n;
          expect(answer / treeShadow).toBeCloseTo(pole / poleShadow, 9);
        } else if (/scale factor/.test(problem.prompt)) {
          const [smallest = 1, , , image = 0] = n;
          expect(answer).toBeCloseTo(image / smallest, 9);
        } else {
          const [, , longest = 0, image = 0] = n;
          const smallest = n[0] ?? 1;
          expect(answer / longest).toBeCloseTo(image / smallest, 9);
        }
      }),
      RUNS,
    );
  });
});

const RAD = Math.PI / 180;
const TRIG: Record<string, (x: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan };
const INVERSE: Record<string, (x: number) => number> = {
  sin: Math.asin,
  cos: Math.acos,
  tan: Math.atan,
};

expectGeneratorContract(rightTriangleTrigonometryGenerator);

describe('right-triangle-trigonometry oracle', () => {
  it('every trig step and the answer agree with the ratios, and nothing sits on a rounding boundary', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = rightTriangleTrigonometryGenerator.generate(seed, d);
        const answer = numberAnswer(problem.answer);
        const places = /nearest degree/.test(problem.prompt) ? 0 : 1;
        let checked = 0;
        for (const step of problem.steps) {
          const side = /(\d+) ([×÷]) (sin|cos|tan)\((\d+)°\) ≈ (\d+(?:\.\d+)?)$/.exec(step);
          if (side) {
            const [, k = '', op = '', fn = '', angle = '', shown = ''] = side;
            const exact =
              op === '×'
                ? Number(k) * (TRIG[fn]?.(Number(angle) * RAD) ?? 0)
                : Number(k) / (TRIG[fn]?.(Number(angle) * RAD) ?? 1);
            expect(Number(shown), step).toBe(Math.round(exact * 10) / 10);
            expect(Math.abs(exact * 10 - Math.floor(exact * 10) - 0.5)).toBeGreaterThanOrEqual(
              0.001,
            );
            expect(answer).toBe(Number(shown));
            checked += 1;
          }
          const angle = /(sin|cos|tan)⁻¹\((\d+) ÷ (\d+)\) ≈ (\d+)°$/.exec(step);
          if (angle) {
            const [, fn = '', p = '', q = '', shown = ''] = angle;
            const exact = (INVERSE[fn]?.(Number(p) / Number(q)) ?? 0) / RAD;
            expect(Number(shown), step).toBe(Math.round(exact));
            expect(Math.abs(exact - Math.floor(exact) - 0.5)).toBeGreaterThanOrEqual(0.001);
            expect(answer).toBe(Number(shown));
            checked += 1;
          }
        }
        expect(checked, `no checkable trig step in ${problem.steps.join(' | ')}`).toBe(1);
        expect(places === 0 ? Number.isInteger(answer) : true).toBe(true);
      }),
      RUNS,
    );
  });
});
