import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dataAndStatisticsGenerator } from '../src/generators/data-and-statistics';
import { factorsAndMultiplesGenerator } from '../src/generators/factors-and-multiples';
import { linearInequalitiesGenerator } from '../src/generators/linear-inequalities';
import { measurementAndGeometryGenerator } from '../src/generators/measurement-and-geometry';
import { toNumber } from '../src/rational';
import { evaluate, numberAnswer, RUNS, seedAndDifficulty } from './oracle';

/** Claims in steps that aren't plain arithmetic: each kind gets its own independent check. */
const holds = (left: number, op: string, right: number): boolean =>
  op === '<'
    ? left < right
    : op === '≤'
      ? left <= right
      : op === '>'
        ? left > right
        : left >= right;

describe('inequality steps', () => {
  it('every step is true exactly where the answer is true', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearInequalitiesGenerator.generate(seed, d);
        if (problem.answer.type !== 'inequality') throw new Error('expected an inequality');
        const bound = toNumber(problem.answer.bound);
        for (const step of problem.steps) {
          const claim = /([^:]+) ([<>≤≥]) (-?\d+)$/.exec(
            step.slice(step.lastIndexOf(': ') + 1).trim(),
          );
          if (claim === null) throw new Error(`unreadable step: ${step}`);
          const [, lhs = '', op = '', rhs = ''] = claim;
          for (const x of [bound - 0.5, bound, bound + 0.5]) {
            expect(holds(evaluate(lhs, { x }), op, Number(rhs)), step).toBe(
              holds(x, problem.answer.op, bound),
            );
          }
        }
      }),
      RUNS,
    );
  });
});

describe('circle steps', () => {
  it('the π coefficient in the step matches the radius', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const problem = measurementAndGeometryGenerator.generate(seed, 5);
        const [step = ''] = problem.steps;
        const area = /^Area = π × (\d+)² = (\d+)π$/.exec(step);
        const circumference = /^Circumference = 2 × π × (\d+) = (\d+)π$/.exec(step);
        if (area) expect(Number(area[2])).toBe(Number(area[1]) ** 2);
        else if (circumference) expect(Number(circumference[2])).toBe(2 * Number(circumference[1]));
        else throw new Error(`unexpected circle step: ${step}`);
      }),
      RUNS,
    );
  });
});

describe('sorted-list steps', () => {
  it('"Sorted:" really is the prompt data in order, and the stated middle value is the median', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = dataAndStatisticsGenerator.generate(seed, d);
        const data = (problem.prompt.split(': ')[1] ?? '').split(', ').map(Number);
        for (const step of problem.steps) {
          if (step.startsWith('Sorted: ')) {
            expect(step.slice(8).split(', ').map(Number)).toEqual([...data].sort((a, b) => a - b));
          }
          const middle = /^The middle value is (-?\d+(?:\.\d+)?)$/.exec(step);
          if (middle) expect(Number(middle[1])).toBe(numberAnswer(problem.answer));
        }
      }),
      RUNS,
    );
  });
});

describe('factor-list steps', () => {
  it('listed factors are exactly the factors, and the stated GCF is the answer', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = factorsAndMultiplesGenerator.generate(seed, d);
        for (const step of problem.steps) {
          const listed = /^Factors of (\d+): (.+)$/.exec(step);
          if (listed) {
            const n = Number(listed[1]);
            const brute = Array.from({ length: n }, (_, i) => i + 1).filter((k) => n % k === 0);
            expect((listed[2] ?? '').split(', ').map(Number)).toEqual(brute);
          }
          const largest = /^The largest shared factor is (\d+)$/.exec(step);
          if (largest) expect(Number(largest[1])).toBe(numberAnswer(problem.answer));
        }
      }),
      RUNS,
    );
  });
});
