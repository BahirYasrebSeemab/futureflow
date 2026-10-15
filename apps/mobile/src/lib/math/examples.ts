import { DEFAULT_REGISTRY, type Problem } from './engine';

/** Worked and faded examples are easy problems of the topic (spec §10.5). */
const EXAMPLE_DIFFICULTY = 1;

export function exampleProblem(topicId: string, seed: number): Problem {
  const generator = DEFAULT_REGISTRY.get(topicId);
  if (generator === undefined) throw new Error(`no generator for ${topicId}`);
  return generator.generate(seed, EXAMPLE_DIFFICULTY);
}

const MAX_DRAWS = 20;

/**
 * A worked and a faded example that differ from each other and from the practice problem waiting
 * behind them: easy levels have few distinct problems, so seeds alone don't guarantee that.
 */
export function pickExamples(
  topicId: string,
  practicePrompt: string,
  nextSeed: () => number,
): { worked: Problem; faded: Problem } {
  const draw = (avoid: readonly string[]): Problem => {
    let problem = exampleProblem(topicId, nextSeed());
    for (let i = 1; i < MAX_DRAWS && avoid.includes(problem.prompt); i++) {
      problem = exampleProblem(topicId, nextSeed());
    }
    return problem;
  };
  const worked = draw([practicePrompt]);
  const faded = draw([practicePrompt, worked.prompt]);
  return { worked, faded };
}

/** A faded example shows the worked steps but the last: that one is the learner's to finish. */
export function fadedSteps(steps: readonly string[]): { shown: string[]; hidden: number } {
  if (steps.length === 0) return { shown: [], hidden: 0 };
  return { shown: steps.slice(0, steps.length - 1), hidden: 1 };
}
