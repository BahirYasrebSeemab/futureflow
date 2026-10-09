import { formatLinear, show } from '../format';
import { rational, toText } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator, Problem } from '../types';

const nonZero = (rng: Rng, limit: number): number =>
  rng.int(1, limit) * (rng.next() < 0.5 ? -1 : 1);

/** Two x-values at least 2 apart (so the run is never 1), left to right. */
function twoXs(rng: Rng): [number, number] {
  const x1 = rng.int(-6, 4);
  return [x1, x1 + rng.int(2, 6)];
}

function slopeSteps(x1: number, y1: number, x2: number, y2: number, slopeText: string): string[] {
  const [rise, run] = [y2 - y1, x2 - x1];
  return [
    `Rise: ${y2} - ${show(y1)} = ${rise}`,
    `Run: ${x2} - ${show(x1)} = ${run}`,
    `Slope = rise ÷ run = ${show(rise)} ÷ ${run} = ${slopeText}`,
  ];
}

function interceptSteps(m: number, x: number, y: number, b: number): string[] {
  return [
    `Substitute the point into y = mx + b: ${y} = ${m} × ${show(x)} + b`,
    `b = ${y} - ${show(m * x)} = ${b}`,
    `y = ${formatLinear(m, b)}`,
  ];
}

export const linearRelationsGenerator: Generator = {
  topicId: 'linear-relations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const base = { topicId: 'linear-relations', seed, difficulty } as const;

    if (difficulty === 1) {
      const [m, b] = [nonZero(rng, 6), rng.int(-9, 9)];
      const x = rng.pick([-5, -4, -3, -2, -1, 2, 3, 4, 5, 6]); // never 0 or 1: no × 1 in the step
      const y = m * x + b;
      const problem: Problem = {
        ...base,
        prompt: `For y = ${formatLinear(m, b)}, find y when x = ${x}.`,
        answer: { type: 'number', value: rational(y) },
        hints: ['Replace x with the number, then follow the order of operations.'],
        steps: [`y = ${m} × ${show(x)} + ${show(b)} = ${y}`],
      };
      return problem;
    }

    if (difficulty <= 3) {
      const [x1, x2] = twoXs(rng);
      const run = x2 - x1;
      const rise = difficulty === 2 ? run * nonZero(rng, 4) : nonZero(rng, 9);
      const y1 = rng.int(-8, 8);
      const y2 = y1 + rise;
      const slope = rational(rise, run);
      return {
        ...base,
        prompt: `Find the slope of the line through (${x1}, ${y1}) and (${x2}, ${y2}).`,
        answer: { type: 'number', value: slope },
        hints: ['Slope = rise ÷ run = (change in y) ÷ (change in x).'],
        steps: slopeSteps(x1, y1, x2, y2, toText(slope)),
      };
    }

    const m = nonZero(rng, 5);
    const b = rng.int(-9, 9);
    const equation = { type: 'expression', text: formatLinear(m, b), maxTerms: 2 } as const;
    const hints = ['Use y = mx + b: substitute a point to find b.'];

    if (difficulty === 4) {
      const x = rng.pick([-4, -3, -2, 2, 3, 4, 5]);
      const y = m * x + b;
      return {
        ...base,
        prompt: `Find the equation of the line with slope ${m} through (${x}, ${y}), in the form y = mx + b.`,
        answer: equation,
        hints,
        steps: interceptSteps(m, x, y, b),
      };
    }

    const [x1, x2] = twoXs(rng);
    const [y1, y2] = [m * x1 + b, m * x2 + b];
    const pointX = x1 === 0 || x1 === 1 ? x2 : x1;
    return {
      ...base,
      prompt: `Find the equation of the line through (${x1}, ${y1}) and (${x2}, ${y2}), in the form y = mx + b.`,
      answer: equation,
      hints,
      steps: [
        ...slopeSteps(x1, y1, x2, y2, String(m)),
        ...interceptSteps(m, pointX, m * pointX + b, b),
      ],
    };
  },
};
