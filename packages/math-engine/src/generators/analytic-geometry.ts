import { decimalText, formatLinear, show } from '../format';
import { rational, roundSafely, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

const TRIPLES: readonly (readonly [number, number, number])[] = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [6, 8, 10],
];
const MAX_TRIES = 50;
const signed = (rng: Rng, n: number): number => (rng.next() < 0.5 ? -n : n);
const nonZero = (rng: Rng, limit: number): number => signed(rng, rng.int(1, limit));

function lengthSteps(x1: number, y1: number, x2: number, y2: number): string[] {
  const [dx, dy] = [x2 - x1, y2 - y1];
  return [
    `Run: ${x2} - ${show(x1)} = ${dx}`,
    `Rise: ${y2} - ${show(y1)} = ${dy}`,
    `${show(dx)}² + ${show(dy)}² = ${dx * dx} + ${dy * dy} = ${dx * dx + dy * dy}`,
  ];
}

export const analyticGeometryGenerator: Generator = {
  topicId: 'analytic-geometry',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const base = { topicId: 'analytic-geometry', seed, difficulty } as const;
    const [x1, y1] = [rng.int(-8, 8), rng.int(-8, 8)];

    if (difficulty === 1) {
      const [x2, y2] = [rng.int(-8, 8), rng.int(-8, 8)];
      const [mx, my] = [rational(x1 + x2, 2), rational(y1 + y2, 2)];
      return {
        ...base,
        prompt: `Find the midpoint of (${x1}, ${y1}) and (${x2}, ${y2}).`,
        answer: { type: 'point', coords: [mx, my] },
        hints: ['Midpoint = (average of the x-values, average of the y-values).'],
        steps: [
          `x: ${show(x1)} + ${show(x2)} = ${x1 + x2}, and ${x1 + x2} ÷ 2 = ${decimalText(mx)}`,
          `y: ${show(y1)} + ${show(y2)} = ${y1 + y2}, and ${y1 + y2} ÷ 2 = ${decimalText(my)}`,
          `Midpoint: (${decimalText(mx)}, ${decimalText(my)})`,
        ],
      };
    }

    if (difficulty <= 3) {
      let x2 = x1 + 3;
      let y2 = y1 + 4;
      let answer: Rational | null = rational(5);
      for (let tries = 0; tries < MAX_TRIES; tries += 1) {
        if (difficulty === 2) {
          const [a, b] = rng.pick(TRIPLES);
          [x2, y2] = [x1 + signed(rng, a), y1 + signed(rng, b)];
          answer = rational(Math.hypot(a, b));
          break;
        }
        [x2, y2] = [x1 + nonZero(rng, 9), y1 + nonZero(rng, 9)];
        const squared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        const root = Math.round(Math.sqrt(squared));
        answer = root * root === squared ? null : roundSafely(Math.sqrt(squared), 1);
        if (answer !== null) break;
      }
      const value = answer ?? rational(5);
      const squared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      const rounded = difficulty === 3;
      return {
        ...base,
        prompt: `Find the length of the line segment from (${x1}, ${y1}) to (${x2}, ${y2}).${rounded ? ' Round to one decimal place.' : ''}`,
        answer: { type: 'number', value },
        hints: ['Length = √((change in x)² + (change in y)²).'],
        steps: [
          ...lengthSteps(x1, y1, x2, y2),
          rounded
            ? `Length = √${squared} ≈ ${decimalText(value)}`
            : `Length = √${squared} = ${decimalText(value)}`,
        ],
      };
    }

    const m = signed(rng, rng.int(2, 6));
    const b = rng.int(-9, 9);
    if (difficulty === 4) {
      const perpendicular = rational(-1, m);
      return {
        ...base,
        prompt: `What is the slope of a line perpendicular to y = ${formatLinear(m, b)}?`,
        answer: { type: 'number', value: perpendicular },
        hints: ['Perpendicular slopes are negative reciprocals: their product is -1.'],
        steps: [
          `The given slope is ${m}`,
          `Negative reciprocal: -1 ÷ ${show(m)} = ${perpendicular.num}/${perpendicular.den}`,
        ],
      };
    }
    const [px, py] = [rng.pick([-5, -4, -3, -2, 2, 3, 4, 5]), rng.int(-9, 9)];
    const intercept = py - m * px;
    return {
      ...base,
      prompt: `Find the equation of the line parallel to y = ${formatLinear(m, b)} that passes through (${px}, ${py}), in the form y = mx + b.`,
      answer: { type: 'expression', text: formatLinear(m, intercept), maxTerms: 2 },
      hints: ['Parallel lines have the same slope; substitute the point to find b.'],
      steps: [
        `Parallel lines have equal slopes, so m = ${m}`,
        `Substitute (${px}, ${py}): ${py} = ${m} × ${show(px)} + b`,
        `b = ${py} - ${show(m * px)} = ${intercept}`,
        `y = ${formatLinear(m, intercept)}`,
      ],
    };
  },
};
