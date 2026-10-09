import type { InequalityOp } from '../check';
import { formatLinear } from '../format';
import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator } from '../types';

const FLIP: Readonly<Record<InequalityOp, InequalityOp>> = {
  '<': '>',
  '>': '<',
  '≤': '≥',
  '≥': '≤',
};

export const linearInequalitiesGenerator: Generator = {
  topicId: 'linear-inequalities',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const boundary = rng.int(-10, 10);
    const op = rng.pick(['<', '≤', '>', '≥'] as const);
    const magnitude = difficulty === 1 ? 1 : difficulty === 2 ? rng.int(2, 5) : rng.int(2, 6);
    const a = difficulty >= 3 && rng.next() < 0.5 ? -magnitude : magnitude;
    const drawn = rng.int(-15, 15);
    const b = difficulty === 1 && drawn === 0 ? 4 : drawn;
    const c = a * boundary + b;
    const answerOp = a < 0 ? FLIP[op] : op;

    const steps = [
      b === 0
        ? null
        : `${b > 0 ? `Subtract ${b} from` : `Add ${-b} to`} both sides: ${formatLinear(a, 0)} ${op} ${c - b}`,
      a === 1
        ? null
        : a > 0
          ? `Divide both sides by ${a}: x ${op} ${boundary}`
          : `Divide both sides by ${a} and flip the sign (dividing by a negative reverses an inequality): x ${answerOp} ${boundary}`,
    ].filter((step): step is string => step !== null);

    return {
      topicId: 'linear-inequalities',
      seed,
      difficulty,
      prompt: `Solve: ${formatLinear(a, b)} ${op} ${c}`,
      answer: { type: 'inequality', variable: 'x', op: answerOp, bound: rational(boundary) },
      hints: [
        'Solve it like an equation, but if you multiply or divide by a negative number, flip the inequality sign.',
      ],
      steps: steps.length > 0 ? steps : [`x ${answerOp} ${boundary}`],
    };
  },
};
