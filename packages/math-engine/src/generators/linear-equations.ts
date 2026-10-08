import { formatLinear } from '../format';
import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator } from '../types';

/** "Subtract 4 from both sides" or "Add 4 to both sides"; null when there is nothing to remove. */
const removeConstant = (b: number): string | null => {
  if (b === 0) return null;
  return b > 0 ? `Subtract ${b} from both sides` : `Add ${-b} to both sides`;
};

/** Steps from `k·x + b = rhs` to `x = solution`, skipping steps that do nothing. */
function isolate(k: number, b: number, rhs: number, x: number): string[] {
  const remove = removeConstant(b);
  const steps = [
    remove === null ? null : `${remove}: ${formatLinear(k, 0)} = ${rhs - b}`,
    k === 1 ? null : `Divide both sides by ${k}: x = ${x}`,
  ].filter((step): step is string => step !== null);
  return steps.length > 0 ? steps : [`x = ${x}`];
}

export const linearEquationsGenerator: Generator = {
  topicId: 'linear-equations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const nonZero = (limit: number): number => rng.int(1, limit) * (rng.next() < 0.5 ? -1 : 1);
    const x = rng.int(-10, 10);
    const b = rng.int(-15, 15);
    const base = {
      topicId: 'linear-equations',
      seed,
      difficulty,
      answer: { type: 'number', value: rational(x) },
      hints: ['Do the same thing to both sides until x is alone.'],
    } as const;

    if (difficulty < 4) {
      const a = difficulty === 1 ? rng.int(2, 5) : nonZero(4 + difficulty);
      const c = a * x + b;
      return {
        ...base,
        prompt: `Solve for x: ${formatLinear(a, b)} = ${c}`,
        steps: isolate(a, b, c, x),
      };
    }

    const a = nonZero(6);
    const drawn = nonZero(6);
    const e = drawn === a ? -a : drawn;
    const f = (a - e) * x + b;
    const k = a - e;
    return {
      ...base,
      prompt: `Solve for x: ${formatLinear(a, b)} = ${formatLinear(e, f)}`,
      steps: [`Move the x terms to the left: ${formatLinear(k, b)} = ${f}`, ...isolate(k, b, f, x)],
    };
  },
};
