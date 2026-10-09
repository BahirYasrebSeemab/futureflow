# mflow P2d-2: Grade 10 (MPM2D) Geometry & Trigonometry + Mixed-Difficulty Mocks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generators for the last four Grade 10 topics (analytic-geometry, similar-triangles, right-triangle-trigonometry, sine-and-cosine-laws); mock exams that mix difficulties 3–5, so gate A certifies the hard skills; and a test that every topic from L0 to L2 has a generator.

**Architecture:**

- Pure seeded generators. Trig answers are rounded as the prompt says ("to one decimal place", "to the nearest degree"), and **problems are redrawn when the exact value is within 0.001 of a rounding boundary**, so a learner's calculator result can never round the other way.
- Angles are integers in 10°–80°, excluding 30°, 45° and 60°, so no answer is accidentally exact at a half.
- The checker strips a trailing `°`/`degrees`, and length answers carry a `lengthUnit` (`cm` by default, `m` for the shadow problem), so only the asked-for unit is stripped.

**Tech Stack:** Bun, TypeScript 6, Vitest 5, fast-check, @cortex-js/compute-engine, @mflow/core.

**Spec:** `docs/superpowers/specs/2026-10-08-mflow-v1-design.md` §10.1, §10.7; ADR 0005 (the mixed-difficulty mock deferral is owned here).

## Global Constraints

- Run package scripts as `bun run --cwd packages/math-engine <script>`; tools via `bun x`.
- No `Date.now()` or `Math.random()` in `src/`; randomness only via `createRng(seed)`.
- Never print `× 1`, `÷ 1`, `- -`, `+ -`, `1x`. Negatives in numeric steps go through `show()`.
- Coverage ≥ 90%. Conventional commits under the owner's identity. **No AI attribution.**

## Review Focus

1. **A correct calculator answer near a rounding boundary:** must never be marked wrong. Pinned in Task 2 (`roundSafely`) and every trig oracle (the exact value is never within 0.001 of a half).
2. **Degree signs and units** (`36°`, `36 degrees`, `14.6 cm`, `8 m` on the m-question): correct; a wrong unit is not accepted. Pinned in Task 2.
3. **Sine law ambiguous case:** only unambiguous problems (b < a when finding ∠B). Pinned in Task 6.
4. **A mock exam built at the recommended size:** every topic appears at difficulties 3, 4 and 5. Pinned in Task 1.
5. **Every L0–L2 topic has a generator.** Pinned in Task 7.

---

### Task 1: Mixed-difficulty mock exams

**Files:** Modify `src/mock-exam.ts`, `test/mock-exam.test.ts`

**Interfaces:**

- Produces:
  - `MOCK_DIFFICULTIES: readonly Difficulty[] = [3, 4, 5]`. Problem `i` uses topic `i % n` and difficulty `MOCK_DIFFICULTIES[floor(i / n) % 3]`.
  - `recommendedMockSize(graph, level): number` (= 3 × the number of the level's topics that have generators)
  - `MOCK_DIFFICULTY` is removed.

- [ ] **Step 1: Write the failing tests (RED)**

In `packages/math-engine/test/mock-exam.test.ts`, replace the first test inside `describe('buildMockExam', …)` with:

```ts
it('covers every topic evenly, rising through difficulties 3, 4 and 5', () => {
  const registry = createRegistry([
    integersGenerator,
    fractionsGenerator,
    orderOfOperationsGenerator,
  ]);
  const exam = buildMockExam(ONTARIO_GRAPH, registry, 'L0', 42, 9);
  expect(exam.problems.map((p) => p.topicId)).toEqual([
    'integers',
    'order-of-operations',
    'fractions',
    'integers',
    'order-of-operations',
    'fractions',
    'integers',
    'order-of-operations',
    'fractions',
  ]);
  expect(exam.problems.map((p) => p.difficulty)).toEqual([3, 3, 3, 4, 4, 4, 5, 5, 5]);
});

it('recommends a size that tests every topic at every mock difficulty', () => {
  const size = recommendedMockSize(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L1');
  const exam = buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L1', 5, size);
  for (const topicId of mockTopicIds(exam)) {
    const difficulties = exam.problems
      .filter((p) => p.topicId === topicId)
      .map((p) => p.difficulty);
    expect(difficulties.sort()).toEqual([3, 4, 5]);
  }
});
```

and add `recommendedMockSize` to the `../src/mock-exam` import.

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test mock-exam`
Expected: FAIL (`recommendedMockSize` is not exported; difficulties are all 3).

- [ ] **Step 3: Implement**

In `packages/math-engine/src/mock-exam.ts`, replace `MOCK_DIFFICULTY` and the body of `buildMockExam`:

```ts
/** A mock must test the hard skills too: each round through the topics is one level harder. */
export const MOCK_DIFFICULTIES: readonly Difficulty[] = [3, 4, 5];

const levelGenerators = (
  graph: KnowledgeGraph,
  registry: GeneratorRegistry,
  level: LevelId,
): Generator[] =>
  graph.topics
    .filter((t) => t.level === level)
    .map((t) => registry.get(t.id))
    .filter((g): g is Generator => g !== undefined);

/** Enough problems for every topic at every mock difficulty. */
export const recommendedMockSize = (
  graph: KnowledgeGraph,
  registry: GeneratorRegistry,
  level: LevelId,
): number => levelGenerators(graph, registry, level).length * MOCK_DIFFICULTIES.length;

export function buildMockExam(
  graph: KnowledgeGraph,
  registry: GeneratorRegistry,
  level: LevelId,
  seed: number,
  size: number,
): MockExam {
  const generators = levelGenerators(graph, registry, level);
  if (generators.length === 0 || size <= 0) return { level, problems: [] };
  const rng = createRng(seed);
  const problems = Array.from({ length: size }, (_, i) => {
    const generator = generators[i % generators.length] as Generator;
    const difficulty = MOCK_DIFFICULTIES[
      Math.floor(i / generators.length) % MOCK_DIFFICULTIES.length
    ] as Difficulty;
    return generator.generate(rng.int(0, MAX_SEED), difficulty);
  });
  return { level, problems };
}
```

Note the new signature: `recommendedMockSize(graph, registry, level)`. The test above passes the registry.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): mix difficulties 3 to 5 in mock exams"
```

---

### Task 2: Safe rounding, degree signs, length units, trig text helpers

**Files:** Modify `src/rational.ts`, `src/check.ts`, `src/format.ts`, `test/rational.test.ts`, `test/check.test.ts`, `test/format.test.ts`

**Interfaces:**

- Produces:
  - `roundSafely(value: number, places: number): Rational | null`: the rounded value, or `null` when `value · 10^places` is within 0.001 of a half (the caller redraws)
  - Number answers gain `lengthUnit?: 'cm' | 'm'` (default `cm`). Only that unit is stripped.
  - `cleanNumber` strips a trailing `°`, `degrees` or `degree`.
  - `format.ts`: `deg(n): string` → `"35°"`; `RIGHT_ANGLE = '90°'`

- [ ] **Step 1: Write the failing tests**

Append to `packages/math-engine/test/rational.test.ts` (add `roundSafely` to the import):

```ts
describe('roundSafely', () => {
  it('rounds when the value is clearly on one side of a half', () => {
    expect(roundSafely(6.8829, 1)).toEqual(rational(69, 10));
    expect(roundSafely(36.03, 0)).toEqual(rational(36));
  });

  it('refuses values within 0.001 of a rounding boundary', () => {
    expect(roundSafely(6.8501, 1)).toBeNull();
    expect(roundSafely(36.4996, 0)).toBeNull();
  });
});
```

Append to `packages/math-engine/test/check.test.ts`:

```ts
describe('checkAnswer: degrees and length units', () => {
  it.each(['36', '36°', '36 °', '36 degrees', '36 degree'])('reads the angle %j', (given) => {
    expect(checkAnswer(num(36), given)).toBe('correct');
  });

  it('strips only the asked-for length unit', () => {
    const metres: Answer = { type: 'number', value: rational(8), lengthUnit: 'm' };
    expect(checkAnswer(metres, '8 m')).toBe('correct');
    expect(checkAnswer(metres, '8')).toBe('correct');
    expect(checkAnswer(metres, '8 cm')).not.toBe('correct');
    expect(checkAnswer(num(146, 10), '14.6 cm')).toBe('correct');
    expect(checkAnswer(num(146, 10), '14.6 m')).not.toBe('correct');
  });
});
```

Append to `packages/math-engine/test/format.test.ts` (add `deg` to the import):

```ts
describe('deg', () => {
  it('writes degrees', () => {
    expect(deg(35)).toBe('35°');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test rational check format`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `src/rational.ts`:

```ts
const BOUNDARY_MARGIN = 0.001;

/**
 * Rounds a measured value, but refuses (null) when it sits within 0.001 of a rounding boundary:
 * a learner's calculator could then legitimately round either way, so the problem is redrawn.
 */
export function roundSafely(value: number, places: number): Rational | null {
  const scaled = value * 10 ** places;
  const distanceFromHalf = Math.abs(scaled - Math.floor(scaled) - 0.5);
  return distanceFromHalf < BOUNDARY_MARGIN ? null : roundFloat(value, places);
}
```

In `src/check.ts`:

- Number variant: add `lengthUnit?: 'cm' | 'm'`.
- `cleanNumber` takes the unit: `const cleanNumber = (text: string, lengthUnit: 'cm' | 'm' = 'cm'): string =>`. Replace the cm-only unit strip with:

```ts
    .replace(new RegExp(`\\s*${lengthUnit}(?:\\^\\{?[23]\\}?|[23])?$`, 'i'), '')
    .replace(/\s*(?:°|degrees?)$/i, '')
```

- `checkNumber` gains a `lengthUnit?: 'cm' | 'm'` parameter passed to `cleanNumber`, and `checkAnswer` passes `expected.lengthUnit`.

Append to `src/format.ts`:

```ts
export const deg = (n: number): string => `${n}°`;
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS (the earlier cm-unit and `28 m` tests still pass).

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add safe rounding, degree signs and per-question length units"
```

---

### Task 3: `analytic-geometry` generator

**Files:** Create `src/generators/analytic-geometry.ts`, `test/generators-l2b.test.ts`; modify the registry and `src/index.ts`

**Interfaces:**

- Produces: `analyticGeometryGenerator` (topic `analytic-geometry`):
  - d1: `Find the midpoint of (x1, y1) and (x2, y2).` → a `point`
  - d2: `Find the length of the line segment from (x1, y1) to (x2, y2).` with a scaled Pythagorean triple → a whole number
  - d3: the same, but not a triple, `Round to one decimal place.` → `roundSafely`
  - d4: `What is the slope of a line perpendicular to y = mx + b?` (|m| in 2–6) → `-1/m`
  - d5: `Find the equation of the line parallel to y = mx + b that passes through (X, Y), in the form y = mx + b.` → an expression with `maxTerms: 2`

- [ ] **Step 1: Write the failing test**

`packages/math-engine/test/generators-l2b.test.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyticGeometryGenerator } from '../src/generators/analytic-geometry';
import { toNumber } from '../src/rational';
import { expectGeneratorContract } from './contract';
import { evaluate, numberAnswer, RUNS, seedAndDifficulty } from './oracle';

const points = (text: string): [number, number][] =>
  [...text.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);

expectGeneratorContract(analyticGeometryGenerator);

describe('analytic-geometry oracle', () => {
  it('agrees with coordinate geometry on the prompt points', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = analyticGeometryGenerator.generate(seed, d);
        const [[x1, y1] = [0, 0], [x2, y2] = [0, 0]] = points(problem.prompt);
        if (/midpoint/.test(problem.prompt)) {
          if (problem.answer.type !== 'point') throw new Error('expected a point');
          expect(problem.answer.coords.map(toNumber)).toEqual([(x1 + x2) / 2, (y1 + y2) / 2]);
        } else if (/length/.test(problem.prompt)) {
          const exact = Math.hypot(x2 - x1, y2 - y1);
          expect(Math.abs(numberAnswer(problem.answer) - exact)).toBeLessThanOrEqual(0.05 + 1e-9);
          if (!/Round/.test(problem.prompt)) expect(numberAnswer(problem.answer)).toBe(exact);
        } else if (/perpendicular/.test(problem.prompt)) {
          const m = Number(/y = (-?\d+)x/.exec(problem.prompt)?.[1]);
          expect(numberAnswer(problem.answer) * m).toBeCloseTo(-1, 9);
        } else {
          if (problem.answer.type !== 'expression') throw new Error('expected an equation');
          const m = Number(/parallel to y = (-?\d+)x/.exec(problem.prompt)?.[1]);
          const [[px, py] = [0, 0]] = points(problem.prompt);
          expect(evaluate(problem.answer.text, { x: px })).toBeCloseTo(py, 9);
          expect(
            evaluate(problem.answer.text, { x: px + 1 }) - evaluate(problem.answer.text, { x: px }),
          ).toBeCloseTo(m, 9);
        }
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l2b`
Expected: FAIL, cannot resolve the generator.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/analytic-geometry.ts`:

```ts
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
```

Notes:

- If the d3 loop never finds a safe non-perfect-square length in 50 tries (practically impossible), `value` falls back to 5 with the last drawn points. The oracle would then fail, which is the correct alarm.
- The fallback `x2 = x1 + 3, y2 = y1 + 4` keeps d2 valid if `rng.pick` ever changes.

Register after `linearSystemsGenerator`; append `export * from './generators/analytic-geometry';` to `src/index.ts`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS (the step validator checks the midpoint, rise/run, squares and √ claims).

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add analytic geometry generator"
```

---

### Task 4: `similar-triangles` generator

**Files:** Create `src/generators/similar-triangles.ts`; modify `test/generators-l2b.test.ts`, the registry and `src/index.ts`

**Interfaces:**

- Produces: `similarTrianglesGenerator` (topic `similar-triangles`):
  - d1: integer scale factor (2–3); find the longest side of the image
  - d2: scale factor in {1.5, 2.5, 3.5}; find a side
  - d3: find the scale factor from a pair of corresponding sides (a number, e.g. `2.5`)
  - d4: scale factor in {0.5, 1.5, 2.5, 0.25, 0.75}; find a side (terminating decimals)
  - d5: shadow problem in metres (`lengthUnit: 'm'`)

- [ ] **Step 1: Write the failing test**

Append to `test/generators-l2b.test.ts` (hoist the import):

```ts
import { similarTrianglesGenerator } from '../src/generators/similar-triangles';

expectGeneratorContract(similarTrianglesGenerator);

describe('similar-triangles oracle', () => {
  it('corresponding sides are in the same ratio', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = similarTrianglesGenerator.generate(seed, d);
        const n = [...problem.prompt.matchAll(/(\d+(?:\.\d+)?) c?m\b/g)].map((m) => Number(m[1]));
        const answer = numberAnswer(problem.answer);
        if (/shadow/.test(problem.prompt)) {
          const [pole = 0, poleShadow = 1, treeShadow = 0] = n;
          expect(answer / treeShadow).toBeCloseTo(pole / poleShadow, 9);
        } else if (/scale factor/.test(problem.prompt)) {
          const [smallest = 1, , , image = 0] = n;
          expect(answer).toBeCloseTo(image / smallest, 9);
        } else {
          const [, , longest = 0, image = 0] = n;
          const smallest = n[0] ?? 1;
          expect(answer / longest).toBeCloseTo(image / smallest, 9);
        }
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l2b`
Expected: FAIL, cannot resolve the generator.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/similar-triangles.ts`:

```ts
import { decimalText } from '../format';
import { mul, rational, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator, Problem } from '../types';

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
      answer: metres ? { type: 'number', value, lengthUnit: 'm' } : { type: 'number', value },
      hints: ['Similar triangles: every side is multiplied by the same scale factor.'],
      steps,
    });

    if (difficulty === 5) {
      const [pole, poleShadow, t] = [rng.int(2, 4), rng.int(2, 4), rng.int(2, 6)];
      const treeShadow = poleShadow * t;
      const tree = rational(pole * treeShadow, poleShadow);
      return make(
        `A ${pole} m pole casts a ${poleShadow} m shadow. At the same time, a tree casts a ${treeShadow} m shadow. How tall is the tree, in m?`,
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
```

The step validator checks `image ÷ a = scale` and `c × scale = longest`.

Register after `analyticGeometryGenerator`; append `export * from './generators/similar-triangles';` to `src/index.ts`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add similar triangles generator"
```

---

### Task 5: `right-triangle-trigonometry` generator

**Files:** Create `src/generators/right-triangle-trigonometry.ts`; modify `test/generators-l2b.test.ts`, the registry and `src/index.ts`

**Interfaces:**

- Produces: `rightTriangleTrigonometryGenerator` (topic `right-triangle-trigonometry`). In triangle ABC, ∠C = 90°; the angle is ∠A, an integer in 10–80 excluding 30, 45 and 60. Levels:
  - d1: opposite from the hypotenuse (sin)
  - d2: adjacent from the hypotenuse (cos)
  - d3: opposite from the adjacent (tan)
  - d4: ∠A from opposite and hypotenuse (sin⁻¹)
  - d5: ∠A from opposite and adjacent (tan⁻¹), or the hypotenuse from ∠A and the opposite
  - Sides are rounded "to one decimal place" and angles "to the nearest degree", always via `roundSafely` with a redraw.
  - Steps:
    - side questions: `opposite = 12 × sin(35°) ≈ 6.9`, or `hypotenuse = 7 ÷ sin(35°) ≈ 12.2`
    - angle questions: `∠A = sin⁻¹(7 ÷ 12) ≈ 36°`

- [ ] **Step 1: Write the failing test**

Append to `test/generators-l2b.test.ts` (hoist the import):

```ts
import { rightTriangleTrigonometryGenerator } from '../src/generators/right-triangle-trigonometry';

const RAD = Math.PI / 180;
const TRIG: Record<string, (x: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan };
const INVERSE: Record<string, (x: number) => number> = {
  sin: Math.asin,
  cos: Math.acos,
  tan: Math.atan,
};

expectGeneratorContract(rightTriangleTrigonometryGenerator);

describe('right-triangle-trigonometry oracle', () => {
  it('every trig step and the answer agree with the ratios, and nothing sits on a rounding boundary', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = rightTriangleTrigonometryGenerator.generate(seed, d);
        const answer = numberAnswer(problem.answer);
        const places = /nearest degree/.test(problem.prompt) ? 0 : 1;
        let checked = 0;
        for (const step of problem.steps) {
          const side = /(\d+) ([×÷]) (sin|cos|tan)\((\d+)°\) ≈ (\d+(?:\.\d+)?)$/.exec(step);
          if (side) {
            const [, k = '', op = '', fn = '', angle = '', shown = ''] = side;
            const exact =
              op === '×'
                ? Number(k) * (TRIG[fn]?.(Number(angle) * RAD) ?? 0)
                : Number(k) / (TRIG[fn]?.(Number(angle) * RAD) ?? 1);
            expect(Number(shown), step).toBe(Math.round(exact * 10) / 10);
            expect(Math.abs(exact * 10 - Math.floor(exact * 10) - 0.5)).toBeGreaterThanOrEqual(
              0.001,
            );
            expect(answer).toBe(Number(shown));
            checked += 1;
          }
          const angle = /(sin|cos|tan)⁻¹\((\d+) ÷ (\d+)\) ≈ (\d+)°$/.exec(step);
          if (angle) {
            const [, fn = '', p = '', q = '', shown = ''] = angle;
            const exact = (INVERSE[fn]?.(Number(p) / Number(q)) ?? 0) / RAD;
            expect(Number(shown), step).toBe(Math.round(exact));
            expect(Math.abs(exact - Math.floor(exact) - 0.5)).toBeGreaterThanOrEqual(0.001);
            expect(answer).toBe(Number(shown));
            checked += 1;
          }
        }
        expect(checked, `no checkable trig step in ${problem.steps.join(' | ')}`).toBe(1);
        expect(places === 0 ? Number.isInteger(answer) : true).toBe(true);
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l2b`
Expected: FAIL, cannot resolve the generator.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/right-triangle-trigonometry.ts`:

```ts
import { decimalText, deg } from '../format';
import { rational, roundSafely, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

const RAD = Math.PI / 180;
const MAX_TRIES = 100;

/** 10°–80° without 30°, 45°, 60°: their ratios are exact and could land on a rounding half. */
const angle = (rng: Rng): number => {
  const a = rng.int(10, 80);
  return a === 30 || a === 45 || a === 60 ? a + 1 : a;
};

type Draft = Readonly<{ prompt: string; value: Rational; steps: string[] }>;

const TO_ONE_DECIMAL = ', to one decimal place.';
const TO_NEAREST_DEGREE = ', to the nearest degree.';
const SETUP = (a: number): string => `In right triangle ABC, ∠C = 90° and ∠A = ${deg(a)}`;

function draft(rng: Rng, difficulty: number): Draft | null {
  const a = angle(rng);
  const [s1, s2] = [rng.int(3, 30), rng.int(3, 30)];
  const ratio = (fn: 'sin' | 'cos' | 'tan'): number => Math[fn](a * RAD);

  if (difficulty === 1 || difficulty === 2) {
    const fn = difficulty === 1 ? 'sin' : 'cos';
    const value = roundSafely(s1 * ratio(fn), 1);
    if (value === null) return null;
    const side = difficulty === 1 ? 'opposite' : 'adjacent to';
    return {
      prompt: `${SETUP(a)}. The hypotenuse AB = ${s1} cm. Find the side ${side} ∠A${TO_ONE_DECIMAL}`,
      value,
      steps: [
        `${fn}(A) = ${difficulty === 1 ? 'opposite' : 'adjacent'} ÷ hypotenuse`,
        `${difficulty === 1 ? 'opposite' : 'adjacent'} = ${s1} × ${fn}(${deg(a)}) ≈ ${decimalText(value)}`,
      ],
    };
  }
  if (difficulty === 3) {
    const value = roundSafely(s1 * ratio('tan'), 1);
    if (value === null) return null;
    return {
      prompt: `${SETUP(a)}. The side adjacent to ∠A is ${s1} cm. Find the side opposite ∠A${TO_ONE_DECIMAL}`,
      value,
      steps: [
        'tan(A) = opposite ÷ adjacent',
        `opposite = ${s1} × tan(${deg(a)}) ≈ ${decimalText(value)}`,
      ],
    };
  }
  if (difficulty === 4) {
    const [opposite, hypotenuse] = [Math.min(s1, s2), Math.max(s1, s2)];
    if (opposite === hypotenuse) return null;
    const value = roundSafely(Math.asin(opposite / hypotenuse) / RAD, 0);
    if (value === null) return null;
    return {
      prompt: `In right triangle ABC, ∠C = 90°, the side opposite ∠A is ${opposite} cm and the hypotenuse is ${hypotenuse} cm. Find ∠A${TO_NEAREST_DEGREE}`,
      value,
      steps: [
        'sin(A) = opposite ÷ hypotenuse',
        `∠A = sin⁻¹(${opposite} ÷ ${hypotenuse}) ≈ ${decimalText(value)}°`,
      ],
    };
  }
  if (rng.next() < 0.5) {
    const value = roundSafely(Math.atan(s1 / s2) / RAD, 0);
    if (value === null) return null;
    return {
      prompt: `In right triangle ABC, ∠C = 90°, the side opposite ∠A is ${s1} cm and the side adjacent to ∠A is ${s2} cm. Find ∠A${TO_NEAREST_DEGREE}`,
      value,
      steps: ['tan(A) = opposite ÷ adjacent', `∠A = tan⁻¹(${s1} ÷ ${s2}) ≈ ${decimalText(value)}°`],
    };
  }
  const value = roundSafely(s1 / ratio('sin'), 1);
  if (value === null) return null;
  return {
    prompt: `${SETUP(a)}. The side opposite ∠A is ${s1} cm. Find the hypotenuse${TO_ONE_DECIMAL}`,
    value,
    steps: [
      'sin(A) = opposite ÷ hypotenuse, so hypotenuse = opposite ÷ sin(A)',
      `hypotenuse = ${s1} ÷ sin(${deg(a)}) ≈ ${decimalText(value)}`,
    ],
  };
}

export const rightTriangleTrigonometryGenerator: Generator = {
  topicId: 'right-triangle-trigonometry',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    let result: Draft | null = null;
    for (let tries = 0; tries < MAX_TRIES && result === null; tries += 1)
      result = draft(rng, difficulty);
    const final = result ?? {
      prompt: `${SETUP(35)}. The hypotenuse AB = 12 cm. Find the side opposite ∠A${TO_ONE_DECIMAL}`,
      value: rational(69, 10),
      steps: ['sin(A) = opposite ÷ hypotenuse', `opposite = 12 × sin(35°) ≈ 6.9`],
    };
    return {
      topicId: 'right-triangle-trigonometry',
      seed,
      difficulty,
      prompt: final.prompt,
      answer: { type: 'number', value: final.value },
      hints: [
        'SOH CAH TOA: sin = opposite ÷ hypotenuse, cos = adjacent ÷ hypotenuse, tan = opposite ÷ adjacent.',
      ],
      steps: final.steps,
    };
  },
};
```

Note: the fallback (12 × sin 35° = 6.882…, which rounds to 6.9) is a valid, safe problem in case 100 draws all fail, which is impossible in practice.

Register after `similarTrianglesGenerator`; append `export * from './generators/right-triangle-trigonometry';`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS. If the wording test flags `× 1` (a side of exactly 1), raise the side minimum; sides start at 3.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add right-triangle trigonometry generator"
```

---

### Task 6: `sine-and-cosine-laws` generator

**Files:** Create `src/generators/sine-and-cosine-laws.ts`; modify `test/generators-l2b.test.ts`, the registry and `src/index.ts`

**Interfaces:**

- Produces: `sineAndCosineLawsGenerator` (topic `sine-and-cosine-laws`). Levels:
  - d1–2: sine law, find side b from ∠A, ∠B and a (to one decimal place)
  - d3: sine law, find acute ∠B from a, b and ∠A, **only with b < a** (unambiguous); nearest degree
  - d4: cosine law, find side a from b, c and ∠A (to one decimal place)
  - d5: cosine law, find ∠A from a, b and c (a valid triangle); nearest degree
  - Angles are integers excluding 30, 45, 60 and 90; sides are integers 4–25; `roundSafely` with a redraw.

- [ ] **Step 1: Write the failing test**

Append to `test/generators-l2b.test.ts` (hoist the import):

```ts
import { sineAndCosineLawsGenerator } from '../src/generators/sine-and-cosine-laws';

expectGeneratorContract(sineAndCosineLawsGenerator);

describe('sine-and-cosine-laws oracle', () => {
  it('the answer satisfies the sine or cosine law with the prompt values, rounded safely', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = sineAndCosineLawsGenerator.generate(seed, d);
        const v = (name: string): number =>
          Number(new RegExp(`${name} = (\\d+)`).exec(problem.prompt)?.[1]);
        const angleOf = (name: string): number =>
          Number(new RegExp(`∠${name} = (\\d+)°`).exec(problem.prompt)?.[1]) * RAD;
        const answer = numberAnswer(problem.answer);
        let exact: number;
        if (d <= 2) exact = (v('a') * Math.sin(angleOf('B'))) / Math.sin(angleOf('A'));
        else if (d === 3) {
          expect(v('b')).toBeLessThan(v('a'));
          exact = Math.asin((v('b') * Math.sin(angleOf('A'))) / v('a')) / RAD;
        } else if (d === 4)
          exact = Math.sqrt(
            v('b') ** 2 + v('c') ** 2 - 2 * v('b') * v('c') * Math.cos(angleOf('A')),
          );
        else
          exact =
            Math.acos((v('b') ** 2 + v('c') ** 2 - v('a') ** 2) / (2 * v('b') * v('c'))) / RAD;
        const scale = /nearest degree/.test(problem.prompt) ? 1 : 10;
        expect(answer).toBe(Math.round(exact * scale) / scale);
        expect(Math.abs(exact * scale - Math.floor(exact * scale) - 0.5)).toBeGreaterThanOrEqual(
          0.001,
        );
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l2b`
Expected: FAIL, cannot resolve the generator.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/sine-and-cosine-laws.ts`:

```ts
import { decimalText, deg } from '../format';
import { rational, roundSafely, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

const RAD = Math.PI / 180;
const MAX_TRIES = 100;
const SPECIAL = new Set([30, 45, 60, 90]);

const angleBetween = (rng: Rng, min: number, max: number): number => {
  const a = rng.int(min, max);
  return SPECIAL.has(a) ? a + 1 : a;
};

type Draft = Readonly<{ prompt: string; value: Rational; steps: string[] }>;

function draft(rng: Rng, difficulty: number): Draft | null {
  if (difficulty <= 2) {
    const [A, B] = [angleBetween(rng, 25, 85), angleBetween(rng, 25, 85)];
    if (A + B >= 170) return null;
    const a = rng.int(4, 25);
    const value = roundSafely((a * Math.sin(B * RAD)) / Math.sin(A * RAD), 1);
    if (value === null) return null;
    return {
      prompt: `In triangle ABC, ∠A = ${deg(A)}, ∠B = ${deg(B)} and a = ${a} cm. Find b, to one decimal place.`,
      value,
      steps: [
        `Sine law: b ÷ sin(B) = a ÷ sin(A)`,
        `b = ${a} × sin(${deg(B)}) ÷ sin(${deg(A)}) ≈ ${decimalText(value)}`,
      ],
    };
  }
  if (difficulty === 3) {
    const A = angleBetween(rng, 25, 85);
    const a = rng.int(8, 25);
    const b = rng.int(4, a - 1);
    const value = roundSafely(Math.asin((b * Math.sin(A * RAD)) / a) / RAD, 0);
    if (value === null) return null;
    return {
      prompt: `In triangle ABC, a = ${a} cm, b = ${b} cm and ∠A = ${deg(A)}. Find ∠B, to the nearest degree.`,
      value,
      steps: [
        `Sine law: sin(B) ÷ b = sin(A) ÷ a, so sin(B) = b × sin(A) ÷ a`,
        `∠B = sin⁻¹(${b} × sin(${deg(A)}) ÷ ${a}) ≈ ${decimalText(value)}° (b < a, so ∠B is acute: only one answer)`,
      ],
    };
  }
  if (difficulty === 4) {
    const A = angleBetween(rng, 20, 140);
    const [b, c] = [rng.int(4, 25), rng.int(4, 25)];
    const value = roundSafely(Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(A * RAD)), 1);
    if (value === null) return null;
    return {
      prompt: `In triangle ABC, b = ${b} cm, c = ${c} cm and ∠A = ${deg(A)}. Find a, to one decimal place.`,
      value,
      steps: [
        `Cosine law: a² = b² + c² - 2bc × cos(A)`,
        `a² = ${b}² + ${c}² - 2 × ${b} × ${c} × cos(${deg(A)})`,
        `a = √(${b * b + c * c} - ${2 * b * c} × cos(${deg(A)})) ≈ ${decimalText(value)}`,
      ],
    };
  }
  const [b, c] = [rng.int(4, 25), rng.int(4, 25)];
  const a = rng.int(Math.abs(b - c) + 1, b + c - 1);
  const value = roundSafely(Math.acos((b * b + c * c - a * a) / (2 * b * c)) / RAD, 0);
  if (value === null || SPECIAL.has(Math.round(value.num / value.den))) return null;
  return {
    prompt: `In triangle ABC, a = ${a} cm, b = ${b} cm and c = ${c} cm. Find ∠A, to the nearest degree.`,
    value,
    steps: [
      `Cosine law: cos(A) = (b² + c² - a²) ÷ 2bc`,
      `cos(A) = (${b * b} + ${c * c} - ${a * a}) ÷ ${2 * b * c}`,
      `∠A = cos⁻¹(${b * b + c * c - a * a} ÷ ${2 * b * c}) ≈ ${decimalText(value)}°`,
    ],
  };
}

export const sineAndCosineLawsGenerator: Generator = {
  topicId: 'sine-and-cosine-laws',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    let result: Draft | null = null;
    for (let tries = 0; tries < MAX_TRIES && result === null; tries += 1)
      result = draft(rng, difficulty);
    const final = result ?? {
      prompt: 'In triangle ABC, ∠A = 48°, ∠B = 65° and a = 12 cm. Find b, to one decimal place.',
      value: rational(146, 10),
      steps: ['Sine law: b ÷ sin(B) = a ÷ sin(A)', 'b = 12 × sin(65°) ÷ sin(48°) ≈ 14.6'],
    };
    return {
      topicId: 'sine-and-cosine-laws',
      seed,
      difficulty,
      prompt: final.prompt,
      answer: { type: 'number', value: final.value },
      hints: ['Sine law: a ÷ sin(A) = b ÷ sin(B). Cosine law: a² = b² + c² − 2bc·cos(A).'],
      steps: final.steps,
    };
  },
};
```

Note: the fallback (12·sin 65°/sin 48° = 14.63…, which rounds to 14.6) is a safe, valid problem. The d5 `SPECIAL` rejection avoids answers like exactly 60°, which would make the rounding-boundary check meaningless.

Register after `rightTriangleTrigonometryGenerator`; append `export * from './generators/sine-and-cosine-laws';`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add sine and cosine laws generator"
```

---

### Task 7: Full curriculum completeness, ADR, verification, learning note

- [ ] **Step 1: Write the completeness test**

Append to `test/generators-l2b.test.ts` (hoist the imports):

```ts
import { ONTARIO_GRAPH } from '../src/curriculum';
import { DEFAULT_REGISTRY } from '../src/generators/registry';

describe('curriculum completeness', () => {
  it('every topic from arithmetic to Grade 10 has a generator', () => {
    expect(ONTARIO_GRAPH.topics.map((t) => t.id).filter((id) => !DEFAULT_REGISTRY.has(id))).toEqual(
      [],
    );
  });
});
```

- [ ] **Step 2: Run it.** Run: `bun run --cwd packages/math-engine test generators-l2b`. Expected: PASS.

- [ ] **Step 3: Update ADR 0005.** Append:

```markdown
## P2d-2: geometry, trigonometry and mixed mocks

- Mock exams rise through difficulties 3 → 4 → 5 on each round through the topics; `recommendedMockSize`
  (3 × topics) tests every topic at every mock difficulty, so gate A certifies the hard MPM2D skills.
- Measured answers (trig, non-triple lengths) use `roundSafely`: a problem whose exact value is within 0.001
  of a rounding half is redrawn, so a learner's calculator can't legitimately round the other way. Angles avoid
  30°, 45°, 60° and 90°, whose ratios are exact.
- Sine-law angle problems only use the unambiguous case (b < a).
- Length answers carry `lengthUnit` (default cm; the shadow problem uses m); `°`/`degrees` is stripped.
- Every topic in `ONTARIO_GRAPH` (L0–L2) now has a generator.
```

- [ ] **Step 4: Full verification**

```bash
bun run format && bun run format:check && bun run lint && bun run typecheck && bun run coverage
grep -rn "Date.now\|Math.random" packages/math-engine/src && echo VIOLATION || echo deterministic
git log --format='%an <%ae>%n%b' | grep -i "co-authored\|claude" && echo VIOLATION || echo "authorship clean"
```

- [ ] **Step 5: Commit and write `learning/06-p2d2-grade10-geometry.md`** (not committed): midpoint and distance from Pythagoras, perpendicular slopes, similarity and scale factors, SOH CAH TOA with inverse functions, the sine/cosine laws and the ambiguous case, why problems near rounding boundaries are redrawn, and why mocks must test the hard levels. Include 6 self-check questions.

```bash
git add packages/math-engine docs/adr/0005-math-engine-design.md
git commit -m "test(math-engine): require a generator for every curriculum topic"
```
