# Future Flow P2a: Math Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@futureflow/math-engine`: exact rationals, a seeded RNG, an answer checker backed by a CAS, the L0–L2 Ontario knowledge graph, Elo ratings, mastery and spaced review, topic and difficulty scheduling, binary-search placement, mock exams with gates, and 5 proof generators (3 L0, 2 L1). All pure and deterministic, so it runs offline on the phone.

**Architecture:** A new workspace package `packages/math-engine` that depends on `@futureflow/core` (for `Result`, `DayKey`, `addDays`) and `@cortex-js/compute-engine` (CAS). Generators are pure `(seed, difficulty) → Problem` functions, so the same seed always gives the same problem. Tests use the CAS as an **independent oracle**: every generated answer is re-derived from the prompt text by the CAS (property-based via fast-check).

**Tech Stack:** Bun workspaces, TypeScript 6, Vitest 5, fast-check, @cortex-js/compute-engine (verified 0.149.0 in a spike), @futureflow/core.

**Spec:** `docs/superpowers/specs/2026-10-08-futureflow-v1-design.md` (§2.2, §10, §15 P2a)

## Global Constraints

- Bun for installs and scripts; tools via `bun x`. Run package scripts as `bun run --cwd packages/math-engine <script>`.
- TypeScript pinned `^6` in every package (see ADR 0001).
- No I/O, no `Date.now()`, no `Math.random()` in `src/`. Randomness only via `createRng(seed)`. Dates only as `DayKey` from `@futureflow/core`.
- All exported data is `Readonly`, and functions return new objects. (Local arrays and the RNG's internal state are the only mutation.)
- Coverage threshold for `math-engine`: 90% on lines, branches, functions and statements.
- Commit messages use conventional format under the owner's identity. **No `Co-Authored-By` or AI attribution.**
- `learning/` is gitignored and never committed.

**Spike facts (verified against @cortex-js/compute-engine 0.149.0):** `new ComputeEngine()`; `ce.parse(text)` accepts plain text like `2(x+1)` as well as LaTeX; `.isValid` is `false` for malformed input such as `2x+`; `a.isIdenticallyEqual(b)` returns `true` for real identities, but **`undefined` (not `false`) for many non-equal pairs** such as `x^2` vs `2x`; `expr.subs({ x: 2 }).N().re` gives a number; `expr.unknowns` lists free variables.

**Deliberate deviations from the spec (recorded in ADR 0005):**

1. **Placement:** spec §10.4 says "starts mid-L0, about 20–30 problems." This plan uses a **binary search over the whole graph with 2 questions per probe**, which takes ≤ 12 problems for 26 topics. Topics assumed mastered get a **review due today**, so any wrong assumption is caught within the first sessions.
2. **Gates count distinct days for all gates.** The spec says this only for B gates. Retaking the same mock twice in one day doesn't prove retention.

## Review Focus

1. **A learner types an equivalent but differently written answer** (`6/8` for `3/4`, `x = 3`, `2(x+1)` for `2x+2`, roots in any order): must be marked correct. Pinned in Task 3.
2. **A "simplify" problem answered with the unsimplified original expression:** must be incorrect even though it's mathematically equal. Pinned in Task 3 (`maxTerms`) and Task 9 (generator sets `maxTerms`).
3. **Malformed or empty input** (`2x+`, `banana`, an empty string): must be `unreadable`, never `incorrect`. That way the UI asks again instead of costing the learner rating. Pinned in Task 3.
4. **A learner far below or far above every difficulty** (rating 300 or 2500): `pickDifficulty` must still return a valid difficulty (the closest to the target). Pinned in Task 6.
5. **A failed spaced review:** must reopen practice (unmastered, streak 0, no review date), so the topic comes back to the frontier. Pinned in Task 5.

---

## File Structure

```
packages/math-engine/
├─ package.json  tsconfig.json  vitest.config.ts
├─ src/
│  ├─ index.ts               public exports
│  ├─ rational.ts            Rational, rational(), add, equals, toNumber, toText, gcd, lcm, parseRational
│  ├─ rng.ts                 createRng(seed) → { next, int, pick }
│  ├─ types.ts               Difficulty, DIFFICULTIES, LevelId, Topic, Gate, Problem, Generator
│  ├─ format.ts              signed, formatLinear
│  ├─ check.ts               Answer, CheckOutcome, checkAnswer, answerText, countTerms
│  ├─ graph.ts               KnowledgeGraph, validateGraph, isUnlocked, frontier
│  ├─ curriculum.ts          ONTARIO_GRAPH (L0–L2), GATES
│  ├─ elo.ts                 expectedScore, updateRatings, initialItemRating, INITIAL_LEARNER_RATING
│  ├─ mastery.ts             TopicProgress, newProgress, recordAttempt, isReviewDue
│  ├─ scheduler.ts           pickDifficulty, earnsTime, nextTopic
│  ├─ placement.ts           startPlacement, placementProbe, recordPlacementAnswer, placementProgress
│  ├─ mock-exam.ts           buildMockExam, scoreMock, gatePassed
│  └─ generators/
│     ├─ registry.ts         GeneratorRegistry, createRegistry, DEFAULT_REGISTRY
│     ├─ integers.ts  fractions.ts  order-of-operations.ts                 (L0)
│     └─ algebraic-expressions.ts  linear-equations.ts                     (L1)
└─ test/
   ├─ oracle.ts              test-only CAS helpers (promptMath, evaluate)
   └─ *.test.ts
docs/adr/0005-math-engine-design.md
```

---

### Task 1: Package scaffold + exact rationals + ADR 0005

**Files:**

- Create: `packages/math-engine/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/rational.ts`, `test/rational.test.ts`, `docs/adr/0005-math-engine-design.md`
- Modify: `README.md` (repo layout table)

**Interfaces:**

- Produces: `type Rational = Readonly<{ num: number; den: number }>` (den > 0, reduced, no `-0`); `rational(num, den = 1): Rational` (throws `RangeError` on non-safe-integer or `den === 0`); `gcd(a, b)`, `lcm(a, b)`; `add(a, b)`; `equals(a, b)`; `toNumber(r)`; `toText(r)` (`"3"` or `"-3/4"`); `parseRational(text): Rational | null` (integers, `a/b`, decimals, Unicode minus).

- [ ] **Step 1: Create the package**

```bash
mkdir -p packages/math-engine/src/generators packages/math-engine/test
```

`packages/math-engine/package.json`:

```json
{
  "name": "@futureflow/math-engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@futureflow/core": "workspace:*"
  }
}
```

```bash
cd packages/math-engine
bun add @cortex-js/compute-engine
bun add -D typescript@^6 vitest @vitest/coverage-v8 fast-check
cd ../..
bun install
```

`packages/math-engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/math-engine/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
```

- [ ] **Step 2: Write the failing tests**

`packages/math-engine/test/rational.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { add, equals, gcd, lcm, parseRational, rational, toNumber, toText } from '../src/rational';

describe('rational', () => {
  it('reduces and normalizes the sign onto the numerator', () => {
    expect(rational(2, 4)).toEqual({ num: 1, den: 2 });
    expect(rational(3, -6)).toEqual({ num: -1, den: 2 });
  });

  it('never produces negative zero', () => {
    expect(Object.is(rational(0, -5).num, 0)).toBe(true);
    expect(rational(0, 7)).toEqual({ num: 0, den: 1 });
  });

  it.each([
    [1, 0],
    [1.5, 2],
    [Number.NaN, 1],
  ])('rejects %s/%s', (num, den) => {
    expect(() => rational(num, den)).toThrow(RangeError);
  });

  it('adds, compares and converts', () => {
    expect(add(rational(1, 2), rational(1, 3))).toEqual({ num: 5, den: 6 });
    expect(equals(rational(6, 8), rational(3, 4))).toBe(true);
    expect(equals(rational(1, 3), rational(1, 4))).toBe(false);
    expect(toNumber(rational(3, 4))).toBe(0.75);
    expect(toText(rational(-3, 4))).toBe('-3/4');
    expect(toText(rational(6, 2))).toBe('3');
  });

  it('computes gcd and lcm', () => {
    expect(gcd(12, 18)).toBe(6);
    expect(gcd(-4, 6)).toBe(2);
    expect(lcm(4, 6)).toBe(12);
  });
});

describe('parseRational', () => {
  it.each([
    ['3', { num: 3, den: 1 }],
    ['-3/4', { num: -3, den: 4 }],
    [' 6 / 8 ', { num: 3, den: 4 }],
    ['0.75', { num: 3, den: 4 }],
    ['-.5', { num: -1, den: 2 }],
    ['−2', { num: -2, den: 1 }],
  ])('parses %j', (text, expected) => {
    expect(parseRational(text)).toEqual(expected);
  });

  it.each(['1/0', 'abc', '1.2.3', '', '99999999999999999999'])('returns null for %j', (text) => {
    expect(parseRational(text)).toBeNull();
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test rational`
Expected: FAIL, `Cannot find module '../src/rational'`.

- [ ] **Step 4: Implement `rational.ts`**

`packages/math-engine/src/rational.ts`:

```ts
/** Exact fraction. Invariants: den > 0, gcd(|num|, den) = 1, never -0. */
export type Rational = Readonly<{ num: number; den: number }>;

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export const lcm = (a: number, b: number): number => Math.abs(a * b) / gcd(a, b);

export function rational(num: number, den = 1): Rational {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den === 0) {
    throw new RangeError(`invalid rational ${num}/${den}`);
  }
  const sign = den < 0 ? -1 : 1;
  const divisor = gcd(num, den) || 1;
  return { num: (sign * num) / divisor + 0, den: Math.abs(den) / divisor };
}

export const add = (a: Rational, b: Rational): Rational =>
  rational(a.num * b.den + b.num * a.den, a.den * b.den);

export const equals = (a: Rational, b: Rational): boolean => a.num === b.num && a.den === b.den;

export const toNumber = (r: Rational): number => r.num / r.den;

export const toText = (r: Rational): string => (r.den === 1 ? `${r.num}` : `${r.num}/${r.den}`);

const INTEGER = /^-?\d+$/;
const FRACTION = /^(-?\d+)\s*\/\s*(-?\d+)$/;
const DECIMAL = /^(-?)(\d*)\.(\d+)$/;

function parseUnsafe(text: string): Rational | null {
  if (INTEGER.test(text)) return rational(Number(text));
  const fraction = FRACTION.exec(text);
  if (fraction) {
    const den = Number(fraction[2]);
    return den === 0 ? null : rational(Number(fraction[1]), den);
  }
  const decimal = DECIMAL.exec(text);
  if (decimal) {
    const [, sign, whole, digits = ''] = decimal;
    const magnitude = Number(`${whole || '0'}${digits}`);
    return rational(sign === '-' ? -magnitude : magnitude, 10 ** digits.length);
  }
  return null;
}

/** Accepts `3`, `-3/4`, `0.75`, `-.5` (and the Unicode minus sign). Returns null otherwise. */
export function parseRational(text: string): Rational | null {
  try {
    return parseUnsafe(text.trim().replace(/−/g, '-'));
  } catch {
    return null;
  }
}
```

`packages/math-engine/src/index.ts`:

```ts
export * from './rational';
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test rational`
Expected: PASS.

- [ ] **Step 6: Write ADR 0005 and update the README**

`docs/adr/0005-math-engine-design.md`:

```markdown
# ADR 0005: Math engine — seeded generators, CAS checking, Elo scheduling

- Status: Accepted
- Date: 2026-10-08

## Context

The owner is rebuilding math from arithmetic toward Ontario MCV4U. Practice must work offline on a
3 GB Android phone, check answers exactly, never hand out a wrong answer key, and adapt difficulty.

## Decision

- **Generators** are pure functions `(seed, difficulty) → Problem` using a seeded PRNG (mulberry32).
  The same seed always gives the same problem on the phone and the server.
- **Answer checking** uses exact rationals for numbers. For expressions it uses Compute Engine's
  `isIdenticallyEqual`, and when that returns `undefined` it falls back to evaluating at 5 sample
  points. Malformed input is `unreadable`, not `incorrect`. "Simplify" problems also constrain the
  answer's _form_ (`maxTerms`, no brackets).
- **Tests use the CAS as an independent oracle**: property tests regenerate thousands of problems
  and re-derive each answer from the prompt text.
- **Elo** per topic for the learner and per (topic, difficulty) for items. The next problem's
  difficulty targets 70–85% predicted success. Problems predicted above 90% success earn no
  phone time.
- **Mastery**: 5 correct in a row without hints. Spaced reviews follow at +1, 3, 7, 16 and 35 days.
  A failed review reopens practice.

## Deviations from spec §10

- **Placement** is a binary search over the whole graph (2 questions per probe, at most 12 problems)
  instead of "start mid-L0, 20–30 problems". It's shorter for a tired learner. Because topics
  assumed mastered get a review due on day 0, wrong assumptions surface immediately.
- **Gates** count passes on **distinct days** for every gate (the spec only says this for B gates).

## Consequences

- No AI is needed to check math, and checking works offline.
- Placement assumes knowledge is roughly monotone along the graph order. The day-0 reviews
  correct it where it isn't (e.g. strong algebra but weak data skills).
```

In `README.md`, add this row to the repo layout table under `packages/contracts`:

```markdown
| `packages/math-engine` | Ontario math knowledge graph, problem generators, CAS answer checking, Elo, mastery, placement |
```

- [ ] **Step 7: Commit**

```bash
bun run format
git add packages/math-engine docs/adr/0005-math-engine-design.md README.md bun.lock
git commit -m "feat(math-engine): scaffold package with exact rationals and ADR 0005"
```

---

### Task 2: Seeded RNG, shared types, formatting helpers

**Files:**

- Create: `src/rng.ts`, `src/types.ts`, `src/format.ts`, `test/rng.test.ts`, `test/format.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `Rational` (Task 1).
- Produces:
  - `type Rng = Readonly<{ next(): number; int(min: number, max: number): number; pick<T>(items: readonly T[]): T }>`; `createRng(seed: number): Rng`
  - `type Difficulty = 1 | 2 | 3 | 4 | 5`; `DIFFICULTIES: readonly Difficulty[]`
  - `type LevelId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'`
  - `type Topic = Readonly<{ id: string; level: LevelId; title: string; prerequisites: readonly string[] }>`
  - `type Gate = Readonly<{ id: 'A' | 'B1' | 'B2' | 'B3'; level: LevelId; minScore: number; requiredPasses: number }>`
  - `type Problem = Readonly<{ topicId: string; seed: number; difficulty: Difficulty; prompt: string; answer: Answer; hints: readonly string[]; steps: readonly string[] }>` (`Answer` comes from Task 3; `types.ts` imports it as a type)
  - `type Generator = Readonly<{ topicId: string; generate(seed: number, difficulty: Difficulty): Problem }>`
  - `signed(n): string` (`"+ 3"` / `"- 3"`); `formatLinear(p, q, symbol = 'x'): string` (`"3x - 2"`, `"-x"`, `"5"`)

- [ ] **Step 1: Write the failing tests**

`packages/math-engine/test/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';

const draw = (seed: number, n: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('createRng', () => {
  it('repeats the same sequence for the same seed', () => {
    expect(draw(42, 5)).toEqual(draw(42, 5));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(1, 5)).not.toEqual(draw(2, 5));
  });

  it('returns numbers in [0, 1)', () => {
    expect(draw(7, 1000).every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('int stays within inclusive bounds and reaches both ends', () => {
    const rng = createRng(3);
    const values = Array.from({ length: 2000 }, () => rng.int(-2, 2));
    expect(Math.min(...values)).toBe(-2);
    expect(Math.max(...values)).toBe(2);
  });

  it('pick returns an element and rejects an empty list', () => {
    const rng = createRng(9);
    expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});
```

`packages/math-engine/test/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatLinear, signed } from '../src/format';

describe('signed', () => {
  it('writes the sign with a space', () => {
    expect(signed(3)).toBe('+ 3');
    expect(signed(-3)).toBe('- 3');
    expect(signed(0)).toBe('+ 0');
  });
});

describe('formatLinear', () => {
  it.each([
    [3, -2, '3x - 2'],
    [1, 4, 'x + 4'],
    [-1, 0, '-x'],
    [0, 5, '5'],
    [0, 0, '0'],
    [-2, 7, '-2x + 7'],
  ])('formatLinear(%s, %s) = %s', (p, q, text) => {
    expect(formatLinear(p, q)).toBe(text);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test rng format`
Expected: FAIL, cannot resolve `../src/rng` and `../src/format`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/rng.ts`:

```ts
export type Rng = Readonly<{
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
}>;

const UINT32 = 4_294_967_296;

/** mulberry32: tiny, fast, good enough for problem variety; deterministic per seed. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError('pick from an empty list');
    return items[int(0, items.length - 1)] as T;
  };
  return { next, int, pick };
}
```

`packages/math-engine/src/types.ts`:

```ts
import type { Answer } from './check';

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5];

export type LevelId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export type Topic = Readonly<{
  id: string;
  level: LevelId;
  title: string;
  prerequisites: readonly string[];
}>;

export type Gate = Readonly<{
  id: 'A' | 'B1' | 'B2' | 'B3';
  level: LevelId;
  minScore: number;
  requiredPasses: number;
}>;

export type Problem = Readonly<{
  topicId: string;
  seed: number;
  difficulty: Difficulty;
  prompt: string;
  answer: Answer;
  hints: readonly string[];
  steps: readonly string[];
}>;

export type Generator = Readonly<{
  topicId: string;
  generate: (seed: number, difficulty: Difficulty) => Problem;
}>;
```

`packages/math-engine/src/format.ts`:

```ts
export const signed = (n: number): string => (n < 0 ? `- ${-n}` : `+ ${n}`);

/** Formats p·x + q the way a textbook would: "3x - 2", "-x", "x + 4", "5". */
export function formatLinear(p: number, q: number, symbol = 'x'): string {
  if (p === 0) return String(q);
  const coefficient = p === 1 ? '' : p === -1 ? '-' : String(p);
  const lead = `${coefficient}${symbol}`;
  return q === 0 ? lead : `${lead} ${signed(q)}`;
}
```

Because `types.ts` imports `Answer` from `./check`, create a temporary placeholder so it compiles before Task 3. Task 3 replaces it entirely.

`packages/math-engine/src/check.ts`:

```ts
import type { Rational } from './rational';

export type Answer = Readonly<{ type: 'number'; value: Rational }>;
```

Append to `src/index.ts`:

```ts
export * from './rng';
export * from './types';
export * from './format';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS; typecheck exits 0 for all packages.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add seeded rng, shared types and formatting helpers"
```

---

### Task 3: Answer checker (`check.ts`)

**Files:**

- Modify (replace placeholder): `src/check.ts`
- Create: `test/check.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `Rational`, `equals`, `parseRational`, `toNumber`, `toText` (Task 1).
- Produces:
  - `type Answer = { type: 'number'; value: Rational } | { type: 'expression'; text: string; maxTerms?: number } | { type: 'set'; items: readonly Rational[] } | { type: 'point'; coords: readonly Rational[] } | { type: 'choice'; options: readonly string[]; correctIndex: number }` (each `Readonly`)
  - `type CheckOutcome = 'correct' | 'incorrect' | 'unreadable'`
  - `checkAnswer(expected: Answer, given: string): CheckOutcome`
  - `answerText(answer: Answer): string`: the canonical input that `checkAnswer` accepts
  - `countTerms(text: string): number`

- [ ] **Step 1: Write the failing tests**

`packages/math-engine/test/check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { answerText, checkAnswer, countTerms, type Answer } from '../src/check';
import { rational } from '../src/rational';

const num = (n: number, d = 1): Answer => ({ type: 'number', value: rational(n, d) });

describe('checkAnswer: number', () => {
  it.each([
    ['3/4', 'correct'],
    ['6/8', 'correct'],
    ['0.75', 'correct'],
    ['x = 3/4', 'correct'],
    ['0.7', 'incorrect'],
    ['banana', 'unreadable'],
    ['', 'unreadable'],
  ])('3/4 vs %j is %s', (given, outcome) => {
    expect(checkAnswer(num(3, 4), given)).toBe(outcome);
  });

  it('accepts long decimals within tolerance but not rough ones', () => {
    expect(checkAnswer(num(1, 3), '0.3333333')).toBe('correct');
    expect(checkAnswer(num(1, 3), '0.333')).toBe('incorrect');
  });
});

describe('checkAnswer: expression', () => {
  const twoXPlusTwo: Answer = { type: 'expression', text: '2x+2' };

  it.each([
    ['2(x+1)', 'correct'],
    ['x+x+2', 'correct'],
    ['2x+3', 'incorrect'],
    ['x^2', 'incorrect'],
    ['2x+', 'unreadable'],
    ['   ', 'unreadable'],
  ])('2x+2 vs %j is %s', (given, outcome) => {
    expect(checkAnswer(twoXPlusTwo, given)).toBe(outcome);
  });

  it('accepts a factored form when no form is required', () => {
    expect(checkAnswer({ type: 'expression', text: 'x^2-5x+6' }, '(x-2)(x-3)')).toBe('correct');
  });

  it('enforces simplified form when maxTerms is set', () => {
    const simplified: Answer = { type: 'expression', text: '5x+6', maxTerms: 2 };
    expect(checkAnswer(simplified, '5x + 6')).toBe('correct');
    expect(checkAnswer(simplified, '6 + 5x')).toBe('correct');
    expect(checkAnswer(simplified, '3(x+2)+2x')).toBe('incorrect');
    expect(checkAnswer(simplified, 'x+4x+6')).toBe('incorrect');
  });
});

describe('checkAnswer: set', () => {
  const roots: Answer = { type: 'set', items: [rational(2), rational(3)] };

  it.each([
    ['3, 2', 'correct'],
    ['x = 2, x = 3', 'correct'],
    ['{2, 3}', 'correct'],
    ['2', 'incorrect'],
    ['2, 4', 'incorrect'],
    ['2, banana', 'unreadable'],
  ])('{2, 3} vs %j is %s', (given, outcome) => {
    expect(checkAnswer(roots, given)).toBe(outcome);
  });
});

describe('checkAnswer: point', () => {
  const point: Answer = { type: 'point', coords: [rational(2), rational(-3)] };

  it.each([
    ['(2, -3)', 'correct'],
    ['2,-3', 'correct'],
    ['(-3, 2)', 'incorrect'],
    ['(2)', 'incorrect'],
    ['(a, b)', 'unreadable'],
  ])('(2, -3) vs %j is %s', (given, outcome) => {
    expect(checkAnswer(point, given)).toBe(outcome);
  });
});

describe('checkAnswer: choice', () => {
  const choice: Answer = { type: 'choice', options: ['a', 'b', 'c'], correctIndex: 1 };

  it.each([
    ['1', 'correct'],
    ['0', 'incorrect'],
    ['7', 'unreadable'],
    ['b', 'unreadable'],
  ])('index 1 vs %j is %s', (given, outcome) => {
    expect(checkAnswer(choice, given)).toBe(outcome);
  });
});

describe('answerText', () => {
  it.each<Answer>([
    num(-3, 4),
    { type: 'expression', text: '5x+6', maxTerms: 2 },
    { type: 'set', items: [rational(2), rational(-1, 2)] },
    { type: 'point', coords: [rational(1), rational(5, 3)] },
    { type: 'choice', options: ['a', 'b'], correctIndex: 0 },
  ])('round-trips through checkAnswer (%o)', (answer) => {
    expect(checkAnswer(answer, answerText(answer))).toBe('correct');
  });
});

describe('countTerms', () => {
  it.each([
    ['5x+6', 2],
    ['-x - 4 + 2x', 3],
    ['7', 1],
    ['2x+-3', 2],
  ])('%j has %i terms', (text, count) => {
    expect(countTerms(text)).toBe(count);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test check`
Expected: FAIL. `checkAnswer`, `answerText` and `countTerms` are not exported by the placeholder.

- [ ] **Step 3: Implement `check.ts` (replace the placeholder entirely)**

`packages/math-engine/src/check.ts`:

```ts
import { ComputeEngine } from '@cortex-js/compute-engine';
import { equals, parseRational, toNumber, toText, type Rational } from './rational';

export type Answer =
  | Readonly<{ type: 'number'; value: Rational }>
  | Readonly<{ type: 'expression'; text: string; maxTerms?: number }>
  | Readonly<{ type: 'set'; items: readonly Rational[] }>
  | Readonly<{ type: 'point'; coords: readonly Rational[] }>
  | Readonly<{ type: 'choice'; options: readonly string[]; correctIndex: number }>;

/** `unreadable` means "ask again", never "wrong": malformed input must not cost rating. */
export type CheckOutcome = 'correct' | 'incorrect' | 'unreadable';

const RELATIVE_TOLERANCE = 1e-6;
const SAMPLE_POINTS = [0.7, -1.3, 2.1, 3.7, -0.4];
const VARIABLE_OFFSET = 0.37;
const MIN_COMPARABLE_SAMPLES = 3;

let engine: ComputeEngine | undefined;
const ce = (): ComputeEngine => (engine ??= new ComputeEngine());
type Expr = ReturnType<ComputeEngine['parse']>;

const normalize = (text: string): string =>
  text.trim().replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');

const stripAssignment = (text: string): string => text.replace(/^[a-z]\s*=\s*/i, '');

const closeEnough = (a: number, b: number): boolean =>
  Math.abs(a - b) <= RELATIVE_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));

export const countTerms = (text: string): number =>
  text
    .replace(/\s+/g, '')
    .replace(/^[-+]/, '')
    .split(/[-+]/)
    .filter((term) => term !== '').length;

const splitList = (text: string): string[] =>
  normalize(text)
    .replace(/^[{([]|[})\]]$/g, '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');

function checkNumber(expected: Rational, given: string): CheckOutcome {
  const text = stripAssignment(normalize(given));
  const value = parseRational(text);
  if (value === null) return 'unreadable';
  if (text.includes('.')) {
    return closeEnough(toNumber(value), toNumber(expected)) ? 'correct' : 'incorrect';
  }
  return equals(value, expected) ? 'correct' : 'incorrect';
}

function evaluateAt(expr: Expr, variables: readonly string[], point: number): number {
  const values = Object.fromEntries(variables.map((v, i) => [v, point + i * VARIABLE_OFFSET]));
  return Number(expr.subs(values).N().re);
}

function sampleEqual(a: Expr, b: Expr): boolean {
  const variables = [...new Set([...a.unknowns, ...b.unknowns])].sort();
  let comparable = 0;
  for (const point of SAMPLE_POINTS) {
    const x = evaluateAt(a, variables, point);
    const y = evaluateAt(b, variables, point);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!closeEnough(x, y)) return false;
    comparable += 1;
  }
  return comparable >= MIN_COMPARABLE_SAMPLES;
}

function checkExpression(expected: string, given: string, maxTerms?: number): CheckOutcome {
  const text = normalize(given);
  if (text === '') return 'unreadable';
  const parsed = ce().parse(text);
  if (!parsed.isValid) return 'unreadable';
  if (maxTerms !== undefined && (text.includes('(') || countTerms(text) > maxTerms)) {
    return 'incorrect';
  }
  const target = ce().parse(expected);
  const identical = target.isIdenticallyEqual(parsed);
  if (identical !== undefined) return identical ? 'correct' : 'incorrect';
  return sampleEqual(target, parsed) ? 'correct' : 'incorrect';
}

function parseAll(parts: readonly string[]): Rational[] | null {
  const values = parts.map((part) => parseRational(stripAssignment(part)));
  return values.length === 0 || values.some((v) => v === null) ? null : (values as Rational[]);
}

function checkSet(expected: readonly Rational[], given: string): CheckOutcome {
  const values = parseAll(splitList(given));
  if (values === null) return 'unreadable';
  if (values.length !== expected.length) return 'incorrect';
  const remaining = [...values];
  for (const item of expected) {
    const index = remaining.findIndex((v) => equals(v, item));
    if (index < 0) return 'incorrect';
    remaining.splice(index, 1);
  }
  return 'correct';
}

function checkPoint(expected: readonly Rational[], given: string): CheckOutcome {
  const values = parseAll(splitList(given));
  if (values === null) return 'unreadable';
  if (values.length !== expected.length) return 'incorrect';
  return values.every((v, i) => equals(v, expected[i] as Rational)) ? 'correct' : 'incorrect';
}

function checkChoice(optionCount: number, correctIndex: number, given: string): CheckOutcome {
  const text = given.trim();
  const index = Number(text);
  if (text === '' || !Number.isInteger(index) || index < 0 || index >= optionCount) {
    return 'unreadable';
  }
  return index === correctIndex ? 'correct' : 'incorrect';
}

export function checkAnswer(expected: Answer, given: string): CheckOutcome {
  switch (expected.type) {
    case 'number':
      return checkNumber(expected.value, given);
    case 'expression':
      return checkExpression(expected.text, given, expected.maxTerms);
    case 'set':
      return checkSet(expected.items, given);
    case 'point':
      return checkPoint(expected.coords, given);
    case 'choice':
      return checkChoice(expected.options.length, expected.correctIndex, given);
  }
}

/** Canonical input that `checkAnswer` accepts (UI shows `options[correctIndex]` for choices). */
export function answerText(answer: Answer): string {
  switch (answer.type) {
    case 'number':
      return toText(answer.value);
    case 'expression':
      return answer.text;
    case 'set':
      return answer.items.map(toText).join(', ');
    case 'point':
      return `(${answer.coords.map(toText).join(', ')})`;
    case 'choice':
      return String(answer.correctIndex);
  }
}
```

Append to `src/index.ts`:

```ts
export * from './check';
```

- [ ] **Step 4: Run the tests, typecheck and coverage**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS. If the Compute Engine typings reject `expr.subs(values)` or `.re`, change only the type annotations (not the behavior) and record a ruling.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add CAS-backed answer checker with form and readability rules"
```

---

### Task 4: Knowledge graph + Ontario L0–L2 curriculum

**Files:**

- Create: `src/graph.ts`, `src/curriculum.ts`, `test/graph.test.ts`, `test/curriculum.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `Topic`, `Gate`, `LevelId` (Task 2); `Result`, `ok`, `err` from `@futureflow/core`.
- Produces:
  - `type KnowledgeGraph = Readonly<{ topics: readonly Topic[] }>` (topics in teaching order; each prerequisite must appear earlier)
  - `type GraphError = 'duplicate_topic' | 'unknown_prerequisite' | 'prerequisite_out_of_order'`
  - `validateGraph(graph): Result<KnowledgeGraph, GraphError>`
  - `isUnlocked(graph, topicId: string, mastered: ReadonlySet<string>): boolean`
  - `frontier(graph, mastered: ReadonlySet<string>): Topic[]` (unlocked and not mastered, in graph order)
  - `ONTARIO_GRAPH: KnowledgeGraph`, `GATES: readonly Gate[]`

Curriculum source: verified 2026-10-08. MTH1W strands are Number, Algebra, Data, Geometry & Measurement, Financial Literacy. MPM2D strands are Quadratic Relations, Analytic Geometry, Trigonometry ([TVO MTH1W](https://tvolearn.com/products/mth1w-mathematics), [TVO MPM2D](https://ontariocoursepreview.tvo.org/products/mpm2d-principles-of-mathematics)).

- [ ] **Step 1: Write the failing tests**

`packages/math-engine/test/graph.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { frontier, isUnlocked, validateGraph, type KnowledgeGraph } from '../src/graph';
import type { Topic } from '../src/types';

const t = (id: string, prerequisites: string[] = []): Topic => ({
  id,
  level: 'L0',
  title: id,
  prerequisites,
});
const graph: KnowledgeGraph = {
  topics: [t('a'), t('b', ['a']), t('c', ['a']), t('d', ['b', 'c'])],
};

describe('validateGraph', () => {
  it('accepts a graph whose prerequisites come first', () => {
    expect(validateGraph(graph)).toEqual({ ok: true, value: graph });
  });

  it.each([
    ['duplicate_topic', [t('a'), t('a')]],
    ['unknown_prerequisite', [t('a', ['zzz'])]],
    ['prerequisite_out_of_order', [t('b', ['a']), t('a')]],
    ['prerequisite_out_of_order', [t('a', ['a'])]],
  ])('reports %s', (error, topics) => {
    expect(validateGraph({ topics })).toEqual({ ok: false, error });
  });
});

describe('isUnlocked / frontier', () => {
  it('unlocks a topic only when all prerequisites are mastered', () => {
    expect(isUnlocked(graph, 'd', new Set(['a', 'b']))).toBe(false);
    expect(isUnlocked(graph, 'd', new Set(['a', 'b', 'c']))).toBe(true);
    expect(isUnlocked(graph, 'missing', new Set())).toBe(false);
  });

  it('lists unlocked, unmastered topics in graph order', () => {
    expect(frontier(graph, new Set()).map((x) => x.id)).toEqual(['a']);
    expect(frontier(graph, new Set(['a'])).map((x) => x.id)).toEqual(['b', 'c']);
    expect(frontier(graph, new Set(['a', 'b', 'c', 'd']))).toEqual([]);
  });
});
```

`packages/math-engine/test/curriculum.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GATES, ONTARIO_GRAPH } from '../src/curriculum';
import { validateGraph } from '../src/graph';

describe('ONTARIO_GRAPH', () => {
  it('is a valid graph', () => {
    expect(validateGraph(ONTARIO_GRAPH).ok).toBe(true);
  });

  it('starts from arithmetic and covers L0, L1 and L2 in order', () => {
    const levels = ONTARIO_GRAPH.topics.map((topic) => topic.level);
    expect(ONTARIO_GRAPH.topics[0]?.id).toBe('whole-number-operations');
    expect([...new Set(levels)]).toEqual(['L0', 'L1', 'L2']);
  });

  it('includes the MPM2D strands', () => {
    const ids = ONTARIO_GRAPH.topics.map((topic) => topic.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'quadratic-relations',
        'analytic-geometry',
        'right-triangle-trigonometry',
      ]),
    );
  });
});

describe('GATES', () => {
  it('requires 2 passes at 75% for gate A and 3 at 80% for challenge gates', () => {
    expect(GATES.find((g) => g.id === 'A')).toEqual({
      id: 'A',
      level: 'L2',
      minScore: 0.75,
      requiredPasses: 2,
    });
    expect(
      GATES.filter((g) => g.id !== 'A').every((g) => g.minScore === 0.8 && g.requiredPasses === 3),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test graph curriculum`
Expected: FAIL, cannot resolve `../src/graph` and `../src/curriculum`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/graph.ts`:

```ts
import { err, ok, type Result } from '@futureflow/core';
import type { Topic } from './types';

/** Topics in teaching order; every prerequisite appears earlier (so the graph is acyclic). */
export type KnowledgeGraph = Readonly<{ topics: readonly Topic[] }>;

export type GraphError = 'duplicate_topic' | 'unknown_prerequisite' | 'prerequisite_out_of_order';

export function validateGraph(graph: KnowledgeGraph): Result<KnowledgeGraph, GraphError> {
  const all = new Set(graph.topics.map((topic) => topic.id));
  if (all.size !== graph.topics.length) return err('duplicate_topic');
  const seen = new Set<string>();
  for (const topic of graph.topics) {
    for (const prerequisite of topic.prerequisites) {
      if (!all.has(prerequisite)) return err('unknown_prerequisite');
      if (!seen.has(prerequisite)) return err('prerequisite_out_of_order');
    }
    seen.add(topic.id);
  }
  return ok(graph);
}

export function isUnlocked(
  graph: KnowledgeGraph,
  topicId: string,
  mastered: ReadonlySet<string>,
): boolean {
  const topic = graph.topics.find((t) => t.id === topicId);
  return topic !== undefined && topic.prerequisites.every((p) => mastered.has(p));
}

export const frontier = (graph: KnowledgeGraph, mastered: ReadonlySet<string>): Topic[] =>
  graph.topics.filter((t) => !mastered.has(t.id) && t.prerequisites.every((p) => mastered.has(p)));
```

`packages/math-engine/src/curriculum.ts`:

```ts
import type { KnowledgeGraph } from './graph';
import type { Gate, LevelId, Topic } from './types';

const topic = (id: string, level: LevelId, title: string, prerequisites: string[] = []): Topic => ({
  id,
  level,
  title,
  prerequisites,
});

/** Arithmetic → Grade 9 (MTH1W) → Grade 10 (MPM2D). L3–L5 are added in P7. */
export const ONTARIO_GRAPH: KnowledgeGraph = {
  topics: [
    // L0 — arithmetic foundations
    topic('whole-number-operations', 'L0', 'Whole-number operations'),
    topic('integers', 'L0', 'Integers (negative numbers)', ['whole-number-operations']),
    topic('order-of-operations', 'L0', 'Order of operations', ['integers']),
    topic('factors-and-multiples', 'L0', 'Factors, multiples, primes', ['whole-number-operations']),
    topic('fractions', 'L0', 'Fractions', ['factors-and-multiples', 'integers']),
    topic('decimals', 'L0', 'Decimals', ['fractions']),
    topic('percents', 'L0', 'Percents', ['decimals']),
    topic('ratios-and-rates', 'L0', 'Ratios, rates, proportions', ['fractions']),
    topic('exponents-and-roots', 'L0', 'Exponents and square roots', ['order-of-operations']),
    // L1 — Grade 9 MTH1W: Number, Algebra, Data, Geometry & Measurement, Financial Literacy
    topic('algebraic-expressions', 'L1', 'Algebraic expressions', [
      'order-of-operations',
      'exponents-and-roots',
    ]),
    topic('linear-equations', 'L1', 'Linear equations', ['algebraic-expressions', 'fractions']),
    topic('linear-inequalities', 'L1', 'Linear inequalities', ['linear-equations']),
    topic('linear-relations', 'L1', 'Linear relations, slope, y = mx + b', [
      'linear-equations',
      'ratios-and-rates',
    ]),
    topic('exponent-laws', 'L1', 'Exponent laws', ['exponents-and-roots', 'algebraic-expressions']),
    topic('measurement-and-geometry', 'L1', 'Area, volume, Pythagorean theorem', [
      'exponents-and-roots',
      'fractions',
    ]),
    topic('data-and-statistics', 'L1', 'Data and statistics', ['decimals', 'percents']),
    topic('financial-literacy', 'L1', 'Financial literacy (interest, budgets)', ['percents']),
    // L2 — Grade 10 MPM2D: Quadratic Relations, Analytic Geometry, Trigonometry
    topic('linear-systems', 'L2', 'Linear systems', ['linear-relations']),
    topic('analytic-geometry', 'L2', 'Analytic geometry', [
      'linear-relations',
      'measurement-and-geometry',
    ]),
    topic('polynomial-operations', 'L2', 'Expanding polynomials', ['exponent-laws']),
    topic('factoring', 'L2', 'Factoring', ['polynomial-operations', 'factors-and-multiples']),
    topic('quadratic-relations', 'L2', 'Quadratic relations and transformations', [
      'factoring',
      'linear-relations',
    ]),
    topic('quadratic-equations', 'L2', 'Solving quadratic equations', ['factoring']),
    topic('similar-triangles', 'L2', 'Similar triangles', [
      'ratios-and-rates',
      'measurement-and-geometry',
    ]),
    topic('right-triangle-trigonometry', 'L2', 'Right-triangle trigonometry', [
      'similar-triangles',
    ]),
    topic('sine-and-cosine-laws', 'L2', 'Sine law and cosine law', ['right-triangle-trigonometry']),
  ],
};

export const GATES: readonly Gate[] = [
  { id: 'A', level: 'L2', minScore: 0.75, requiredPasses: 2 },
  { id: 'B1', level: 'L3', minScore: 0.8, requiredPasses: 3 },
  { id: 'B2', level: 'L4', minScore: 0.8, requiredPasses: 3 },
  { id: 'B3', level: 'L5', minScore: 0.8, requiredPasses: 3 },
];
```

Append to `src/index.ts`:

```ts
export * from './graph';
export * from './curriculum';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test graph curriculum`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add knowledge graph and Ontario L0-L2 curriculum"
```

---

### Task 5: Elo ratings + mastery and spaced review

**Files:**

- Create: `src/elo.ts`, `src/mastery.ts`, `test/elo.test.ts`, `test/mastery.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `Difficulty` (Task 2); `DayKey`, `addDays` from `@futureflow/core`.
- Produces:
  - `ELO_SCALE = 400`, `DEFAULT_K = 32`, `INITIAL_LEARNER_RATING = 1000`, `PLACED_RATING = 1200`
  - `expectedScore(learner: number, item: number): number`
  - `updateRatings(learner: number, item: number, correct: boolean, k = DEFAULT_K): Readonly<{ learner: number; item: number }>`
  - `initialItemRating(d: Difficulty): number` (`600 + 200·d`, so 800…1600)
  - `type TopicProgress = Readonly<{ topicId: string; rating: number; streak: number; mastered: boolean; reviewStage: number; nextReviewDay?: DayKey }>`
  - `REVIEW_INTERVALS_DAYS = [1, 3, 7, 16, 35] as const`, `MASTERY_STREAK = 5`
  - `newProgress(topicId: string, rating = INITIAL_LEARNER_RATING): TopicProgress`
  - `type AttemptOutcome = Readonly<{ correct: boolean; usedHints: boolean; isReview: boolean }>`
  - `recordAttempt(p: TopicProgress, outcome: AttemptOutcome, rating: number, today: DayKey): TopicProgress`
  - `isReviewDue(p: TopicProgress, today: DayKey): boolean`

- [ ] **Step 1: Write the failing tests**

`packages/math-engine/test/elo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expectedScore, initialItemRating, updateRatings } from '../src/elo';

describe('expectedScore', () => {
  it('is 0.5 for equal ratings and about 0.91 for a 400-point lead', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(expectedScore(1400, 1000)).toBeCloseTo(0.909, 3);
  });
});

describe('updateRatings', () => {
  it('moves learner and item by the same amount in opposite directions', () => {
    expect(updateRatings(1000, 1000, true)).toEqual({ learner: 1016, item: 984 });
    expect(updateRatings(1000, 1000, false)).toEqual({ learner: 984, item: 1016 });
  });

  it('rewards beating a hard item more than an easy one', () => {
    const hard = updateRatings(1000, 1400, true).learner - 1000;
    const easy = updateRatings(1000, 600, true).learner - 1000;
    expect(hard).toBeGreaterThan(easy);
  });
});

describe('initialItemRating', () => {
  it('spreads difficulties from 800 to 1600', () => {
    expect(initialItemRating(1)).toBe(800);
    expect(initialItemRating(5)).toBe(1600);
  });
});
```

`packages/math-engine/test/mastery.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isReviewDue, newProgress, recordAttempt, type TopicProgress } from '../src/mastery';

const practice = { correct: true, usedHints: false, isReview: false };
const TODAY = '2026-10-08';

const answerTimes = (p: TopicProgress, n: number, outcome = practice): TopicProgress =>
  Array.from({ length: n }).reduce<TopicProgress>(
    (acc) => recordAttempt(acc, outcome, 1000, TODAY),
    p,
  );

describe('recordAttempt: practice', () => {
  it('masters a topic after 5 correct answers in a row and schedules the first review', () => {
    const p = answerTimes(newProgress('fractions'), 5);
    expect(p).toMatchObject({
      mastered: true,
      streak: 5,
      reviewStage: 0,
      nextReviewDay: '2026-10-09',
    });
  });

  it('resets the streak on a wrong answer or a hinted answer', () => {
    const four = answerTimes(newProgress('fractions'), 4);
    expect(recordAttempt(four, { ...practice, correct: false }, 990, TODAY).streak).toBe(0);
    expect(recordAttempt(four, { ...practice, usedHints: true }, 990, TODAY).streak).toBe(0);
  });

  it('stores the new rating', () => {
    expect(recordAttempt(newProgress('fractions'), practice, 1016, TODAY).rating).toBe(1016);
  });
});

describe('recordAttempt: reviews', () => {
  const mastered = answerTimes(newProgress('fractions'), 5);
  const review = { correct: true, usedHints: false, isReview: true };

  it('pushes the next review further out after each successful review', () => {
    const once = recordAttempt(mastered, review, 1000, '2026-10-09');
    expect(once).toMatchObject({ reviewStage: 1, nextReviewDay: '2026-10-12' });
  });

  it('graduates after the last interval (no more reviews)', () => {
    const late = { ...mastered, reviewStage: 4, nextReviewDay: '2026-12-01' };
    const done = recordAttempt(late, review, 1000, '2026-12-01');
    expect(done.mastered).toBe(true);
    expect(done.nextReviewDay).toBeUndefined();
    expect(done.reviewStage).toBe(5);
  });

  it('reopens practice when a review is failed', () => {
    const failed = recordAttempt(mastered, { ...review, correct: false }, 950, '2026-10-09');
    expect(failed).toEqual({
      topicId: 'fractions',
      rating: 950,
      streak: 0,
      mastered: false,
      reviewStage: 0,
    });
  });

  it('ignores extra practice on a mastered topic for scheduling', () => {
    const extra = recordAttempt(mastered, { ...practice, correct: false }, 990, TODAY);
    expect(extra).toMatchObject({ mastered: true, nextReviewDay: '2026-10-09', rating: 990 });
  });
});

describe('isReviewDue', () => {
  it('is due on or after the review day, only for mastered topics', () => {
    const mastered = answerTimes(newProgress('fractions'), 5);
    expect(isReviewDue(mastered, '2026-10-08')).toBe(false);
    expect(isReviewDue(mastered, '2026-10-09')).toBe(true);
    expect(isReviewDue(newProgress('fractions'), '2026-10-09')).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test elo mastery`
Expected: FAIL, cannot resolve `../src/elo` and `../src/mastery`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/elo.ts`:

```ts
import type { Difficulty } from './types';

export const ELO_SCALE = 400;
export const DEFAULT_K = 32;
export const INITIAL_LEARNER_RATING = 1000;
export const PLACED_RATING = 1200;

/** Probability the learner answers an item of this rating correctly. */
export const expectedScore = (learner: number, item: number): number =>
  1 / (1 + 10 ** ((item - learner) / ELO_SCALE));

export function updateRatings(
  learner: number,
  item: number,
  correct: boolean,
  k = DEFAULT_K,
): Readonly<{ learner: number; item: number }> {
  const delta = k * ((correct ? 1 : 0) - expectedScore(learner, item));
  return { learner: learner + delta, item: item - delta };
}

export const initialItemRating = (difficulty: Difficulty): number => 600 + 200 * difficulty;
```

`packages/math-engine/src/mastery.ts`:

```ts
import { addDays, type DayKey } from '@futureflow/core';
import { INITIAL_LEARNER_RATING } from './elo';

export type TopicProgress = Readonly<{
  topicId: string;
  rating: number;
  streak: number;
  mastered: boolean;
  reviewStage: number;
  nextReviewDay?: DayKey;
}>;

export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 16, 35] as const;
export const MASTERY_STREAK = 5;

export const newProgress = (topicId: string, rating = INITIAL_LEARNER_RATING): TopicProgress => ({
  topicId,
  rating,
  streak: 0,
  mastered: false,
  reviewStage: 0,
});

export type AttemptOutcome = Readonly<{ correct: boolean; usedHints: boolean; isReview: boolean }>;

export function recordAttempt(
  p: TopicProgress,
  outcome: AttemptOutcome,
  rating: number,
  today: DayKey,
): TopicProgress {
  if (!p.mastered) {
    const streak = outcome.correct && !outcome.usedHints ? p.streak + 1 : 0;
    if (streak < MASTERY_STREAK) return { ...p, rating, streak };
    const nextReviewDay = addDays(today, REVIEW_INTERVALS_DAYS[0]);
    return { ...p, rating, streak, mastered: true, reviewStage: 0, nextReviewDay };
  }
  if (!outcome.isReview) return { ...p, rating };
  if (!outcome.correct) return newProgress(p.topicId, rating);

  const reviewStage = p.reviewStage + 1;
  const interval = REVIEW_INTERVALS_DAYS[reviewStage];
  if (interval === undefined) {
    return { topicId: p.topicId, rating, streak: p.streak, mastered: true, reviewStage };
  }
  return { ...p, rating, reviewStage, nextReviewDay: addDays(today, interval) };
}

export const isReviewDue = (p: TopicProgress, today: DayKey): boolean =>
  p.mastered && p.nextReviewDay !== undefined && p.nextReviewDay <= today;
```

Append to `src/index.ts`:

```ts
export * from './elo';
export * from './mastery';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test elo mastery`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add Elo ratings, mastery streaks and spaced reviews"
```

---

### Task 6: Scheduler: difficulty, earning band, next topic

**Files:**

- Create: `src/scheduler.ts`, `test/scheduler.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `expectedScore`, `initialItemRating` (Task 5); `TopicProgress`, `isReviewDue` (Task 5); `KnowledgeGraph`, `isUnlocked`, `frontier` (Task 4); `Difficulty`, `DIFFICULTIES` (Task 2); `DayKey`.
- Produces:
  - `TARGET_BAND = { min: 0.7, max: 0.85 }`, `TARGET_MIDPOINT = 0.775`, `EARNING_MAX_EXPECTED = 0.9`
  - `pickDifficulty(learnerRating: number, itemRating: (d: Difficulty) => number): Difficulty`: the hardest difficulty inside the band; if none, the one closest to the midpoint
  - `earnsTime(expected: number): boolean` (≤ 0.9)
  - `nextTopic(graph, progress: ReadonlyMap<string, TopicProgress>, today: DayKey, roadmapTopicId?: string): string | null`: due reviews first (earliest), then the roadmap topic if unlocked and unmastered, then the first frontier topic, else `null`

- [ ] **Step 1: Write the failing tests**

`packages/math-engine/test/scheduler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialItemRating } from '../src/elo';
import type { KnowledgeGraph } from '../src/graph';
import { newProgress, type TopicProgress } from '../src/mastery';
import { earnsTime, nextTopic, pickDifficulty } from '../src/scheduler';
import type { Topic } from '../src/types';

describe('pickDifficulty', () => {
  it.each([
    [1000, 1],
    [1400, 3],
    [300, 1],
    [2500, 5],
  ])('learner %i gets difficulty %i', (rating, difficulty) => {
    expect(pickDifficulty(rating, initialItemRating)).toBe(difficulty);
  });
});

describe('earnsTime', () => {
  it('pays only for problems that are not too easy', () => {
    expect(earnsTime(0.9)).toBe(true);
    expect(earnsTime(0.91)).toBe(false);
  });
});

describe('nextTopic', () => {
  const t = (id: string, prerequisites: string[] = []): Topic => ({
    id,
    level: 'L0',
    title: id,
    prerequisites,
  });
  const graph: KnowledgeGraph = { topics: [t('a'), t('b', ['a']), t('c', ['a']), t('d', ['b'])] };
  const mastered = (id: string, nextReviewDay: string): TopicProgress => ({
    ...newProgress(id),
    mastered: true,
    nextReviewDay,
  });
  const TODAY = '2026-10-08';

  it('starts at the first topic for a new learner', () => {
    expect(nextTopic(graph, new Map(), TODAY)).toBe('a');
  });

  it('serves the earliest due review first', () => {
    const progress = new Map([
      ['a', mastered('a', '2026-10-07')],
      ['b', mastered('b', '2026-10-05')],
    ]);
    expect(nextTopic(graph, progress, TODAY)).toBe('b');
  });

  it('prefers the roadmap topic when it is unlocked', () => {
    const progress = new Map([['a', mastered('a', '2026-11-01')]]);
    expect(nextTopic(graph, progress, TODAY, 'c')).toBe('c');
  });

  it('ignores a locked roadmap topic and falls back to the frontier', () => {
    const progress = new Map([['a', mastered('a', '2026-11-01')]]);
    expect(nextTopic(graph, progress, TODAY, 'd')).toBe('b');
  });

  it('returns null when everything is mastered and nothing is due', () => {
    const progress = new Map(graph.topics.map((x) => [x.id, mastered(x.id, '2026-12-01')]));
    expect(nextTopic(graph, progress, TODAY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test scheduler`
Expected: FAIL, cannot resolve `../src/scheduler`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/scheduler.ts`:

```ts
import type { DayKey } from '@futureflow/core';
import { expectedScore } from './elo';
import { frontier, isUnlocked, type KnowledgeGraph } from './graph';
import { isReviewDue, type TopicProgress } from './mastery';
import { DIFFICULTIES, type Difficulty } from './types';

/** Desirable difficulty: fastest learning happens at a high-but-imperfect success rate. */
export const TARGET_BAND = { min: 0.7, max: 0.85 } as const;
export const TARGET_MIDPOINT = 0.775;
export const EARNING_MAX_EXPECTED = 0.9;

export function pickDifficulty(
  learnerRating: number,
  itemRating: (difficulty: Difficulty) => number,
): Difficulty {
  const scored = DIFFICULTIES.map((d) => ({ d, p: expectedScore(learnerRating, itemRating(d)) }));
  const inBand = scored.filter((s) => s.p >= TARGET_BAND.min && s.p <= TARGET_BAND.max);
  if (inBand.length > 0) return inBand.reduce((hardest, s) => (s.p < hardest.p ? s : hardest)).d;
  const distance = (p: number): number => Math.abs(p - TARGET_MIDPOINT);
  return scored.reduce((best, s) => (distance(s.p) < distance(best.p) ? s : best)).d;
}

/** Problems you'd almost surely get right are practice, not work: they earn no phone time. */
export const earnsTime = (expected: number): boolean => expected <= EARNING_MAX_EXPECTED;

export function nextTopic(
  graph: KnowledgeGraph,
  progress: ReadonlyMap<string, TopicProgress>,
  today: DayKey,
  roadmapTopicId?: string,
): string | null {
  const due = [...progress.values()].filter((p) => isReviewDue(p, today));
  if (due.length > 0) {
    return due.reduce((first, p) =>
      (p.nextReviewDay ?? '') < (first.nextReviewDay ?? '') ? p : first,
    ).topicId;
  }
  const mastered = new Set([...progress.values()].filter((p) => p.mastered).map((p) => p.topicId));
  if (
    roadmapTopicId !== undefined &&
    !mastered.has(roadmapTopicId) &&
    isUnlocked(graph, roadmapTopicId, mastered)
  ) {
    return roadmapTopicId;
  }
  return frontier(graph, mastered)[0]?.id ?? null;
}
```

Append to `src/index.ts`:

```ts
export * from './scheduler';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test scheduler`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add difficulty targeting, earning band and topic scheduling"
```

---

### Task 7: Placement (binary search)

**Files:**

- Create: `src/placement.ts`, `test/placement.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `KnowledgeGraph` (Task 4); `TopicProgress`, `newProgress` (Task 5); `PLACED_RATING` (Task 5); `DayKey`.
- Produces:
  - `QUESTIONS_PER_PROBE = 2`
  - `type PlacementState = Readonly<{ low: number; high: number; correctAtProbe: number }>`
  - `startPlacement(topicCount: number): PlacementState`
  - `placementProbe(s): number | null` (index into `graph.topics`; `null` when done)
  - `recordPlacementAnswer(s, correct: boolean): PlacementState`
  - `placementProgress(graph, s, today: DayKey): ReadonlyMap<string, TopicProgress>`: topics before `low` are mastered at `PLACED_RATING` with a review due `today`

- [ ] **Step 1: Write the failing tests**

`packages/math-engine/test/placement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { KnowledgeGraph } from '../src/graph';
import {
  placementProbe,
  placementProgress,
  recordPlacementAnswer,
  startPlacement,
  type PlacementState,
} from '../src/placement';

/** Simulates a learner who knows exactly the first `known` topics. */
function run(topicCount: number, known: number): { state: PlacementState; asked: number } {
  let state = startPlacement(topicCount);
  let asked = 0;
  for (let probe = placementProbe(state); probe !== null; probe = placementProbe(state)) {
    state = recordPlacementAnswer(state, probe < known);
    asked += 1;
  }
  return { state, asked };
}

describe('placement', () => {
  it.each([
    [8, 0, 4],
    [8, 8, 6],
    [8, 3, 4],
    [26, 13, 10],
  ])('with %i topics and %i known, finds the frontier', (topics, known, maxAsked) => {
    const { state, asked } = run(topics, known);
    expect(state.low).toBe(known);
    expect(asked).toBeLessThanOrEqual(maxAsked);
  });

  it('asks nothing for an empty graph', () => {
    expect(placementProbe(startPlacement(0))).toBeNull();
  });

  it('ignores answers after placement is done', () => {
    const done = run(4, 4).state;
    expect(recordPlacementAnswer(done, false)).toBe(done);
  });

  it('marks topics before the frontier as mastered with a review due today', () => {
    const graph: KnowledgeGraph = {
      topics: ['a', 'b', 'c'].map((id) => ({ id, level: 'L0', title: id, prerequisites: [] })),
    };
    const progress = placementProgress(graph, { low: 2, high: 2, correctAtProbe: 0 }, '2026-10-08');
    expect(progress.get('a')).toMatchObject({
      mastered: true,
      rating: 1200,
      nextReviewDay: '2026-10-08',
    });
    expect(progress.get('b')?.mastered).toBe(true);
    expect(progress.get('c')).toMatchObject({ mastered: false, rating: 1000 });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test placement`
Expected: FAIL, cannot resolve `../src/placement`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/placement.ts`:

```ts
import type { DayKey } from '@futureflow/core';
import { PLACED_RATING } from './elo';
import type { KnowledgeGraph } from './graph';
import { newProgress, type TopicProgress } from './mastery';

export const QUESTIONS_PER_PROBE = 2;

/** Binary search for the first topic the learner does not know: [low, high) is still unknown. */
export type PlacementState = Readonly<{ low: number; high: number; correctAtProbe: number }>;

export const startPlacement = (topicCount: number): PlacementState => ({
  low: 0,
  high: topicCount,
  correctAtProbe: 0,
});

export const placementProbe = (s: PlacementState): number | null =>
  s.low >= s.high ? null : Math.floor((s.low + s.high) / 2);

/** One wrong answer marks the probe unknown; QUESTIONS_PER_PROBE right answers mark it known. */
export function recordPlacementAnswer(s: PlacementState, correct: boolean): PlacementState {
  const probe = placementProbe(s);
  if (probe === null) return s;
  if (!correct) return { low: s.low, high: probe, correctAtProbe: 0 };
  const streak = s.correctAtProbe + 1;
  if (streak < QUESTIONS_PER_PROBE) return { ...s, correctAtProbe: streak };
  return { low: probe + 1, high: s.high, correctAtProbe: 0 };
}

/** Assumed-known topics get a review due today, so a wrong assumption is caught immediately. */
export function placementProgress(
  graph: KnowledgeGraph,
  s: PlacementState,
  today: DayKey,
): ReadonlyMap<string, TopicProgress> {
  return new Map(
    graph.topics.map((topic, index): [string, TopicProgress] => [
      topic.id,
      index < s.low
        ? { ...newProgress(topic.id, PLACED_RATING), mastered: true, nextReviewDay: today }
        : newProgress(topic.id),
    ]),
  );
}
```

Append to `src/index.ts`:

```ts
export * from './placement';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test placement`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add binary-search placement with day-0 verification reviews"
```

---

### Task 8: L0 generators + registry + CAS oracle

**Files:**

- Create: `src/generators/integers.ts`, `src/generators/fractions.ts`, `src/generators/order-of-operations.ts`, `src/generators/registry.ts`, `test/oracle.ts`, `test/generators-l0.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `createRng` (Task 2); `rational`, `add`, `lcm`, `toText`, `toNumber` (Task 1); `signed` (Task 2); `Generator`, `Problem`, `Difficulty`, `DIFFICULTIES` (Task 2); `checkAnswer`, `answerText` (Task 3); `ONTARIO_GRAPH` (Task 4).
- Produces: `integersGenerator`, `fractionsGenerator`, `orderOfOperationsGenerator`; `type GeneratorRegistry = ReadonlyMap<string, Generator>`; `createRegistry(generators): GeneratorRegistry` (throws on duplicate topic); `DEFAULT_REGISTRY`. Test helpers: `promptMath(prompt)`, `evaluate(text)`, `seedAndDifficulty` (fast-check arbitrary).

Prompt convention: `"<Instruction>: <math>"`. The math after the first `": "` uses `×`, `÷`, `²`, which `promptMath` converts for the CAS.

- [ ] **Step 1: Write the oracle helpers and the failing tests**

`packages/math-engine/test/oracle.ts`:

```ts
import { ComputeEngine } from '@cortex-js/compute-engine';
import fc from 'fast-check';
import { DIFFICULTIES } from '../src/types';

const ce = new ComputeEngine();

/** The math part of a prompt, rewritten for the CAS ("Calculate: 3 × 4²" → "3 * 4^2"). */
export const promptMath = (prompt: string): string =>
  prompt
    .slice(prompt.indexOf(': ') + 2)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/²/g, '^2');

/** Numeric value of a CAS-parseable expression, optionally substituting variables. */
export const evaluate = (text: string, values: Record<string, number> = {}): number =>
  Number(ce.parse(text).subs(values).N().re);

export const identicallyEqual = (a: string, b: string): boolean | undefined =>
  ce.parse(a).isIdenticallyEqual(ce.parse(b));

export const seedAndDifficulty = fc.tuple(
  fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  fc.constantFrom(...DIFFICULTIES),
);

export const RUNS = { numRuns: 200 };
```

`packages/math-engine/test/generators-l0.test.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { answerText, checkAnswer } from '../src/check';
import { ONTARIO_GRAPH } from '../src/curriculum';
import { fractionsGenerator } from '../src/generators/fractions';
import { integersGenerator } from '../src/generators/integers';
import { orderOfOperationsGenerator } from '../src/generators/order-of-operations';
import { createRegistry, DEFAULT_REGISTRY } from '../src/generators/registry';
import { gcd, toNumber } from '../src/rational';
import type { Generator } from '../src/types';
import { evaluate, promptMath, RUNS, seedAndDifficulty } from './oracle';

const numericGenerators: Generator[] = [
  integersGenerator,
  fractionsGenerator,
  orderOfOperationsGenerator,
];

describe.each(numericGenerators)('$topicId generator', (generator) => {
  it('is deterministic for a seed', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        expect(generator.generate(seed, d)).toEqual(generator.generate(seed, d));
      }),
      RUNS,
    );
  });

  it('gives an answer the CAS agrees with, in lowest terms', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = generator.generate(seed, d);
        if (problem.answer.type !== 'number') throw new Error('expected a number answer');
        expect(evaluate(promptMath(problem.prompt))).toBeCloseTo(toNumber(problem.answer.value), 9);
        expect(gcd(problem.answer.value.num, problem.answer.value.den)).toBe(1);
      }),
      RUNS,
    );
  });

  it('accepts its own canonical answer and ships hints and steps', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = generator.generate(seed, d);
        expect(checkAnswer(problem.answer, answerText(problem.answer))).toBe('correct');
        expect(problem.hints.length).toBeGreaterThan(0);
        expect(problem.steps.length).toBeGreaterThan(0);
        expect(problem).toMatchObject({ topicId: generator.topicId, seed, difficulty: d });
      }),
      RUNS,
    );
  });
});

describe('registry', () => {
  it('maps every generator to a topic in the curriculum', () => {
    const ids = new Set(ONTARIO_GRAPH.topics.map((t) => t.id));
    expect([...DEFAULT_REGISTRY.keys()].every((id) => ids.has(id))).toBe(true);
  });

  it('rejects two generators for one topic', () => {
    expect(() => createRegistry([integersGenerator, integersGenerator])).toThrow();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test generators-l0`
Expected: FAIL, cannot resolve `../src/generators/fractions` (and the others).

- [ ] **Step 3: Implement the generators and registry**

`packages/math-engine/src/generators/integers.ts`:

```ts
import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator } from '../types';

const show = (n: number): string => (n < 0 ? `(${n})` : String(n));

export const integersGenerator: Generator = {
  topicId: 'integers',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const limit = 5 * difficulty + 5;
    const a = rng.int(-limit, limit);
    const b = rng.int(-limit, limit);
    const op = rng.pick(['+', '-', '×'] as const);
    const value = op === '+' ? a + b : op === '-' ? a - b : a * b;
    const steps =
      op === '-'
        ? [`${show(a)} - ${show(b)} = ${show(a)} + ${show(-b)}`, `= ${value + 0}`]
        : [`${show(a)} ${op} ${show(b)} = ${value + 0}`];
    return {
      topicId: 'integers',
      seed,
      difficulty,
      prompt: `Calculate: ${show(a)} ${op} ${show(b)}`,
      answer: { type: 'number', value: rational(value) },
      hints: [
        op === '×'
          ? 'Same signs give a positive product; different signs give a negative product.'
          : 'Subtracting a number is the same as adding its opposite.',
      ],
      steps,
    };
  },
};
```

`packages/math-engine/src/generators/fractions.ts`:

```ts
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
      prompt: `Calculate and simplify: ${a}/${b} ${op} ${c}/${d}`,
      answer: { type: 'number', value },
      hints: [
        'Rewrite both fractions with the same denominator first.',
        `A common denominator of ${b} and ${d} is ${common}.`,
      ],
      steps: [
        `${a}/${b} ${op} ${c}/${d} = ${left}/${common} ${op} ${right}/${common}`,
        `= ${combined}/${common}`,
        `= ${toText(value)}`,
      ],
    };
  },
};
```

`packages/math-engine/src/generators/order-of-operations.ts`:

```ts
import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

const HINT =
  'Order: brackets, exponents, multiplication and division (left to right), then addition and subtraction.';

export const orderOfOperationsGenerator: Generator = {
  topicId: 'order-of-operations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const max = 4 + 3 * difficulty;
    const base = { topicId: 'order-of-operations', seed, difficulty, hints: [HINT] } as const;
    const make = (prompt: string, value: number, steps: string[]): Problem => ({
      ...base,
      prompt: `Calculate: ${prompt}`,
      answer: { type: 'number', value: rational(value) },
      steps,
    });

    if (difficulty === 1) {
      const [a, b, c] = [rng.int(1, max), rng.int(1, max), rng.int(1, max)];
      return make(`${a} + ${b} × ${c}`, a + b * c, [
        `Multiply first: ${b} × ${c} = ${b * c}`,
        `Then add: ${a} + ${b * c} = ${a + b * c}`,
      ]);
    }
    if (difficulty === 2) {
      const [a, b, c, d] = [rng.int(1, max), rng.int(1, max), rng.int(1, max), rng.int(1, max)];
      const value = (a + b) * c - d;
      return make(`(${a} + ${b}) × ${c} - ${d}`, value, [
        `Brackets first: ${a} + ${b} = ${a + b}`,
        `Multiply: ${a + b} × ${c} = ${(a + b) * c}`,
        `Subtract: ${(a + b) * c} - ${d} = ${value}`,
      ]);
    }
    const c = rng.pick([1, 2, 4]);
    const b = c * rng.int(1, difficulty + 1);
    const a = rng.int(1, 2 * max);
    const quotient = (b * b) / c;
    return make(`${a} - ${b}² ÷ ${c}`, a - quotient, [
      `Exponent first: ${b}² = ${b * b}`,
      `Divide: ${b * b} ÷ ${c} = ${quotient}`,
      `Subtract: ${a} - ${quotient} = ${a - quotient}`,
    ]);
  },
};
```

`packages/math-engine/src/generators/registry.ts`:

```ts
import type { Generator } from '../types';
import { fractionsGenerator } from './fractions';
import { integersGenerator } from './integers';
import { orderOfOperationsGenerator } from './order-of-operations';

export type GeneratorRegistry = ReadonlyMap<string, Generator>;

export function createRegistry(generators: readonly Generator[]): GeneratorRegistry {
  const ids = generators.map((g) => g.topicId);
  if (new Set(ids).size !== ids.length) throw new Error('two generators for one topic');
  return new Map(generators.map((g) => [g.topicId, g]));
}

export const DEFAULT_REGISTRY: GeneratorRegistry = createRegistry([
  integersGenerator,
  fractionsGenerator,
  orderOfOperationsGenerator,
]);
```

Append to `src/index.ts`:

```ts
export * from './generators/registry';
export * from './generators/integers';
export * from './generators/fractions';
export * from './generators/order-of-operations';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test generators-l0`
Expected: PASS (200 runs × 3 properties × 3 generators). If a property fails, fast-check prints the shrunk seed and difficulty. Fix the generator, not the test.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add L0 generators verified by CAS property tests"
```

---

### Task 9: L1 generators: algebraic expressions, linear equations

**Files:**

- Create: `src/generators/algebraic-expressions.ts`, `src/generators/linear-equations.ts`, `test/generators-l1.test.ts`
- Modify: `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Consumes: Task 8's oracle helpers; `formatLinear`, `signed` (Task 2); `countTerms`, `checkAnswer`, `answerText` (Task 3).
- Produces: `algebraicExpressionsGenerator` (answer `{ type: 'expression', text, maxTerms: 2 }`), `linearEquationsGenerator` (answer `number`, integer solution; at difficulty ≥ 4, x is on both sides); both added to `DEFAULT_REGISTRY`.

- [ ] **Step 1: Write the failing tests**

`packages/math-engine/test/generators-l1.test.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { answerText, checkAnswer, countTerms } from '../src/check';
import { algebraicExpressionsGenerator } from '../src/generators/algebraic-expressions';
import { linearEquationsGenerator } from '../src/generators/linear-equations';
import { DEFAULT_REGISTRY } from '../src/generators/registry';
import { toNumber } from '../src/rational';
import { evaluate, identicallyEqual, promptMath, RUNS, seedAndDifficulty } from './oracle';

describe('algebraic-expressions generator', () => {
  it('answer is identical to the prompt and in simplified form', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = algebraicExpressionsGenerator.generate(seed, d);
        if (problem.answer.type !== 'expression') throw new Error('expected an expression');
        expect(identicallyEqual(promptMath(problem.prompt), problem.answer.text)).toBe(true);
        expect(countTerms(problem.answer.text)).toBeLessThanOrEqual(2);
        expect(problem.answer.text).not.toContain('(');
      }),
      RUNS,
    );
  });

  it('rejects the unsimplified prompt itself as an answer', () => {
    const problem = algebraicExpressionsGenerator.generate(12345, 3);
    expect(checkAnswer(problem.answer, promptMath(problem.prompt))).toBe('incorrect');
  });

  it('is deterministic and accepts its own canonical answer', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = algebraicExpressionsGenerator.generate(seed, d);
        expect(algebraicExpressionsGenerator.generate(seed, d)).toEqual(problem);
        expect(checkAnswer(problem.answer, answerText(problem.answer))).toBe('correct');
      }),
      RUNS,
    );
  });
});

describe('linear-equations generator', () => {
  it('answer satisfies the equation', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearEquationsGenerator.generate(seed, d);
        if (problem.answer.type !== 'number') throw new Error('expected a number');
        const [lhs = '', rhs = ''] = promptMath(problem.prompt).split('=');
        const x = toNumber(problem.answer.value);
        expect(evaluate(lhs, { x })).toBeCloseTo(evaluate(rhs, { x }), 9);
        expect(Number.isInteger(x)).toBe(true);
      }),
      RUNS,
    );
  });

  it('puts x on both sides from difficulty 4', () => {
    const problem = linearEquationsGenerator.generate(7, 4);
    const [, rhs = ''] = promptMath(problem.prompt).split('=');
    expect(rhs).toContain('x');
  });

  it('is deterministic and accepts "x = answer"', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearEquationsGenerator.generate(seed, d);
        expect(linearEquationsGenerator.generate(seed, d)).toEqual(problem);
        expect(checkAnswer(problem.answer, `x = ${answerText(problem.answer)}`)).toBe('correct');
      }),
      RUNS,
    );
  });
});

describe('registry', () => {
  it('includes the L1 generators', () => {
    expect(DEFAULT_REGISTRY.has('algebraic-expressions')).toBe(true);
    expect(DEFAULT_REGISTRY.has('linear-equations')).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test generators-l1`
Expected: FAIL, cannot resolve the two generator modules.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/algebraic-expressions.ts`:

```ts
import { formatLinear, signed } from '../format';
import { createRng } from '../rng';
import type { Generator } from '../types';

const xTerm = (c: number): string =>
  c === 0 ? '' : ` ${c < 0 ? '-' : '+'} ${Math.abs(c) === 1 ? '' : Math.abs(c)}x`;
const constant = (n: number): string => (n === 0 ? '' : ` ${signed(n)}`);

export const algebraicExpressionsGenerator: Generator = {
  topicId: 'algebraic-expressions',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const a = rng.int(2, 1 + difficulty);
    const b = rng.pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
    const c = rng.int(-4, 4);
    const d = rng.int(-9, 9);
    const p = a + c;
    const q = a * b + d;
    const answer = formatLinear(p, q);
    return {
      topicId: 'algebraic-expressions',
      seed,
      difficulty,
      prompt: `Simplify: ${a}(x ${signed(b)})${xTerm(c)}${constant(d)}`,
      answer: { type: 'expression', text: answer, maxTerms: 2 },
      hints: ['Distribute first, then collect the x terms and the number terms separately.'],
      steps: [
        `Distribute: ${a}x ${signed(a * b)}${xTerm(c)}${constant(d)}`,
        `Collect like terms: ${answer}`,
      ],
    };
  },
};
```

`packages/math-engine/src/generators/linear-equations.ts`:

```ts
import { formatLinear } from '../format';
import { rational } from '../rational';
import { createRng } from '../rng';
import type { Generator } from '../types';

export const linearEquationsGenerator: Generator = {
  topicId: 'linear-equations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const nonZero = (limit: number): number => rng.int(1, limit) * (rng.next() < 0.5 ? -1 : 1);
    const x = rng.int(-10, 10);
    const b = rng.int(-15, 15);
    const base = {
      topicId: 'linear-equations',
      seed,
      difficulty,
      answer: { type: 'number', value: rational(x) },
      hints: ['Do the same thing to both sides until x is alone.'],
    } as const;

    if (difficulty < 4) {
      const a = difficulty === 1 ? rng.int(2, 5) : nonZero(4 + difficulty);
      const c = a * x + b;
      return {
        ...base,
        prompt: `Solve for x: ${formatLinear(a, b)} = ${c}`,
        steps: [
          `Subtract ${b} from both sides: ${a}x = ${c - b}`,
          `Divide both sides by ${a}: x = ${x}`,
        ],
      };
    }

    const a = nonZero(6);
    const drawn = nonZero(6);
    const e = drawn === a ? -a : drawn;
    const f = (a - e) * x + b;
    return {
      ...base,
      prompt: `Solve for x: ${formatLinear(a, b)} = ${formatLinear(e, f)}`,
      steps: [
        `Move the x terms to the left: ${formatLinear(a - e, b)} = ${f}`,
        `Subtract ${b} from both sides: ${a - e}x = ${f - b}`,
        `Divide both sides by ${a - e}: x = ${x}`,
      ],
    };
  },
};
```

In `src/generators/registry.ts`, add the imports and register both:

```ts
import { algebraicExpressionsGenerator } from './algebraic-expressions';
import { linearEquationsGenerator } from './linear-equations';
```

```ts
export const DEFAULT_REGISTRY: GeneratorRegistry = createRegistry([
  integersGenerator,
  fractionsGenerator,
  orderOfOperationsGenerator,
  algebraicExpressionsGenerator,
  linearEquationsGenerator,
]);
```

Append to `src/index.ts`:

```ts
export * from './generators/algebraic-expressions';
export * from './generators/linear-equations';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test generators`
Expected: PASS (L0 and L1).

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add L1 expression and linear-equation generators"
```

---

### Task 10: Mock exams and gates

**Files:**

- Create: `src/mock-exam.ts`, `test/mock-exam.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `KnowledgeGraph` (Task 4); `GeneratorRegistry` (Task 8); `createRng` (Task 2); `CheckOutcome` (Task 3); `Gate`, `LevelId`, `Problem`, `Topic`, `Generator` (Task 2); `DayKey`.
- Produces:
  - `MOCK_DIFFICULTY: Difficulty = 3`
  - `type MockExam = Readonly<{ level: LevelId; problems: readonly Problem[] }>`
  - `buildMockExam(graph, registry, level: LevelId, seed: number, size: number): MockExam`: round-robin over the level's topics that have generators, in graph order
  - `scoreMock(outcomes: readonly CheckOutcome[]): number` (0–1; `unreadable` counts as wrong)
  - `type MockResult = Readonly<{ day: DayKey; level: LevelId; score: number }>`
  - `gatePassed(gate: Gate, results: readonly MockResult[]): boolean` (distinct days with score ≥ minScore at the gate's level ≥ requiredPasses)

- [ ] **Step 1: Write the failing tests**

`packages/math-engine/test/mock-exam.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GATES, ONTARIO_GRAPH } from '../src/curriculum';
import { DEFAULT_REGISTRY } from '../src/generators/registry';
import { buildMockExam, gatePassed, scoreMock, type MockResult } from '../src/mock-exam';

const gateA = GATES.find((g) => g.id === 'A');
if (gateA === undefined) throw new Error('gate A missing');

describe('buildMockExam', () => {
  it('covers every L0 topic that has a generator, evenly, at difficulty 3', () => {
    const exam = buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L0', 42, 6);
    expect(exam.problems.map((p) => p.topicId)).toEqual([
      'integers',
      'order-of-operations',
      'fractions',
      'integers',
      'order-of-operations',
      'fractions',
    ]);
    expect(exam.problems.every((p) => p.difficulty === 3)).toBe(true);
  });

  it('is reproducible from its seed', () => {
    const a = buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L1', 7, 4);
    expect(buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L1', 7, 4)).toEqual(a);
  });

  it('is empty for a level without generators or a non-positive size', () => {
    expect(buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L2', 1, 5).problems).toEqual([]);
    expect(buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, 'L0', 1, 0).problems).toEqual([]);
  });
});

describe('scoreMock', () => {
  it('counts unreadable as wrong', () => {
    expect(scoreMock(['correct', 'incorrect', 'unreadable', 'correct'])).toBe(0.5);
    expect(scoreMock([])).toBe(0);
  });
});

describe('gatePassed', () => {
  const pass = (day: string, score = 0.8): MockResult => ({ day, level: 'L2', score });

  it('needs the required passes on distinct days', () => {
    expect(gatePassed(gateA, [pass('2026-10-08'), pass('2026-10-08')])).toBe(false);
    expect(gatePassed(gateA, [pass('2026-10-08'), pass('2026-10-10')])).toBe(true);
  });

  it('ignores low scores and other levels', () => {
    expect(gatePassed(gateA, [pass('2026-10-08', 0.74), pass('2026-10-09')])).toBe(false);
    expect(
      gatePassed(gateA, [{ day: '2026-10-08', level: 'L1', score: 1 }, pass('2026-10-09')]),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test mock-exam`
Expected: FAIL, cannot resolve `../src/mock-exam`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/mock-exam.ts`:

```ts
import type { DayKey } from '@futureflow/core';
import type { CheckOutcome } from './check';
import type { GeneratorRegistry } from './generators/registry';
import type { KnowledgeGraph } from './graph';
import { createRng } from './rng';
import type { Difficulty, Gate, Generator, LevelId, Problem } from './types';

export const MOCK_DIFFICULTY: Difficulty = 3;
const MAX_SEED = 2 ** 31 - 1;

export type MockExam = Readonly<{ level: LevelId; problems: readonly Problem[] }>;

export function buildMockExam(
  graph: KnowledgeGraph,
  registry: GeneratorRegistry,
  level: LevelId,
  seed: number,
  size: number,
): MockExam {
  const generators = graph.topics
    .filter((t) => t.level === level)
    .map((t) => registry.get(t.id))
    .filter((g): g is Generator => g !== undefined);
  if (generators.length === 0 || size <= 0) return { level, problems: [] };
  const rng = createRng(seed);
  const problems = Array.from({ length: size }, (_, i) =>
    (generators[i % generators.length] as Generator).generate(
      rng.int(0, MAX_SEED),
      MOCK_DIFFICULTY,
    ),
  );
  return { level, problems };
}

export const scoreMock = (outcomes: readonly CheckOutcome[]): number =>
  outcomes.length === 0 ? 0 : outcomes.filter((o) => o === 'correct').length / outcomes.length;

export type MockResult = Readonly<{ day: DayKey; level: LevelId; score: number }>;

/** Passing twice on the same day doesn't prove retention, so only distinct days count. */
export function gatePassed(gate: Gate, results: readonly MockResult[]): boolean {
  const passingDays = new Set(
    results.filter((r) => r.level === gate.level && r.score >= gate.minScore).map((r) => r.day),
  );
  return passingDays.size >= gate.requiredPasses;
}
```

Append to `src/index.ts`:

```ts
export * from './mock-exam';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test mock-exam`
Expected: PASS. (The expected topic order in the first test is the graph order of L0 topics that have generators: `integers`, `order-of-operations`, `fractions`.)

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add mock exams and distinct-day gate evaluation"
```

---

### Task 11: Full verification + learning note

- [ ] **Step 1: Run the full CI sequence**

```bash
bun install --frozen-lockfile
bun run format:check && bun run lint && bun run typecheck && bun run coverage
```

Expected: every command exits 0; `math-engine` coverage ≥ 90% on all metrics; core and contracts unchanged and green.

- [ ] **Step 2: Boundary checks**

```bash
grep -rn "Date.now\|Math.random" packages/math-engine/src && echo "VIOLATION" || echo "deterministic"
git log --format='%an <%ae>%n%b' | grep -i "co-authored\|claude" && echo "VIOLATION" || echo "authorship clean"
git status --short
```

Expected: `deterministic`, `authorship clean`, a clean tree.

- [ ] **Step 3: Write `learning/02-p2a-math-engine.md` (not committed)**

Cover: why seeded generators; mulberry32 in one paragraph; how exact rationals avoid float errors; the three checker outcomes and why `unreadable` exists; why the CAS returns `undefined`, and how sampling decides those cases; the `maxTerms` form rule; the Elo formula with a worked example; mastery and spaced intervals; binary-search placement walked through for "knows 13 of 26"; why gates count distinct days; property-based testing with fast-check and why the CAS is an _oracle_; and 6 self-check questions. Confirm with `git status` that it doesn't appear.
