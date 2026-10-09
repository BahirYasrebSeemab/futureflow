import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { answerText, checkAnswer } from '../src/check';
import { gcd } from '../src/rational';
import type { Generator, Problem } from '../src/types';
import { RUNS, seedAndDifficulty } from './oracle';

const lowestTerms = (problem: Problem): boolean => {
  const { answer } = problem;
  if (answer.type === 'number') return gcd(answer.value.num, answer.value.den) === 1;
  return true;
};

/** What every generator promises, whatever its topic. */
export function expectGeneratorContract(generator: Generator): void {
  describe(`${generator.topicId} contract`, () => {
    it('is deterministic, in lowest terms, self-consistent and explained', () => {
      fc.assert(
        fc.property(seedAndDifficulty, ([seed, d]) => {
          const problem = generator.generate(seed, d);
          expect(generator.generate(seed, d)).toEqual(problem);
          expect(problem).toMatchObject({ topicId: generator.topicId, seed, difficulty: d });
          expect(lowestTerms(problem)).toBe(true);
          expect(checkAnswer(problem.answer, answerText(problem.answer))).toBe('correct');
          expect(problem.hints.length).toBeGreaterThan(0);
          expect(problem.steps.length).toBeGreaterThan(0);
        }),
        RUNS,
      );
    });
  });
}
