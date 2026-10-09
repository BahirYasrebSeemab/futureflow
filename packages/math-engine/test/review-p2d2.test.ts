import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkAnswer, type Answer } from '../src/check';
import { ONTARIO_GRAPH } from '../src/curriculum';
import { analyticGeometryGenerator } from '../src/generators/analytic-geometry';
import { DEFAULT_REGISTRY } from '../src/generators/registry';
import { rightTriangleTrigonometryGenerator } from '../src/generators/right-triangle-trigonometry';
import { similarTrianglesGenerator } from '../src/generators/similar-triangles';
import { sineAndCosineLawsGenerator } from '../src/generators/sine-and-cosine-laws';
import { buildMockExam, gatePassed, recommendedMockSize, type MockResult } from '../src/mock-exam';
import { rational, roundSafely } from '../src/rational';
import { RUNS, seedAndDifficulty } from './oracle';

/** Review fixes for P2d-2: units, rounding margin, mock coverage, step text, degenerate problems. */

const angle: Answer = { type: 'number', value: rational(36), quantity: 'angle' };
const length: Answer = { type: 'number', value: rational(146, 10), quantity: 'length' };
const area: Answer = { type: 'number', value: rational(28), quantity: 'area' };

describe('units belong to the quantity', () => {
  it.each([
    [angle, '36°', 'correct'],
    [angle, '36 degrees', 'correct'],
    [angle, '36 cm', 'incorrect'],
    [length, '14.6 cm', 'correct'],
    [length, '14.6°', 'incorrect'],
    [length, '14.6 cm²', 'incorrect'],
    [area, '28 cm²', 'correct'],
    [area, '28 cm', 'incorrect'],
  ] as const)('%#: %j', (answer, given, outcome) => {
    expect(checkAnswer(answer, given)).toBe(outcome);
  });

  it('a plain number answer takes no unit at all', () => {
    expect(checkAnswer({ type: 'number', value: rational(25) }, '25°')).not.toBe('correct');
  });
});

describe('rounding margin is 0.05 of the last place', () => {
  it('refuses values a textbook-rounding learner could flip', () => {
    expect(roundSafely(6.8505, 1)).toBeNull();
    expect(roundSafely(6.8829, 1)).toEqual(rational(69, 10));
  });
});

describe('mock exams cover every skill variant and only full mocks count', () => {
  it('a recommended L2 mock includes every topic at difficulties 1 to 5', () => {
    const size = recommendedMockSize(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L2');
    const exam = buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L2', 11, size);
    for (const topic of ONTARIO_GRAPH.topics.filter((t) => t.level === 'L2')) {
      const seen = exam.problems.filter((p) => p.topicId === topic.id).map((p) => p.difficulty);
      expect([...seen].sort(), topic.id).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('a short mock never passes the gate, even with every topic present', () => {
    const l2 = ONTARIO_GRAPH.topics.filter((t) => t.level === 'L2').map((t) => t.id);
    const short = (day: string): MockResult => ({
      day,
      level: 'L2',
      score: 1,
      topicIds: l2,
      problemCount: l2.length,
    });
    const gateA = { id: 'A', level: 'L2', minScore: 0.75, requiredPasses: 2 } as const;
    expect(gatePassed(gateA, [short('2026-10-08'), short('2026-10-09')], ONTARIO_GRAPH)).toBe(
      false,
    );
  });
});

describe('expanded answers with a bracketed negative constant', () => {
  it('accepts y = 3x + (-5)', () => {
    expect(checkAnswer({ type: 'expression', text: '3x-5', maxTerms: 2 }, 'y = 3x + (-5)')).toBe(
      'correct',
    );
  });
});

const RAD = Math.PI / 180;
const promptValue = (prompt: string, name: string): number =>
  Number(new RegExp(`\\b${name} = (\\d+)`).exec(prompt)?.[1]);
const promptAngle = (prompt: string, name: string): number =>
  Number(new RegExp(`∠${name} = (\\d+)°`).exec(prompt)?.[1]);

describe('sine and cosine law steps use the right formula with the prompt values', () => {
  it('every law step matches the prompt and evaluates to the answer', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const p = sineAndCosineLawsGenerator.generate(seed, d);
        const text = p.steps.join(' | ');
        const shown = Number(/≈ (\d+(?:\.\d+)?)°?/.exec(text)?.[1]);
        if (d <= 2) {
          const m = /b = (\d+) × sin\((\d+)°\) ÷ sin\((\d+)°\)/.exec(text);
          expect(m, text).not.toBeNull();
          expect([Number(m?.[1]), Number(m?.[2]), Number(m?.[3])]).toEqual([
            promptValue(p.prompt, 'a'),
            promptAngle(p.prompt, 'B'),
            promptAngle(p.prompt, 'A'),
          ]);
          expect(shown).toBe(
            Math.round(
              ((Number(m?.[1]) * Math.sin(Number(m?.[2]) * RAD)) / Math.sin(Number(m?.[3]) * RAD)) *
                10,
            ) / 10,
          );
        } else if (d === 4) {
          const [b, c] = [promptValue(p.prompt, 'b'), promptValue(p.prompt, 'c')];
          const m = /√\((\d+) - (\d+) × cos\((\d+)°\)\)/.exec(text);
          expect([Number(m?.[1]), Number(m?.[2]), Number(m?.[3])], text).toEqual([
            b * b + c * c,
            2 * b * c,
            promptAngle(p.prompt, 'A'),
          ]);
        } else if (d === 5) {
          const [a, b, c] = [
            promptValue(p.prompt, 'a'),
            promptValue(p.prompt, 'b'),
            promptValue(p.prompt, 'c'),
          ];
          const m = /cos\(A\) = \((\d+) \+ (\d+) - (\d+)\) ÷ \((\d+)\)/.exec(text);
          expect([Number(m?.[1]), Number(m?.[2]), Number(m?.[3]), Number(m?.[4])], text).toEqual([
            b * b,
            c * c,
            a * a,
            2 * b * c,
          ]);
        }
      }),
      RUNS,
    );
  });
});

describe('similar triangles: valid triangles and the asked unit', () => {
  it('ABC satisfies the triangle inequality, and the shadow answer is in metres', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const p = similarTrianglesGenerator.generate(seed, d);
        if (/shadow/.test(p.prompt)) {
          expect(p.answer).toMatchObject({ lengthUnit: 'm' });
          expect(p.prompt).not.toMatch(/ a 8| a 11| a 18/);
          return;
        }
        const [a = 0, b = 0, c = 0] = [...p.prompt.matchAll(/(\d+) cm/g)].map((m) => Number(m[1]));
        expect(a + b).toBeGreaterThan(c);
      }),
      RUNS,
    );
  });
});

describe('one-decimal answers are displayed with one decimal', () => {
  it('steps never show "≈ 9" for a "to one decimal place" question', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        for (const g of [
          rightTriangleTrigonometryGenerator,
          sineAndCosineLawsGenerator,
          analyticGeometryGenerator,
        ]) {
          const p = g.generate(seed, d);
          if (!/one decimal place/.test(p.prompt)) continue;
          expect(p.steps.join(' | '), p.prompt).toMatch(/≈ \d+\.\d(?!\d)/);
        }
      }),
      RUNS,
    );
  });
});

describe('degenerate geometry is redrawn', () => {
  it('a parallel line never passes through the given line, and a midpoint never uses one point twice', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const parallel = analyticGeometryGenerator.generate(seed, 5);
        const m =
          /parallel to y = (-?\d+)x(?: ([+-]) (\d+))? that passes through \((-?\d+), (-?\d+)\)/.exec(
            parallel.prompt,
          );
        const [slope, sign, b, px, py] = [
          Number(m?.[1]),
          m?.[2],
          Number(m?.[3] ?? 0),
          Number(m?.[4]),
          Number(m?.[5]),
        ];
        expect(py).not.toBe(slope * px + (sign === '-' ? -b : b));
        const mid = analyticGeometryGenerator.generate(seed, 1);
        const pts = [...mid.prompt.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((x) => x[0]);
        expect(pts[0]).not.toBe(pts[1]);
      }),
      RUNS,
    );
  });

  it('the cosine-law angle step brackets 2bc', () => {
    const p = sineAndCosineLawsGenerator.generate(3, 5);
    expect(p.steps.join(' ')).toMatch(/÷ \(2bc\)/);
  });
});
