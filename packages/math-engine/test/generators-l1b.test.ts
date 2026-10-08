import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { linearInequalitiesGenerator } from '../src/generators/linear-inequalities';
import { toNumber } from '../src/rational';
import { expectGeneratorContract } from './contract';
import { evaluate, RUNS, seedAndDifficulty } from './oracle';

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
