import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_REGISTRY } from '../src/generators/registry';
import { RUNS, seedAndDifficulty } from './oracle';
import { stepEquations } from './steps';

const validity = (step: string): boolean[] => stepEquations(step).map((e) => e.valid);

describe('stepEquations', () => {
  it.each([
    ['Brackets first: 3 + 4 = 7', [true]],
    ['LCM = 6 × 4 ÷ 2 = 12', [true]],
    ['8 + 81 - 4 = 85', [true]],
    ['2 + 3 × 4 = 14', [true]],
    ['(-3) × (5) = -15', [true]],
    ['4 - (-3) = 7', [true]],
    ['3/4 + 1/2 = 5/4', [true]],
    ['0.25 × 100 = 25%', [true]],
    ['150 ÷ 3 = 50 km per hour', [true]],
    ['50/100 × 8 = 4', [true]],
    ['Count the decimal places: 1 + 1 = 2, so the answer is 19.14', [true]],
    ['34 × 200 = 6800; 7582 - 6800 = 782', [true, true]],
    ['x = 56 ÷ 2 = 28', [true]],
    ['2³ = 8', [true]],
    ['√16 = 4, because 4² = 16', [true, true]],
    ['A = 2000 × 1.05^3 = 2315.25', [true]],
    ['(-3) - (5) = (-3) + (-5)', [true]],
    ['3/4 + 1/2 = 6/8 + 4/8', [true]],
    ['7² + 24² = 49 + 576 = 625', [true]],
    ['Rewrite: 3/4 = 15/20 and 1/5 = 4/20', [true, true]],
    ['So 3 + 4 = 7.', [true]],
  ])('validates %j', (step, expected) => {
    expect(validity(step)).toEqual(expected);
  });

  it.each([
    ['34 × 20 = 690', [false]],
    ['2 + 3 × 4 = 20', [false]],
    ['7582 - 6800 = 728', [false]],
    ['3² = 8', [false]],
    ['√50 = 7', [false]],
    ['1.05^2 = 1.1', [false]],
    ['3/4 + 1/2 = 6/8 + 3/8', [false]],
    ['7² + 24² = 49 + 576 = 624', [false]],
    ['So 3 + 4 = 8.', [false]],
  ])('catches the wrong arithmetic in %j', (step, expected) => {
    expect(validity(step)).toEqual(expected);
  });

  it.each([
    'Subtract 4 from both sides: 3x = 11',
    '50% = 50/100',
    'Factors of 12: 1, 2, 3, 4, 6, 12',
    'Cross-multiply: 2 × x = 7 × 8',
  ])('ignores %j (not a plain numeric equation)', (step) => {
    expect(stepEquations(step)).toEqual([]);
  });
});

describe('every generator', () => {
  const generators = [...DEFAULT_REGISTRY.values()];

  it.each(generators.map((g) => [g.topicId, g] as const))(
    '%s: all step arithmetic is correct',
    (_id, generator) => {
      fc.assert(
        fc.property(seedAndDifficulty, ([seed, d]) => {
          for (const step of generator.generate(seed, d).steps) {
            for (const equation of stepEquations(step)) {
              expect(equation, `${step}`).toMatchObject({ valid: true });
            }
          }
        }),
        RUNS,
      );
    },
  );

  it('actually finds equations to check (the validator is not vacuous)', () => {
    const found = generators.flatMap((g) =>
      [1, 2, 3, 4, 5].flatMap((d) =>
        g.generate(d * 7919, d as 1 | 2 | 3 | 4 | 5).steps.flatMap(stepEquations),
      ),
    );
    expect(found.length).toBeGreaterThan(20);
  });
});

describe('fractions steps', () => {
  it('always include a checkable equation', () => {
    const fractions = DEFAULT_REGISTRY.get('fractions');
    if (fractions === undefined) throw new Error('fractions generator missing');
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        expect(fractions.generate(seed, d).steps.flatMap(stepEquations).length).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });
});

describe('stepEquations: not every "a = b" is a claim', () => {
  it('ignores "35% of 65 = 22.75"', () => {
    expect(stepEquations('35% of 65 = 22.75')).toEqual([]);
  });
});
