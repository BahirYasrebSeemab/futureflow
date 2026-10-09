import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { answerText, checkAnswer } from '../src/check';
import { ONTARIO_GRAPH } from '../src/curriculum';
import { fractionsGenerator } from '../src/generators/fractions';
import { integersGenerator } from '../src/generators/integers';
import { orderOfOperationsGenerator } from '../src/generators/order-of-operations';
import { createRegistry, DEFAULT_REGISTRY } from '../src/generators/registry';
import { gcd, toNumber } from '../src/rational';
import type { Generator } from '../src/types';
import { evaluate, promptMath, RUNS, seedAndDifficulty } from './oracle';

const numericGenerators: Generator[] = [
  integersGenerator,
  fractionsGenerator,
  orderOfOperationsGenerator,
];

describe.each(numericGenerators)('$topicId generator', (generator) => {
  it('is deterministic for a seed', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        expect(generator.generate(seed, d)).toEqual(generator.generate(seed, d));
      }),
      RUNS,
    );
  });

  it('gives an answer the CAS agrees with, in lowest terms', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = generator.generate(seed, d);
        if (problem.answer.type !== 'number') throw new Error('expected a number answer');
        expect(evaluate(promptMath(problem.prompt))).toBeCloseTo(toNumber(problem.answer.value), 9);
        expect(gcd(problem.answer.value.num, problem.answer.value.den)).toBe(1);
      }),
      RUNS,
    );
  });

  it('accepts its own canonical answer and ships hints and steps', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = generator.generate(seed, d);
        expect(checkAnswer(problem.answer, answerText(problem.answer))).toBe('correct');
        expect(problem.hints.length).toBeGreaterThan(0);
        expect(problem.steps.length).toBeGreaterThan(0);
        expect(problem).toMatchObject({ topicId: generator.topicId, seed, difficulty: d });
      }),
      RUNS,
    );
  });
});

describe('registry', () => {
  it('maps every generator to a topic in the curriculum', () => {
    const ids = new Set(ONTARIO_GRAPH.topics.map((t) => t.id));
    expect([...DEFAULT_REGISTRY.keys()].every((id) => ids.has(id))).toBe(true);
  });

  it('rejects two generators for one topic', () => {
    expect(() => createRegistry([integersGenerator, integersGenerator])).toThrow();
  });
});
