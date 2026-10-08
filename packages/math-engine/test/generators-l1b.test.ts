import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { linearInequalitiesGenerator } from '../src/generators/linear-inequalities';
import { toNumber } from '../src/rational';
import { expectGeneratorContract } from './contract';
import { evaluate, numberAnswer, promptMath, RUNS, seedAndDifficulty } from './oracle';
import { linearRelationsGenerator } from '../src/generators/linear-relations';
import { exponentLawsGenerator } from '../src/generators/exponent-laws';
import { measurementAndGeometryGenerator } from '../src/generators/measurement-and-geometry';
import { dataAndStatisticsGenerator } from '../src/generators/data-and-statistics';

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

expectGeneratorContract(measurementAndGeometryGenerator);

describe('measurement-and-geometry oracle', () => {
  it('agrees with the formulas applied to the numbers in the prompt', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = measurementAndGeometryGenerator.generate(seed, d);
        const n = [...problem.prompt.matchAll(/(\d+) cm/g)].map((m) => Number(m[1]));
        const [p = 0, q = 0, r = 0] = n;
        const text = problem.prompt;
        const expected = /rectangle/.test(text)
          ? p * q
          : /triangle has a base/.test(text)
            ? (p * q) / 2
            : /legs of/.test(text)
              ? Math.hypot(p, q)
              : /hypotenuse of/.test(text)
                ? Math.sqrt(p * p - q * q)
                : /prism/.test(text)
                  ? p * q * r
                  : /area of a circle/.test(text)
                    ? Math.PI * p * p
                    : 2 * Math.PI * p;
        const value =
          problem.answer.type === 'expression'
            ? evaluate(problem.answer.text.replace('π', '\\pi'))
            : numberAnswer(problem.answer);
        expect(value).toBeCloseTo(expected, 6);
      }),
      RUNS,
    );
  });
});

expectGeneratorContract(dataAndStatisticsGenerator);

describe('data-and-statistics oracle', () => {
  it('agrees with an independent computation on the listed data', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = dataAndStatisticsGenerator.generate(seed, d);
        const match = /^Find the (\w+) of: (.+)$/.exec(problem.prompt);
        if (match === null) throw new Error(`unexpected prompt: ${problem.prompt}`);
        const [, stat = '', list = ''] = match;
        const values = list.split(', ').map(Number);
        const sorted = [...values].sort((x, y) => x - y);
        const mid = sorted.length / 2;
        const counts = new Map<number, number>();
        for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
        const top = Math.max(...counts.values());
        const modes = [...counts].filter(([, c]) => c === top).map(([v]) => v);
        const expected: Record<string, number> = {
          mean: values.reduce((s, v) => s + v, 0) / values.length,
          median:
            sorted.length % 2 === 1
              ? (sorted[Math.floor(mid)] ?? 0)
              : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2,
          mode: modes.length === 1 ? (modes[0] ?? 0) : Number.NaN,
          range: (sorted.at(-1) ?? 0) - (sorted[0] ?? 0),
        };
        expect(numberAnswer(problem.answer)).toBeCloseTo(expected[stat] ?? Number.NaN, 9);
      }),
      RUNS,
    );
  });
});
