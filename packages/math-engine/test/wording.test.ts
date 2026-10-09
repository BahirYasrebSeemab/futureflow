import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_REGISTRY } from '../src/generators/registry';
import { RUNS, seedAndDifficulty } from './oracle';

/** Text a textbook would never print: the steps are the lesson, so they must read cleanly. */
const AWKWARD = [
  /- -/, // minus a negative
  /\+ -/, // plus a negative
  /Subtract -/, // should be "Add"
  /Subtract 0\b/, // a pointless step
  /(?<![\d.])1x/, // "1x" instead of "x"
  /by 1:/, // dividing by 1
  /÷ 1(?![\d.])/, // dividing by one
  /× 1(?![\d.])/, // multiplying by one
];

describe.each([...DEFAULT_REGISTRY.values()])('$topicId wording', (generator) => {
  it('never prints awkward arithmetic in prompts or steps', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = generator.generate(seed, d);
        for (const line of [problem.prompt, ...problem.steps]) {
          for (const pattern of AWKWARD) expect(line).not.toMatch(pattern);
        }
      }),
      RUNS,
    );
  });
});

describe('fractions prompt', () => {
  it('does not promise a simplification the checker does not require', () => {
    const problem = DEFAULT_REGISTRY.get('fractions')?.generate(1, 1);
    expect(problem?.prompt).not.toMatch(/simplify/i);
  });
});

describe('integers hint', () => {
  it('matches the operation in the prompt', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = DEFAULT_REGISTRY.get('integers')?.generate(seed, d);
        if (problem === undefined) throw new Error('integers generator missing');
        const isAddition = / \+ /.test(problem.prompt);
        expect(problem.hints.join(' ')).not.toMatch(
          isAddition ? /Subtracting/ : /Adding a negative/,
        );
      }),
      RUNS,
    );
  });
});
