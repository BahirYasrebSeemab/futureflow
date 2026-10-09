import { decimalText } from '../format';
import { mul, rational, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator, Problem } from '../types';

/** "an 8", "an 11", "an 18": the article follows the spoken number. */
const article = (n: number): string => (/^(8|11|18)/.test(String(n)) ? 'an' : 'a');

const SCALES: Readonly<Record<number, readonly Rational[]>> = {
  1: [rational(2), rational(3)],
  2: [rational(3, 2), rational(5, 2), rational(7, 2)],
  3: [rational(3, 2), rational(2), rational(5, 2), rational(3)],
  4: [rational(1, 2), rational(3, 2), rational(5, 2), rational(1, 4), rational(3, 4)],
};

/** Three different whole-number sides that make a real triangle, sorted. */
function sides(rng: Rng): [number, number, number] {
  const a = rng.int(3, 8);
  const b = a + rng.int(1, 4);
  const c = b + rng.int(1, a - 1);
  return [a, b, c];
}

export const similarTrianglesGenerator: Generator = {
  topicId: 'similar-triangles',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const make = (prompt: string, value: Rational, steps: string[], metres = false): Problem => ({
      topicId: 'similar-triangles',
      seed,
      difficulty,
      prompt,
      answer: metres
        ? { type: 'number', value, lengthUnit: 'm', quantity: 'length' }
        : { type: 'number', value, quantity: 'length' },
      hints: ['Similar triangles: every side is multiplied by the same scale factor.'],
      steps,
    });

    if (difficulty === 5) {
      const [pole, poleShadow, t] = [rng.int(2, 4), rng.int(2, 4), rng.int(2, 6)];
      const treeShadow = poleShadow * t;
      const tree = rational(pole * treeShadow, poleShadow);
      return make(
        `A ${pole} m pole casts a ${poleShadow} m shadow. At the same time, a tree casts ${article(treeShadow)} ${treeShadow} m shadow. How tall is the tree, in m?`,
        tree,
        [
          `The sun makes similar triangles: height ÷ shadow is the same`,
          `Tree: ${treeShadow} × ${pole} ÷ ${poleShadow} = ${decimalText(tree)}`,
        ],
        true,
      );
    }

    const [a, b, c] = sides(rng);
    const scale = rng.pick(SCALES[difficulty] ?? SCALES[1] ?? []);
    const [image, longest] = [mul(rational(a), scale), mul(rational(c), scale)];
    const [scaleText, imageText] = [decimalText(scale), decimalText(image)];

    if (difficulty === 3) {
      return make(
        `Triangle ABC has sides ${a} cm, ${b} cm and ${c} cm. A similar triangle DEF has a shortest side of ${imageText} cm. What is the scale factor from ABC to DEF?`,
        scale,
        [`Scale factor = ${imageText} ÷ ${a} = ${scaleText}`],
      );
    }
    return make(
      `Triangle ABC has sides ${a} cm, ${b} cm and ${c} cm. A similar triangle DEF has a shortest side of ${imageText} cm. How long is the longest side of DEF, in cm?`,
      longest,
      [
        `Scale factor = ${imageText} ÷ ${a} = ${scaleText}`,
        `Longest side = ${c} × ${scaleText} = ${decimalText(longest)}`,
      ],
    );
  },
};
