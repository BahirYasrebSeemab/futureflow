import { add, lcm, rational, toText } from '../rational';
import { createRng } from '../rng';
import type { Generator } from '../types';

export const fractionsGenerator: Generator = {
  topicId: 'fractions',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const maxDen = 3 + 2 * difficulty;
    const b = rng.int(2, maxDen);
    const d = rng.int(2, maxDen);
    const a = rng.int(1, b - 1);
    const c = rng.int(1, d - 1);
    const op = rng.pick(['+', '-'] as const);
    const value = add(rational(a, b), rational(op === '+' ? c : -c, d));
    const common = lcm(b, d);
    const left = (a * common) / b;
    const right = (c * common) / d;
    const combined = op === '+' ? left + right : left - right;
    return {
      topicId: 'fractions',
      seed,
      difficulty,
      prompt: `Calculate: ${a}/${b} ${op} ${c}/${d}`,
      answer: { type: 'number', value },
      hints: [
        'Rewrite both fractions with the same denominator first.',
        `A common denominator of ${b} and ${d} is ${common}.`,
      ],
      steps: [
        `Rewrite with the common denominator ${common}: ${a}/${b} = ${left}/${common} and ${c}/${d} = ${right}/${common}`,
        `${left}/${common} ${op} ${right}/${common} = ${combined}/${common}`,
        ...(toText(value) === `${combined}/${common}`
          ? []
          : [`Simplify: ${combined}/${common} = ${toText(value)}`]),
      ],
    };
  },
};
