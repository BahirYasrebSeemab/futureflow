# mflow P2d-1: Grade 10 (MPM2D) Algebra Generators + Gate Coverage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generators for the five algebra topics of Grade 10 (polynomial-operations, factoring, quadratic-equations, quadratic-relations, linear-systems), the answer forms they need, and a gate rule: a mock exam only counts toward a gate if it covered every topic of the level.

**Architecture:**

- Pure seeded generators in `packages/math-engine/src/generators/`.
- New format helper `formatPolynomial` and checker form `factored`, plus `roundFloat` for irrational roots rounded as the prompt asks.
- Every generator gets the shared contract, an independent oracle, the registry-wide wording and step validators, and symbolic step checks: every algebra step must stay equivalent to the problem, or true at the solution.

**Tech Stack:** Bun, TypeScript 6, Vitest 5, fast-check, @cortex-js/compute-engine, @mflow/core.

**Spec:** `docs/superpowers/specs/2026-10-08-mflow-v1-design.md` §10.1, §10.7, §15 (P2d); ADR 0005 (the "gate coverage" deferral is owned here). Geometry and trigonometry (analytic geometry, similar triangles, trig, sine/cosine laws) follow in **P2d-2**.

## Global Constraints

- Run package scripts as `bun run --cwd packages/math-engine <script>`; tools via `bun x`.
- No `Date.now()` or `Math.random()` in `src/`; randomness only via `createRng(seed)`.
- Build problems backwards (the answer first). Never print `× 1`, `÷ 1`, `- -`, `+ -`, `1x`. Negatives inside numeric steps go in brackets via `show()`.
- Polynomials print through `formatPolynomial` only (highest power first, `x^2`, no `1x`, no `+ -`).
- Coverage ≥ 90%. Conventional commits under the owner's identity. **No AI attribution.**

## Review Focus

1. **A factoring answer given in expanded form** (`x^2 + 5x + 6` for "Factor: x^2 + 5x + 6"): must be incorrect. Pinned in Task 2 (the `factored` form) and Task 4.
2. **An expansion answer left in factored form** (`(x + 2)(x + 3)` for "Expand"): must be incorrect. Pinned in Task 3 (`maxTerms`, no brackets).
3. **Quadratic roots typed in any order, with `x =`, or rounded as asked** (`x = -2, x = -3`; `1.56, -2.56`): must be correct; a missing or extra root is incorrect. Pinned in Task 5.
4. **A system answer with x and y swapped** (`(5, 2)` for `(2, 5)`): must be incorrect. Pinned in Task 7.
5. **A single-topic or partial mock exam:** must never pass a gate. Pinned in Task 1.

---

## File Structure

```
packages/math-engine/
├─ src/
│  ├─ format.ts        + formatPolynomial
│  ├─ rational.ts      + roundFloat
│  ├─ check.ts         + form 'factored' (one top-level term with a bracket)
│  ├─ mock-exam.ts     MockResult.topicIds; gatePassed(gate, results, graph) checks coverage
│  └─ generators/
│     ├─ polynomial-operations.ts   (new)
│     ├─ factoring.ts               (new)
│     ├─ quadratic-equations.ts     (new)
│     ├─ quadratic-relations.ts     (new)
│     ├─ linear-systems.ts          (new)
│     └─ registry.ts                + 5 generators
└─ test/
   ├─ oracle.ts             + afterLabel, holdsAt (shared symbolic-step helpers)
   ├─ mock-exam.test.ts     updated for coverage
   └─ generators-l2a.test.ts   contract, oracle and step tests for the 5 generators (new)
```

---

### Task 1: Gates require full-topic coverage

**Files:**

- Modify: `src/mock-exam.ts`, `test/mock-exam.test.ts`

**Interfaces:**

- Produces:
  - `type MockResult = Readonly<{ day: DayKey; level: LevelId; score: number; topicIds: readonly string[] }>`
  - `mockTopicIds(exam: MockExam): string[]`: the distinct topics in an exam, in order
  - `gatePassed(gate: Gate, results: readonly MockResult[], graph: KnowledgeGraph): boolean`: a result counts only if its `topicIds` include every topic of `gate.level` in `graph`

- [ ] **Step 1: Update and extend the tests (RED)**

In `packages/math-engine/test/mock-exam.test.ts`, replace the whole `describe('gatePassed', …)` block with:

```ts
describe('gatePassed', () => {
  const l2 = ONTARIO_GRAPH.topics.filter((t) => t.level === 'L2').map((t) => t.id);
  const pass = (day: string, score = 0.8, topicIds: readonly string[] = l2): MockResult => ({
    day,
    level: 'L2',
    score,
    topicIds,
  });

  it('needs the required passes on distinct days', () => {
    expect(gatePassed(gateA, [pass('2026-10-08'), pass('2026-10-08')], ONTARIO_GRAPH)).toBe(false);
    expect(gatePassed(gateA, [pass('2026-10-08'), pass('2026-10-10')], ONTARIO_GRAPH)).toBe(true);
  });

  it('ignores low scores and other levels', () => {
    expect(gatePassed(gateA, [pass('2026-10-08', 0.74), pass('2026-10-09')], ONTARIO_GRAPH)).toBe(
      false,
    );
    const otherLevel: MockResult = { day: '2026-10-08', level: 'L1', score: 1, topicIds: l2 };
    expect(gatePassed(gateA, [otherLevel, pass('2026-10-09')], ONTARIO_GRAPH)).toBe(false);
  });

  it('never counts a mock that skipped a topic of the level', () => {
    const partial = l2.slice(0, -1);
    expect(
      gatePassed(
        gateA,
        [pass('2026-10-08', 1, partial), pass('2026-10-09', 1, partial)],
        ONTARIO_GRAPH,
      ),
    ).toBe(false);
    expect(
      gatePassed(
        gateA,
        [pass('2026-10-08', 1, ['factoring']), pass('2026-10-09', 1, ['factoring'])],
        ONTARIO_GRAPH,
      ),
    ).toBe(false);
  });
});

describe('mockTopicIds', () => {
  it('lists the distinct topics an exam covered', () => {
    const exam = buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L1', 3, 10);
    expect(mockTopicIds(exam)).toEqual([...new Set(exam.problems.map((p) => p.topicId))]);
  });
});
```

and add `mockTopicIds` to the import from `../src/mock-exam`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test mock-exam`
Expected: FAIL (`mockTopicIds` is not exported; the partial mock passes the gate).

- [ ] **Step 3: Implement**

In `packages/math-engine/src/mock-exam.ts`, replace `MockResult` and `gatePassed` with:

```ts
export type MockResult = Readonly<{
  day: DayKey;
  level: LevelId;
  score: number;
  topicIds: readonly string[];
}>;

export const mockTopicIds = (exam: MockExam): string[] => [
  ...new Set(exam.problems.map((p) => p.topicId)),
];

/**
 * A gate passes after `requiredPasses` good mocks on distinct days, and only mocks that
 * covered every topic of the level count: a one-topic "mock" proves nothing about the exam.
 */
export function gatePassed(
  gate: Gate,
  results: readonly MockResult[],
  graph: KnowledgeGraph,
): boolean {
  const required = graph.topics.filter((t) => t.level === gate.level).map((t) => t.id);
  const counts = (r: MockResult): boolean =>
    r.level === gate.level &&
    r.score >= gate.minScore &&
    required.every((id) => r.topicIds.includes(id));
  return new Set(results.filter(counts).map((r) => r.day)).size >= gate.requiredPasses;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): only count mock exams that cover every topic toward a gate"
```

---

### Task 2: `formatPolynomial`, `roundFloat`, the `factored` form, and shared symbolic-step helpers

**Files:**

- Modify: `src/format.ts`, `src/rational.ts`, `src/check.ts`, `test/format.test.ts`, `test/rational.test.ts`, `test/check.test.ts`, `test/oracle.ts`

**Interfaces:**

- Produces:
  - `formatPolynomial(coefficients: readonly number[], symbol = 'x'): string`, highest power first: `[1, -5, 6]` → `"x^2 - 5x + 6"`, `[2, 0]` → `"2x"`, `[0, 0]` → `"0"`
  - `roundFloat(value: number, places: number): Rational`, for _irrational_ values only (rounds `value·10^places` to the nearest integer)
  - Expression `form?: 'monomial' | 'factored'`. `factored`: the answer must contain a bracket and have exactly one term at the top level (outside brackets).
  - In `test/oracle.ts`: `afterLabel(step: string): string` (the text after the last `": "`, or the whole step) and `holdsAt(equation: string, values: Record<string, number>): boolean` (both sides of `lhs = rhs` agree within 1e-9)

- [ ] **Step 1: Write the failing tests**

Append to `packages/math-engine/test/format.test.ts`:

```ts
describe('formatPolynomial', () => {
  it.each([
    [[1, -5, 6], 'x^2 - 5x + 6'],
    [[2, 0], '2x'],
    [[-1, 0, 9], '-x^2 + 9'],
    [[4, 0, -25], '4x^2 - 25'],
    [[1, 1], 'x + 1'],
    [[0, 0], '0'],
    [[2, -6, 8, 0], '2x^3 - 6x^2 + 8x'],
  ])('%j → %s', (coefficients, text) => {
    expect(formatPolynomial(coefficients)).toBe(text);
  });
});
```

and add `formatPolynomial` to the `../src/format` import.

Append to `packages/math-engine/test/rational.test.ts`:

```ts
describe('roundFloat', () => {
  it('rounds an irrational value to the given places', () => {
    expect(roundFloat(Math.SQRT2, 2)).toEqual(rational(141, 100));
    expect(roundFloat(-Math.PI, 1)).toEqual(rational(-31, 10));
  });
});
```

and add `roundFloat` to the `../src/rational` import.

Append to `packages/math-engine/test/check.test.ts`:

```ts
describe('checkAnswer: factored form', () => {
  const factored: Answer = { type: 'expression', text: '(x+2)(x+3)', form: 'factored' };

  it.each([
    ['(x + 2)(x + 3)', 'correct'],
    ['(x+3)(x+2)', 'correct'],
    ['x^2 + 5x + 6', 'incorrect'],
    ['x(x + 5) + 6', 'incorrect'],
    ['(x + 2)(x + 4)', 'incorrect'],
  ])('(x+2)(x+3) vs %j is %s', (given, outcome) => {
    expect(checkAnswer(factored, given)).toBe(outcome);
  });

  it('accepts a common factor and a negative leading sign', () => {
    expect(checkAnswer({ type: 'expression', text: '3(x+4)', form: 'factored' }, '3(x + 4)')).toBe(
      'correct',
    );
    expect(
      checkAnswer({ type: 'expression', text: '-(x-2)(x+2)', form: 'factored' }, '-(x - 2)(x + 2)'),
    ).toBe('correct');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test format rational check`
Expected: FAIL (missing exports; the expanded form is accepted).

- [ ] **Step 3: Implement**

Append to `packages/math-engine/src/format.ts`:

```ts
/** Polynomial from coefficients, highest power first: [1, -5, 6] → "x^2 - 5x + 6". */
export function formatPolynomial(coefficients: readonly number[], symbol = 'x'): string {
  const degree = coefficients.length - 1;
  const terms = coefficients.flatMap((c, i) => {
    if (c === 0) return [];
    const power = degree - i;
    const variable = power === 0 ? '' : power === 1 ? symbol : `${symbol}^${power}`;
    const magnitude = Math.abs(c) === 1 && variable !== '' ? '' : String(Math.abs(c));
    return [{ negative: c < 0, body: `${magnitude}${variable}` }];
  });
  if (terms.length === 0) return '0';
  return terms
    .map((t, i) =>
      i === 0 ? `${t.negative ? '-' : ''}${t.body}` : `${t.negative ? '-' : '+'} ${t.body}`,
    )
    .join(' ');
}
```

Append to `packages/math-engine/src/rational.ts`:

```ts
/** Rounds an irrational value (e.g. a root from the quadratic formula) to `places` decimals. */
export const roundFloat = (value: number, places: number): Rational =>
  rational(Math.round(value * 10 ** places), 10 ** places);
```

In `packages/math-engine/src/check.ts`:

- Change the expression variant to `form?: 'monomial' | 'factored'`, and the `checkExpression` parameter to `form?: 'monomial' | 'factored'`.
- Add the term counter:

```ts
/** Terms outside every bracket: "(x+2)(x+3)" has 1, "x(x+5) + 6" has 2. A leading sign doesn't count. */
function topLevelTerms(text: string): number {
  let depth = 0;
  let terms = 1;
  [...text.replace(/\s+/g, '')].forEach((ch, i, all) => {
    if (ch === '(' || ch === '{') depth += 1;
    else if (ch === ')' || ch === '}') depth -= 1;
    else if (
      (ch === '+' || ch === '-') &&
      depth === 0 &&
      i > 0 &&
      !'(^*{'.includes(all[i - 1] ?? '')
    )
      terms += 1;
  });
  return terms;
}
```

- Right after the monomial check in `checkExpression`, add:

```ts
if (form === 'factored' && !(text.includes('(') && topLevelTerms(text) === 1)) return 'incorrect';
```

Append to `packages/math-engine/test/oracle.ts`:

```ts
/** The claim in a step: text after the last ": " (or the whole step when it has no label). */
export const afterLabel = (step: string): string => {
  const colon = step.lastIndexOf(': ');
  return colon < 0 ? step : step.slice(colon + 2);
};

/** True when both sides of "lhs = rhs" agree at the given values. */
export const holdsAt = (equation: string, values: Record<string, number>): boolean => {
  const [lhs = '', rhs = ''] = equation.split('=');
  return Math.abs(evaluate(lhs, values) - evaluate(rhs, values)) < 1e-9;
};
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add polynomial formatting, factored form and float rounding helpers"
```

---

### Task 3: `polynomial-operations` generator (expanding)

**Files:**

- Create: `src/generators/polynomial-operations.ts`, `test/generators-l2a.test.ts`
- Modify: `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces: `polynomialOperationsGenerator` (topic `polynomial-operations`). Prompt `Expand and simplify: <product>`; the answer is an expression in expanded form (`maxTerms` = number of non-zero terms). Levels:
  - d1: `(x + a)(x + b)`, a and b in 1–9
  - d2: the same with signs
  - d3: `(px + a)(qx + b)`, p and q in 2–4
  - d4: `(px + a)^2`, p in 1–3
  - d5: `(px + a)(px − a)` or `kx(x^2 + bx + c)`

- [ ] **Step 1: Write the failing tests**

`packages/math-engine/test/generators-l2a.test.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { countTerms } from '../src/check';
import { polynomialOperationsGenerator } from '../src/generators/polynomial-operations';
import { expectGeneratorContract } from './contract';
import { afterLabel, evaluate, promptMath, RUNS, seedAndDifficulty } from './oracle';

const SAMPLE_X = [1.3, -0.7, 2.9];

expectGeneratorContract(polynomialOperationsGenerator);

describe('polynomial-operations oracle', () => {
  it('answer and every step equal the original product, and the answer is expanded', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = polynomialOperationsGenerator.generate(seed, d);
        if (problem.answer.type !== 'expression') throw new Error('expected an expression');
        const original = promptMath(problem.prompt);
        for (const x of SAMPLE_X) {
          expect(evaluate(problem.answer.text, { x })).toBeCloseTo(evaluate(original, { x }), 6);
          for (const step of problem.steps)
            expect(evaluate(afterLabel(step), { x }), step).toBeCloseTo(
              evaluate(original, { x }),
              6,
            );
        }
        expect(problem.answer.text).not.toContain('(');
        expect(countTerms(problem.answer.text)).toBe(problem.answer.maxTerms);
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l2a`
Expected: FAIL, cannot resolve `../src/generators/polynomial-operations`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/polynomial-operations.ts`:

```ts
import { formatPolynomial } from '../format';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

type Poly = readonly number[];

/** Product of two polynomials given as coefficient lists (highest power first). */
const multiply = (p: Poly, q: Poly): number[] =>
  p
    .flatMap((a, i) => q.map((b, j) => ({ power: i + j, value: a * b })))
    .reduce<number[]>(
      (sum, t) => {
        const out = [...sum];
        out[t.power] = (out[t.power] ?? 0) + t.value;
        return out;
      },
      Array.from({ length: p.length + q.length - 1 }, () => 0),
    );

/** Every partial product, uncombined: (x + 2)(x + 3) → "x^2 + 3x + 2x + 6". */
function partialProducts(p: Poly, q: Poly): string {
  const degree = p.length + q.length - 2;
  const terms = p.flatMap((a, i) =>
    q.map((b, j) => {
      const coefficients = Array.from({ length: degree + 1 }, (_, k) => (k === i + j ? a * b : 0));
      return formatPolynomial(coefficients);
    }),
  );
  return terms
    .filter((t) => t !== '0')
    .map((t, i) => (i === 0 ? t : t.startsWith('-') ? `- ${t.slice(1)}` : `+ ${t}`))
    .join(' ');
}

const nonZero = (rng: Rng, limit: number): number =>
  rng.int(1, limit) * (rng.next() < 0.5 ? -1 : 1);
const factor = (p: Poly): string => `(${formatPolynomial(p)})`;

export const polynomialOperationsGenerator: Generator = {
  topicId: 'polynomial-operations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    let left: Poly;
    let right: Poly;
    let shown: string;

    if (difficulty <= 2) {
      const [a, b] =
        difficulty === 1 ? [rng.int(1, 9), rng.int(1, 9)] : [nonZero(rng, 9), nonZero(rng, 9)];
      [left, right] = [
        [1, a],
        [1, b],
      ];
      shown = `${factor(left)}${factor(right)}`;
    } else if (difficulty === 3) {
      [left, right] = [
        [rng.int(2, 4), nonZero(rng, 7)],
        [rng.int(2, 4), nonZero(rng, 7)],
      ];
      shown = `${factor(left)}${factor(right)}`;
    } else if (difficulty === 4) {
      left = [rng.int(1, 3), nonZero(rng, 9)];
      right = left;
      shown = `${factor(left)}^2`;
    } else if (rng.next() < 0.5) {
      const [p, a] = [rng.int(1, 4), rng.int(2, 9)];
      [left, right] = [
        [p, a],
        [p, -a],
      ];
      shown = `${factor(left)}${factor(right)}`;
    } else {
      const k = nonZero(rng, 4) * (rng.next() < 0.5 ? 1 : 2);
      [left, right] = [
        [k, 0],
        [1, nonZero(rng, 6), nonZero(rng, 9)],
      ];
      shown = `${formatPolynomial(left)}${factor(right)}`;
    }

    const product = multiply(left, right);
    const answer = formatPolynomial(product);
    const expanded = partialProducts(left, right);
    return {
      topicId: 'polynomial-operations',
      seed,
      difficulty,
      prompt: `Expand and simplify: ${shown}`,
      answer: { type: 'expression', text: answer, maxTerms: product.filter((c) => c !== 0).length },
      hints: [
        'Multiply every term in the first bracket by every term in the second, then collect like terms.',
      ],
      steps:
        expanded === answer
          ? [`Multiply each term: ${answer}`]
          : [`Multiply each term: ${expanded}`, `Collect like terms: ${answer}`],
    };
  },
};
```

Register it in `DEFAULT_REGISTRY` after `financialLiteracyGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/polynomial-operations';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS (contract, oracle, wording, step validator). If the wording test flags `1x`, it means a term reached the output without going through `formatPolynomial`. Fix that path.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add polynomial expansion generator"
```

---

### Task 4: `factoring` generator

**Files:**

- Create: `src/generators/factoring.ts`
- Modify: `test/generators-l2a.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces: `factoringGenerator` (topic `factoring`). Prompt `Factor: <polynomial>`; the answer is an expression with `form: 'factored'`. Levels:
  - d1: common factor `k(mx + n)` with gcd(m, n) = 1 and k in 2–6
  - d2–3: `x^2 + bx + c = (x + p)(x + q)`, with |p|, |q| ≥ 2 and p + q ≠ 0
  - d4: difference of squares `(mx)^2 − n^2`
  - d5: `ax^2 + bx + c = (px + r)(qx + s)` with p ≥ 1, q ≥ 2, gcd(p, r) = gcd(q, s) = 1 and |rs| ≥ 2
  - Steps use checkable arithmetic: `(-3) × 4 = -12 and (-3) + 4 = 1`, or `a × c = 6 × (-5) = -30`.

- [ ] **Step 1: Write the failing test**

Append to `packages/math-engine/test/generators-l2a.test.ts` (hoist the import):

```ts
import { factoringGenerator } from '../src/generators/factoring';
import { checkAnswer } from '../src/check';

expectGeneratorContract(factoringGenerator);

describe('factoring oracle', () => {
  it('the factored answer equals the prompt, and the expanded prompt itself is not accepted', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = factoringGenerator.generate(seed, d);
        if (problem.answer.type !== 'expression') throw new Error('expected an expression');
        const original = promptMath(problem.prompt);
        for (const x of SAMPLE_X)
          expect(evaluate(problem.answer.text, { x })).toBeCloseTo(evaluate(original, { x }), 6);
        expect(problem.answer.form).toBe('factored');
        expect(checkAnswer(problem.answer, original)).toBe('incorrect');
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l2a`
Expected: FAIL, cannot resolve `../src/generators/factoring`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/factoring.ts`:

```ts
import { formatPolynomial, show } from '../format';
import { gcd } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator, Problem } from '../types';

const MAX_TRIES = 20;
const factor = (a: number, b: number): string => `(${formatPolynomial([a, b])})`;

/** A non-zero integer with |n| in [min, max]. */
const signedBetween = (rng: Rng, min: number, max: number): number =>
  rng.int(min, max) * (rng.next() < 0.5 ? -1 : 1);

/** A value b with |b| in [min, max] and gcd(a, b) = 1 (falls back to 1, which is coprime to anything). */
function coprimeTo(rng: Rng, a: number, min: number, max: number): number {
  for (let tries = 0; tries < MAX_TRIES; tries += 1) {
    const b = signedBetween(rng, min, max);
    if (gcd(a, b) === 1) return b;
  }
  return 1;
}

export const factoringGenerator: Generator = {
  topicId: 'factoring',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const make = (
      coefficients: number[],
      answer: string,
      hint: string,
      steps: string[],
    ): Problem => ({
      topicId: 'factoring',
      seed,
      difficulty,
      prompt: `Factor: ${formatPolynomial(coefficients)}`,
      answer: { type: 'expression', text: answer, form: 'factored' },
      hints: [hint],
      steps,
    });

    if (difficulty === 1) {
      const [k, m] = [rng.int(2, 6), rng.int(1, 5)];
      const n = coprimeTo(rng, m, 1, 9);
      const answer = `${k}${factor(m, n)}`;
      return make(
        [k * m, k * n],
        answer,
        'Find the greatest common factor of the terms and divide it out.',
        [`The greatest common factor of the terms is ${k}`, `Divide each term by ${k}: ${answer}`],
      );
    }

    if (difficulty <= 3) {
      const p = signedBetween(rng, 2, difficulty === 2 ? 6 : 9);
      const drawn = signedBetween(rng, 2, difficulty === 2 ? 6 : 9);
      const q = p + drawn === 0 ? drawn + Math.sign(drawn) : drawn;
      const answer = `${factor(1, p)}${factor(1, q)}`;
      return make(
        [1, p + q, p * q],
        answer,
        'Find two numbers that multiply to the constant and add to the middle coefficient.',
        [
          `Two numbers that multiply to ${p * q} and add to ${p + q}: ${show(p)} × ${show(q)} = ${p * q} and ${show(p)} + ${show(q)} = ${p + q}`,
          `So the factors are ${answer}`,
        ],
      );
    }

    if (difficulty === 4) {
      const [m, n] = [rng.int(1, 3), rng.int(2, 9)];
      const square = m === 1 ? 'x^2' : `(${m}x)^2`;
      const answer = `${factor(m, n)}${factor(m, -n)}`;
      return make(
        [m * m, 0, -n * n],
        answer,
        'A difference of squares: a^2 - b^2 = (a + b)(a - b).',
        [
          `This is a difference of squares: ${square} - ${n}^2`,
          `a^2 - b^2 = (a + b)(a - b), so the factors are ${answer}`,
        ],
      );
    }

    const [p, q] = [rng.int(1, 3), rng.int(2, 3)];
    const r = coprimeTo(rng, p, 1, 5);
    const drawn = coprimeTo(rng, q, 1, 5);
    const s = Math.abs(r * drawn) < 2 ? coprimeTo(rng, q, 2, 5) * Math.sign(drawn) : drawn;
    const [a, b, c] = [p * q, p * s + r * q, r * s];
    const [m1, m2] = [p * s, r * q];
    const answer = `${factor(p, r)}${factor(q, s)}`;
    return make(
      [a, b, c],
      answer,
      'Find two numbers that multiply to a × c and add to b, split the middle term, then group.',
      [
        `a × c = ${a} × ${show(c)} = ${a * c}`,
        `Two numbers that multiply to ${a * c} and add to ${b}: ${show(m1)} × ${show(m2)} = ${a * c} and ${show(m1)} + ${show(m2)} = ${b}`,
        `Factor by grouping: ${answer}`,
      ],
    );
  },
};
```

Notes:

- `coprimeTo(rng, q, 2, 5)` can return `1` only if 20 draws fail. That's impossible for q ∈ {2, 3}: 5 and 3, or 5, are coprime to both.
- The `a × c` step never prints `× 1`, because `|c| = |rs| ≥ 2`.

Register it in `DEFAULT_REGISTRY` after `polynomialOperationsGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/factoring';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS. The step validator checks the `×` and `+` claims in the steps; a failure there is a real factoring mistake.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add factoring generator"
```

---

### Task 5: `quadratic-equations` generator

**Files:**

- Create: `src/generators/quadratic-equations.ts`
- Modify: `test/generators-l2a.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces: `quadraticEquationsGenerator` (topic `quadratic-equations`). The answer is a `set` of two distinct roots. Levels:
  - d1: `Solve: (x - r)(x - s) = 0`
  - d2–3: `Solve: x^2 + bx + c = 0` with integer roots
  - d4: `Solve: ax^2 + bx + c = 0` with rational roots (a = pq ≥ 2)
  - d5: `Solve: ax^2 + bx + c = 0. Round to two decimal places.`, with an irrational discriminant, a ≥ 2, |c| ≥ 2, b ≠ 0, and roots via `roundFloat`
  - d5 steps include the checkable discriminant `b² - 4 × a × c = D`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/math-engine/test/generators-l2a.test.ts` (hoist the import):

```ts
import { quadraticEquationsGenerator } from '../src/generators/quadratic-equations';
import { toNumber } from '../src/rational';

expectGeneratorContract(quadraticEquationsGenerator);

describe('quadratic-equations oracle', () => {
  it('has two distinct roots that satisfy the equation (or match the formula when rounded)', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = quadraticEquationsGenerator.generate(seed, d);
        if (problem.answer.type !== 'set') throw new Error('expected a set');
        const roots = problem.answer.items.map(toNumber);
        expect(roots).toHaveLength(2);
        expect(roots[0]).not.toBe(roots[1]);
        const equation = promptMath(problem.prompt).replace(/\. Round.*$/, '');
        const [lhs = ''] = equation.split('=');
        if (/Round to two/.test(problem.prompt)) {
          const coefficients = /^(-?\d*)x\^2 ([+-]) (\d*)x ([+-]) (\d+) = 0/.exec(equation);
          if (coefficients === null) throw new Error(`unexpected equation: ${equation}`);
          const [, aText = '', bSign, bText = '', cSign, cText = ''] = coefficients;
          const a = Number(aText);
          const b = (bSign === '-' ? -1 : 1) * Number(bText || '1');
          const c = (cSign === '-' ? -1 : 1) * Number(cText);
          const root = (sign: number): number =>
            Math.round(((-b + sign * Math.sqrt(b * b - 4 * a * c)) / (2 * a)) * 100) / 100;
          expect([...roots].sort((x, y) => x - y)).toEqual(
            [root(-1), root(1)].sort((x, y) => x - y),
          );
        } else {
          for (const x of roots) expect(Math.abs(evaluate(lhs, { x }))).toBeLessThan(1e-9);
        }
      }),
      RUNS,
    );
  });

  it('accepts the roots in any order and with x =', () => {
    const problem = quadraticEquationsGenerator.generate(11, 2);
    if (problem.answer.type !== 'set') throw new Error('expected a set');
    const [first, second] = problem.answer.items.map(toNumber);
    expect(checkAnswer(problem.answer, `x = ${second}, x = ${first}`)).toBe('correct');
    expect(checkAnswer(problem.answer, `${first}`)).toBe('incorrect');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test generators-l2a`
Expected: FAIL, cannot resolve `../src/generators/quadratic-equations`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/quadratic-equations.ts`:

```ts
import { decimalText, formatPolynomial, show } from '../format';
import { equals, rational, roundFloat, toText, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator, Problem } from '../types';

const signedBetween = (rng: Rng, min: number, max: number): number =>
  rng.int(min, max) * (rng.next() < 0.5 ? -1 : 1);

/** Two different values with |v| in [min, max]. */
function twoDistinct(rng: Rng, min: number, max: number): [number, number] {
  const r = signedBetween(rng, min, max);
  const drawn = signedBetween(rng, min, max);
  return [r, drawn === r ? -r : drawn];
}

const factor = (a: number, b: number): string => `(${formatPolynomial([a, b])})`;

export const quadraticEquationsGenerator: Generator = {
  topicId: 'quadratic-equations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const make = (
      prompt: string,
      roots: [Rational, Rational],
      hint: string,
      steps: string[],
    ): Problem => ({
      topicId: 'quadratic-equations',
      seed,
      difficulty,
      prompt: `Solve: ${prompt}`,
      answer: { type: 'set', items: roots },
      hints: [hint],
      steps,
    });
    const rootsText = (roots: [Rational, Rational]): string =>
      `x = ${toText(roots[0])} or x = ${toText(roots[1])}`;

    if (difficulty === 1) {
      const [r, s] = twoDistinct(rng, 1, 9);
      const roots: [Rational, Rational] = [rational(r), rational(s)];
      return make(
        `${factor(1, -r)}${factor(1, -s)} = 0`,
        roots,
        'If a product is zero, one of the factors is zero.',
        [
          `Set each factor to zero: ${formatPolynomial([1, -r])} = 0 or ${formatPolynomial([1, -s])} = 0`,
          rootsText(roots),
        ],
      );
    }

    if (difficulty <= 3) {
      const [r, s] = twoDistinct(rng, 2, difficulty === 2 ? 6 : 9);
      const [p, q] = [-r, -s];
      const roots: [Rational, Rational] = [rational(r), rational(s)];
      return make(
        `${formatPolynomial([1, p + q, p * q])} = 0`,
        roots,
        'Factor, then set each factor to zero.',
        [
          `Two numbers that multiply to ${p * q} and add to ${p + q}: ${show(p)} × ${show(q)} = ${p * q} and ${show(p)} + ${show(q)} = ${p + q}`,
          `Factor: ${factor(1, p)}${factor(1, q)} = 0`,
          rootsText(roots),
        ],
      );
    }

    if (difficulty === 4) {
      const [p, q] = [rng.int(1, 3), rng.int(2, 3)];
      const [r, s] = [signedBetween(rng, 1, 5), signedBetween(rng, 1, 5)];
      const rootA = rational(r, p);
      const candidate = rational(s, q);
      // -s/q can't also equal r/p (that would need s = 0), so the two roots are always distinct.
      const roots: [Rational, Rational] = [
        rootA,
        equals(rootA, candidate) ? rational(-s, q) : candidate,
      ];
      const [b1, b2] = [roots[0].num, roots[1].num];
      const [d1, d2] = [roots[0].den, roots[1].den];
      const coefficients = [d1 * d2, -(d1 * b2 + d2 * b1), b1 * b2];
      return make(
        `${formatPolynomial(coefficients)} = 0`,
        roots,
        'Factor (try a × c), then set each factor to zero.',
        [`Factor: ${factor(d1, -b1)}${factor(d2, -b2)} = 0`, rootsText(roots)],
      );
    }

    const a = rng.int(2, 3);
    let b = 0;
    let c = 0;
    let discriminant = 0;
    for (let tries = 0; tries < 50; tries += 1) {
      b = signedBetween(rng, 1, 9);
      c = signedBetween(rng, 2, 9);
      discriminant = b * b - 4 * a * c;
      const root = Math.round(Math.sqrt(Math.max(discriminant, 0)));
      if (discriminant > 0 && root * root !== discriminant) break;
    }
    if (!(discriminant > 0)) [b, c, discriminant] = [3, -2, 9 + 8 * a];
    const sqrt = Math.sqrt(discriminant);
    const roots: [Rational, Rational] = [
      roundFloat((-b + sqrt) / (2 * a), 2),
      roundFloat((-b - sqrt) / (2 * a), 2),
    ];
    return make(
      `${formatPolynomial([a, b, c])} = 0. Round to two decimal places.`,
      roots,
      'Use the quadratic formula: x = (-b ± √(b² - 4ac)) ÷ 2a.',
      [
        `Discriminant: ${show(b)}² - 4 × ${a} × ${show(c)} = ${discriminant}`,
        `x = (${-b} ± √${discriminant}) ÷ ${2 * a}`,
        `x ≈ ${decimalText(roots[0])} or x ≈ ${decimalText(roots[1])}`,
      ],
    );
  },
};
```

Note: the fallback `b = 3, c = -2` gives `D = 9 + 8a` (25 or 33 for a ∈ {2, 3}). The loop practically always succeeds first, but if a fallback ever produces a perfect square, the oracle still passes, because the answer is still the correct rounded roots.

Register it in `DEFAULT_REGISTRY` after `factoringGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/quadratic-equations';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS. The step validator checks the discriminant chain (`3² - 4 × 2 × (-4) = 41`).

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add quadratic equations generator"
```

---

### Task 6: `quadratic-relations` generator

**Files:**

- Create: `src/generators/quadratic-relations.ts`
- Modify: `test/generators-l2a.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces: `quadraticRelationsGenerator` (topic `quadratic-relations`), from the vertex form `y = a(x - h)^2 + k`. Levels:
  - d1: the vertex (a `point`)
  - d2: the axis of symmetry (a `number` h; `x = 3` is accepted)
  - d3: the maximum or minimum value (`number` k)
  - d4: the y-intercept (`number`, with a checkable step)
  - d5: the zeros from the factored form `y = a(x - r)(x - s)` (a `set`)
  - h ∈ {−6..−2, 1..6} (so `× 1²` never appears), a ∈ ±{1, 2, 3}, k ∈ −9..9

- [ ] **Step 1: Write the failing test**

Append to `packages/math-engine/test/generators-l2a.test.ts` (hoist the import):

```ts
import { quadraticRelationsGenerator } from '../src/generators/quadratic-relations';

expectGeneratorContract(quadraticRelationsGenerator);

describe('quadratic-relations oracle', () => {
  it('agrees with the parabola evaluated by the CAS', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = quadraticRelationsGenerator.generate(seed, d);
        const match = /^For y = (.+), (.+)\?$/.exec(problem.prompt);
        if (match === null) throw new Error(`unexpected prompt: ${problem.prompt}`);
        const f = (x: number): number => evaluate(match[1] ?? '', { x });
        const { answer } = problem;
        if (answer.type === 'point') {
          const [h = 0, k = 0] = answer.coords.map(toNumber);
          expect(f(h)).toBeCloseTo(k, 9);
          expect(f(h - 1)).toBeCloseTo(f(h + 1), 9);
          expect(f(h + 1)).not.toBeCloseTo(k, 9);
        } else if (answer.type === 'set') {
          for (const x of answer.items.map(toNumber)) expect(f(x)).toBeCloseTo(0, 9);
        } else if (answer.type === 'number') {
          const value = toNumber(answer.value);
          if (/y-intercept/.test(problem.prompt)) expect(value).toBeCloseTo(f(0), 9);
          else if (/axis of symmetry/.test(problem.prompt))
            expect(f(value - 1)).toBeCloseTo(f(value + 1), 9);
          else {
            const sign = /\(x ([+-]) (\d+)\)/.exec(match[1] ?? '');
            const h = sign === null ? 0 : (sign[1] === '-' ? 1 : -1) * Number(sign[2]);
            expect(f(h)).toBeCloseTo(value, 9);
            expect(f(h + 1) > value).toBe(/minimum/.test(problem.prompt));
          }
        } else throw new Error('unexpected answer type');
      }),
      RUNS,
    );
  });
});
```

The min/max branch reads h from the `(x ± n)` in the prompt and checks that the vertex value is k, with the parabola rising (minimum) or falling (maximum) one step away.

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l2a`
Expected: FAIL, cannot resolve `../src/generators/quadratic-relations`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/quadratic-relations.ts`:

```ts
import { formatPolynomial, show, signed } from '../format';
import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

const H_VALUES = [-6, -5, -4, -3, -2, 1, 2, 3, 4, 5, 6];

const coefficientText = (a: number): string => (a === 1 ? '' : a === -1 ? '-' : String(a));

/** a(x - h)^2 + k, written the way a textbook does. */
const vertexForm = (a: number, h: number, k: number): string =>
  `${coefficientText(a)}(${formatPolynomial([1, -h])})^2${k === 0 ? '' : ` ${signed(k)}`}`;

export const quadraticRelationsGenerator: Generator = {
  topicId: 'quadratic-relations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const a = rng.pick([-3, -2, -1, 1, 2, 3]);
    const h = rng.pick(H_VALUES);
    const k = rng.int(-9, 9);
    const f = vertexForm(a, h, k);
    const base = { topicId: 'quadratic-relations', seed, difficulty } as const;
    const vertexHint = 'In y = a(x - h)^2 + k, the vertex is (h, k).';

    if (difficulty === 1) {
      return {
        ...base,
        prompt: `For y = ${f}, what is the vertex?`,
        answer: { type: 'point', coords: [rational(h), rational(k)] },
        hints: [vertexHint],
        steps: [
          `In y = a(x - h)^2 + k the vertex is (h, k)`,
          `Here h = ${h} and k = ${k}, so the vertex is (${h}, ${k})`,
        ],
      };
    }
    if (difficulty === 2) {
      return {
        ...base,
        prompt: `For y = ${f}, what is the axis of symmetry?`,
        answer: { type: 'number', value: rational(h) },
        hints: ['The axis of symmetry is the vertical line through the vertex: x = h.'],
        steps: [`The vertex is (${h}, ${k})`, `The axis of symmetry is x = ${h}`],
      };
    }
    if (difficulty === 3) {
      const isMinimum = a > 0;
      return {
        ...base,
        prompt: `For y = ${f}, what is the ${isMinimum ? 'minimum' : 'maximum'} value of y?`,
        answer: { type: 'number', value: rational(k) },
        hints: [
          'If a > 0 the parabola opens up (a minimum at the vertex); if a < 0 it opens down (a maximum).',
        ],
        steps: [
          `a = ${a} is ${isMinimum ? 'positive, so the parabola opens up' : 'negative, so the parabola opens down'}`,
          `The ${isMinimum ? 'minimum' : 'maximum'} is the y-value of the vertex: ${k}`,
        ],
      };
    }
    if (difficulty === 4) {
      const intercept = a * h * h + k;
      return {
        ...base,
        prompt: `For y = ${f}, what is the y-intercept?`,
        answer: { type: 'number', value: rational(intercept) },
        hints: ['The y-intercept is where x = 0.'],
        steps: [`Substitute x = 0: ${a} × ${show(-h)}² + ${show(k)} = ${intercept}`],
      };
    }
    const r = rng.pick(H_VALUES);
    const drawn = rng.pick(H_VALUES);
    const s = drawn === r ? -r : drawn;
    const factored = `${coefficientText(a)}(${formatPolynomial([1, -r])})(${formatPolynomial([1, -s])})`;
    const problem: Problem = {
      ...base,
      prompt: `For y = ${factored}, what are the zeros?`,
      answer: { type: 'set', items: [rational(r), rational(s)] },
      hints: ['The zeros are where y = 0: set each factor to zero.'],
      steps: [
        `Set y = 0: ${formatPolynomial([1, -r])} = 0 or ${formatPolynomial([1, -s])} = 0`,
        `x = ${r} or x = ${s}`,
      ],
    };
    return problem;
  },
};
```

Register it in `DEFAULT_REGISTRY` after `quadraticEquationsGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/quadratic-relations';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS. The y-intercept step `2 × (-3)² + (-5) = 13` is checked by the step validator. `s = -r` when the draw repeats is safe because no h value is 0.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add quadratic relations generator"
```

---

### Task 7: `linear-systems` generator

**Files:**

- Create: `src/generators/linear-systems.ts`
- Modify: `test/generators-l2a.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces: `linearSystemsGenerator` (topic `linear-systems`). The answer is a `point` `(x, y)` with integer coordinates. Levels:
  - d1–2: substitution with `y = m1x + b1` and `y = m2x + b2`, m1 ≠ m2
  - d3–5: elimination with standard form `a1x + b1y = c1` and `a2x + b2y = c2`, with `a` in 1–(2 + d), `b` non-zero, and determinant ≠ 0
  - Every step is an equation that holds at the solution.

- [ ] **Step 1: Write the failing tests**

Append to `packages/math-engine/test/generators-l2a.test.ts` (hoist the imports, and add `holdsAt` to the `./oracle` import):

```ts
import { linearSystemsGenerator } from '../src/generators/linear-systems';

expectGeneratorContract(linearSystemsGenerator);

describe('linear-systems oracle', () => {
  it('the solution satisfies both equations, and every step holds at the solution', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearSystemsGenerator.generate(seed, d);
        if (problem.answer.type !== 'point') throw new Error('expected a point');
        const [x = 0, y = 0] = problem.answer.coords.map(toNumber);
        const equations = (problem.prompt.split(': ')[1] ?? '').split(' and ');
        expect(equations).toHaveLength(2);
        for (const equation of equations) expect(holdsAt(equation, { x, y }), equation).toBe(true);
        for (const step of problem.steps)
          expect(holdsAt(afterLabel(step), { x, y }), step).toBe(true);
      }),
      RUNS,
    );
  });

  it('marks a swapped point as incorrect', () => {
    const problem = linearSystemsGenerator.generate(5, 3);
    if (problem.answer.type !== 'point') throw new Error('expected a point');
    const [x = 0, y = 0] = problem.answer.coords.map(toNumber);
    if (x !== y) expect(checkAnswer(problem.answer, `(${y}, ${x})`)).toBe('incorrect');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test generators-l2a`
Expected: FAIL, cannot resolve `../src/generators/linear-systems`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/linear-systems.ts`:

```ts
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
```

Note: the fallback coefficients `[1, 1, 1, -1]` have determinant −2 ≠ 0, so the loop always ends with a solvable system.

Register it in `DEFAULT_REGISTRY` after `quadraticRelationsGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/linear-systems';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS. If the wording test flags `+ 0` or `Divide both sides by 1`, adjust the step text, not the test (a zero `b1·y` prints `+ 0`, which is allowed. Only `by 1:` is banned, and it's skipped above).

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add linear systems generator"
```

---

### Task 8: Registry checks, ADR, verification, learning note

**Files:**

- Modify: `test/generators-l2a.test.ts`, `docs/adr/0005-math-engine-design.md`

- [ ] **Step 1: Write the registry test**

Append to `packages/math-engine/test/generators-l2a.test.ts` (hoist the import):

```ts
import { DEFAULT_REGISTRY } from '../src/generators/registry';

describe('Grade 10 algebra coverage', () => {
  it('registers all five algebra topics', () => {
    for (const id of [
      'polynomial-operations',
      'factoring',
      'quadratic-equations',
      'quadratic-relations',
      'linear-systems',
    ]) {
      expect(DEFAULT_REGISTRY.has(id), id).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `bun run --cwd packages/math-engine test generators-l2a`
Expected: PASS.

- [ ] **Step 3: Update ADR 0005**

Append:

```markdown
## P2d-1: Grade 10 algebra and gate coverage

- A gate counts a mock exam only if it covered **every** topic of the level (`MockResult.topicIds`);
  this closes the "one-topic mock passes gate A" deferral.
- Expression `form: 'factored'`: one term outside brackets, with at least one bracket. Expansion answers
  use `maxTerms` + no brackets, so neither form can be answered by retyping the question.
- Irrational quadratic roots are rounded with `roundFloat` (the true value can't sit exactly on a half,
  so float rounding is safe there, unlike money, which stays on exact BigInt half-up).
- Algebra steps are checked symbolically: expansions stay equal to the product, and system steps
  hold at the solution.
```

- [ ] **Step 4: Full verification**

```bash
bun run format && bun run format:check && bun run lint && bun run typecheck && bun run coverage
grep -rn "Date.now\|Math.random" packages/math-engine/src && echo VIOLATION || echo deterministic
git log --format='%an <%ae>%n%b' | grep -i "co-authored\|claude" && echo VIOLATION || echo "authorship clean"
```

Expected: all green; coverage ≥ 90%; `deterministic`; `authorship clean`.

- [ ] **Step 5: Commit and write the learning note**

```bash
git add packages/math-engine docs/adr/0005-math-engine-design.md
git commit -m "test(math-engine): require all Grade 10 algebra generators"
```

Write `learning/05-p2d1-grade10-algebra.md` (not committed). Cover: expanding vs factoring as inverse operations; why a form rule is needed so a question can't be answered by retyping it; the "multiply to c, add to b" method and its a × c extension; the zero-product property; the discriminant and the quadratic formula; vertex form and what a, h and k mean; substitution vs elimination; why exact rounding is needed for money but float rounding is fine for irrational roots; the gate-coverage rule; and 6 self-check questions.
