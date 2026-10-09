import { formatLinear, signed } from '../format';
import { rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

const signedBetween = (rng: Rng, min: number, max: number): number =>
  rng.int(min, max) * (rng.next() < 0.5 ? -1 : 1);

/** ax + by = c, written without 1x, + -, or 0 terms. */
const standard = (a: number, b: number, c: number): string =>
  `${formatLinear(a, 0)} ${b < 0 ? '-' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}y = ${c}`;

export const linearSystemsGenerator: Generator = {
  topicId: 'linear-systems',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const [x, y] = [rng.int(-6, 6), rng.int(-6, 6)];
    const base = {
      topicId: 'linear-systems',
      seed,
      difficulty,
      answer: { type: 'point', coords: [rational(x), rational(y)] },
    } as const;

    if (difficulty <= 2) {
      const m1 = signedBetween(rng, 1, 5);
      const drawn = signedBetween(rng, 1, 5);
      const m2 = drawn === m1 ? -m1 : drawn;
      const [b1, b2] = [y - m1 * x, y - m2 * x];
      const k = m1 - m2;
      const steps = [
        `Set the right sides equal: ${formatLinear(m1, b1)} = ${formatLinear(m2, b2)}`,
        `Collect x on the left: ${formatLinear(k, 0)} = ${b2 - b1}`,
        ...(k === 1 ? [] : [`Divide both sides by ${k}: x = ${x}`]),
        `Substitute x = ${x}: y = ${y}`,
      ];
      return {
        ...base,
        prompt: `Solve the system: y = ${formatLinear(m1, b1)} and y = ${formatLinear(m2, b2)}`,
        hints: ['Both right sides equal y, so set them equal to each other and solve for x.'],
        steps,
      };
    }

    const top = 2 + difficulty;
    let [a1, b1, a2, b2] = [1, 1, 1, -1];
    for (let tries = 0; tries < 20; tries += 1) {
      [a1, b1, a2, b2] = [
        rng.int(1, top),
        signedBetween(rng, 1, 5),
        rng.int(1, top),
        signedBetween(rng, 1, 5),
      ];
      if (a1 * b2 - a2 * b1 !== 0) break;
    }
    const [c1, c2] = [a1 * x + b1 * y, a2 * x + b2 * y];
    const coefficientY = a2 * b1 - a1 * b2;
    const rightY = a2 * c1 - a1 * c2;
    const steps = [
      ...(a2 === 1
        ? []
        : [`Multiply the first equation by ${a2}: ${standard(a1 * a2, b1 * a2, c1 * a2)}`]),
      ...(a1 === 1
        ? []
        : [`Multiply the second equation by ${a1}: ${standard(a1 * a2, b2 * a1, c2 * a1)}`]),
      `Subtract the second from the first: ${formatLinear(coefficientY, 0, 'y')} = ${rightY}`,
      ...(coefficientY === 1 ? [] : [`Divide both sides by ${coefficientY}: y = ${y}`]),
      `Substitute y = ${y} into the first equation: ${formatLinear(a1, 0)} ${signed(b1 * y)} = ${c1}`,
      ...(a1 === 1
        ? [`Simplify: x = ${x}`]
        : [
            `Simplify: ${formatLinear(a1, 0)} = ${c1 - b1 * y}`,
            `Divide both sides by ${a1}: x = ${x}`,
          ]),
    ];
    return {
      ...base,
      prompt: `Solve the system: ${standard(a1, b1, c1)} and ${standard(a2, b2, c2)}`,
      hints: [
        'Make the x-coefficients match, subtract to eliminate x, solve for y, then substitute back.',
      ],
      steps,
    };
  },
};
