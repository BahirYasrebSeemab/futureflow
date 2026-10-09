import { decimalText } from '../format';
import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

const TRIPLES: readonly (readonly [number, number, number])[] = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
];

export const measurementAndGeometryGenerator: Generator = {
  topicId: 'measurement-and-geometry',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const base = { topicId: 'measurement-and-geometry', seed, difficulty } as const;
    const numberProblem = (
      prompt: string,
      value: number | ReturnType<typeof rational>,
      hint: string,
      steps: string[],
    ): Problem => ({
      ...base,
      prompt,
      answer: {
        type: 'number',
        value: typeof value === 'number' ? rational(value) : value,
        quantity: /cm²/.test(prompt) ? 'area' : /cm³/.test(prompt) ? 'volume' : 'length',
      },
      hints: [hint],
      steps,
    });

    if (difficulty === 1) {
      const [l, w] = [rng.int(2, 12), rng.int(2, 12)];
      return numberProblem(
        `A rectangle is ${l} cm long and ${w} cm wide. What is its area in cm²?`,
        l * w,
        'Area of a rectangle = length × width.',
        [`Area = length × width = ${l} × ${w} = ${l * w}`],
      );
    }
    if (difficulty === 2) {
      const [b, h] = [rng.int(2, 16), rng.int(2, 16)];
      const area = rational(b * h, 2);
      return numberProblem(
        `A triangle has a base of ${b} cm and a height of ${h} cm. What is its area in cm²?`,
        area,
        'Area of a triangle = base × height ÷ 2.',
        [`Area = base × height ÷ 2 = ${b} × ${h} ÷ 2 = ${decimalText(area)}`],
      );
    }
    const [a0, b0, c0] = rng.pick(TRIPLES);
    const k = rng.int(1, 3);
    const [a, b, c] = [a0 * k, b0 * k, c0 * k];
    if (difficulty === 3) {
      return numberProblem(
        `A right triangle has legs of ${a} cm and ${b} cm. How long is the hypotenuse, in cm?`,
        c,
        'Pythagorean theorem: a² + b² = c².',
        [`${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}`, `c = √${c * c} = ${c}`],
      );
    }
    if (difficulty === 4) {
      if (rng.next() < 0.5) {
        const [l, w, h] = [rng.int(2, 12), rng.int(2, 12), rng.int(2, 12)];
        return numberProblem(
          `A rectangular prism is ${l} cm long, ${w} cm wide and ${h} cm high. What is its volume in cm³?`,
          l * w * h,
          'Volume of a prism = length × width × height.',
          [`Volume = ${l} × ${w} × ${h} = ${l * w * h}`],
        );
      }
      return numberProblem(
        `A right triangle has a hypotenuse of ${c} cm and one leg of ${a} cm. How long is the other leg, in cm?`,
        b,
        'Rearrange the Pythagorean theorem: b² = c² − a².',
        [`${c}² - ${a}² = ${c * c} - ${a * a} = ${b * b}`, `b = √${b * b} = ${b}`],
      );
    }
    const radius = rng.int(2, 12);
    const isArea = rng.next() < 0.5;
    const coefficient = isArea ? radius * radius : 2 * radius;
    return {
      ...base,
      prompt: isArea
        ? `What is the area of a circle with a radius of ${radius} cm? Give your answer in terms of π.`
        : `What is the circumference of a circle with a radius of ${radius} cm? Give your answer in terms of π.`,
      answer: { type: 'expression', text: `${coefficient}π` },
      hints: [isArea ? 'Area of a circle = πr².' : 'Circumference = 2πr.'],
      steps: isArea
        ? [`Area = π × ${radius}² = ${radius * radius}π`]
        : [`Circumference = 2 × π × ${radius} = ${2 * radius}π`],
    };
  },
};
