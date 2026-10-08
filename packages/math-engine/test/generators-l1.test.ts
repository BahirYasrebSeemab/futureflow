import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { answerText, checkAnswer, countTerms } from '../src/check';
import { algebraicExpressionsGenerator } from '../src/generators/algebraic-expressions';
import { linearEquationsGenerator } from '../src/generators/linear-equations';
import { ONTARIO_GRAPH } from '../src/curriculum';
import { DEFAULT_REGISTRY } from '../src/generators/registry';
import { toNumber } from '../src/rational';
import { evaluate, identicallyEqual, promptMath, RUNS, seedAndDifficulty } from './oracle';

describe('algebraic-expressions generator', () => {
  it('answer is identical to the prompt and in simplified form', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = algebraicExpressionsGenerator.generate(seed, d);
        if (problem.answer.type !== 'expression') throw new Error('expected an expression');
        expect(identicallyEqual(promptMath(problem.prompt), problem.answer.text)).toBe(true);
        expect(countTerms(problem.answer.text)).toBeLessThanOrEqual(2);
        expect(problem.answer.text).not.toContain('(');
      }),
      RUNS,
    );
  });

  it('rejects the unsimplified prompt itself as an answer', () => {
    const problem = algebraicExpressionsGenerator.generate(12345, 3);
    expect(checkAnswer(problem.answer, promptMath(problem.prompt))).toBe('incorrect');
  });

  it('is deterministic and accepts its own canonical answer', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = algebraicExpressionsGenerator.generate(seed, d);
        expect(algebraicExpressionsGenerator.generate(seed, d)).toEqual(problem);
        expect(checkAnswer(problem.answer, answerText(problem.answer))).toBe('correct');
      }),
      RUNS,
    );
  });
});

describe('linear-equations generator', () => {
  it('answer satisfies the equation', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearEquationsGenerator.generate(seed, d);
        if (problem.answer.type !== 'number') throw new Error('expected a number');
        const [lhs = '', rhs = ''] = promptMath(problem.prompt).split('=');
        const x = toNumber(problem.answer.value);
        expect(evaluate(lhs, { x })).toBeCloseTo(evaluate(rhs, { x }), 9);
        expect(Number.isInteger(x)).toBe(true);
      }),
      RUNS,
    );
  });

  it('puts x on both sides from difficulty 4', () => {
    const problem = linearEquationsGenerator.generate(7, 4);
    const [, rhs = ''] = promptMath(problem.prompt).split('=');
    expect(rhs).toContain('x');
  });

  it('is deterministic and accepts "x = answer"', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearEquationsGenerator.generate(seed, d);
        expect(linearEquationsGenerator.generate(seed, d)).toEqual(problem);
        expect(checkAnswer(problem.answer, `x = ${answerText(problem.answer)}`)).toBe('correct');
      }),
      RUNS,
    );
  });
});

describe('registry', () => {
  it('includes the L1 generators', () => {
    expect(DEFAULT_REGISTRY.has('algebraic-expressions')).toBe(true);
    expect(DEFAULT_REGISTRY.has('linear-equations')).toBe(true);
  });
});

describe('symbolic steps', () => {
  const afterLabel = (step: string): string => {
    const colon = step.lastIndexOf(': ');
    return colon < 0 ? step : step.slice(colon + 2);
  };

  it('every algebraic-expressions step equals the original expression', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = algebraicExpressionsGenerator.generate(seed, d);
        for (const step of problem.steps) {
          for (const x of [1.3, -0.7, 2.9]) {
            expect(evaluate(afterLabel(step), { x }), step).toBeCloseTo(
              evaluate(promptMath(problem.prompt), { x }),
              9,
            );
          }
        }
      }),
      RUNS,
    );
  });

  it('every linear-equations step is still true at the answer', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearEquationsGenerator.generate(seed, d);
        if (problem.answer.type !== 'number') throw new Error('expected a number');
        const x = toNumber(problem.answer.value);
        for (const step of problem.steps) {
          const [lhs = '', rhs = ''] = afterLabel(step).split('=');
          expect(evaluate(lhs, { x }), step).toBeCloseTo(evaluate(rhs, { x }), 9);
        }
      }),
      RUNS,
    );
  });
});

describe('L1 completeness', () => {
  it('has a generator for every L1 topic', () => {
    const l1 = ONTARIO_GRAPH.topics.filter((t) => t.level === 'L1').map((t) => t.id);
    expect(l1.filter((id) => !DEFAULT_REGISTRY.has(id))).toEqual([]);
  });
});
