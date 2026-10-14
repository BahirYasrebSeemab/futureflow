# Future Flow P2b: Complete L0 (Arithmetic) Generators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every L0 topic in `ONTARIO_GRAPH` a generator, so the arithmetic level is fully practicable and placement can probe any L0 topic. Also apply the L0 polish items deferred from the P2a review.

**Architecture:** Six new pure generators in `packages/math-engine/src/generators/`. A shared **generator contract** test helper checks every generator for determinism, lowest-terms answers, a canonical answer that round-trips through the checker, non-empty hints and steps, and correct metadata. Each generator also gets its own **independent oracle** test: the CAS evaluating the prompt where the prompt is math, or brute-force arithmetic parsed from the prompt where it's a word question.

**Tech Stack:** Bun, TypeScript 6, Vitest 5, fast-check, @cortex-js/compute-engine, @futureflow/core.

**Spec:** `docs/superpowers/specs/2026-10-08-futureflow-v1-design.md` §10.1–10.3, §15 (P2b); ADR 0005.

## Global Constraints

- Run package scripts as `bun run --cwd packages/math-engine <script>`; tools via `bun x`.
- No `Date.now()` or `Math.random()` in `src/`. Randomness only via `createRng(seed)`.
- Generators are pure `(seed, difficulty) → Problem`. Answers are exact `Rational`s (lowest terms by construction).
- Every generator must pass the shared wording test (`test/wording.test.ts`), which this plan extends with `÷ 1` and `× 1`.
- Coverage ≥ 90% for `math-engine`. Conventional commits under the owner's identity. **No AI attribution.**

## Review Focus

1. **A learner types a percent answer with the sign** (`25%`): must be correct. Pinned in Task 1.
2. **A decimal answer typed in either form** (`4.25` or `17/4`): must be correct. Pinned in Task 4 through the contract round-trip and an explicit test.
3. **Prompts or steps containing `÷ 1`, `× 1`, `Subtract -` or `1x`:** never generated. Pinned by the wording test over the whole registry (Tasks 1 and 8).
4. **A subtraction problem whose answer would be negative at L0 whole-number or decimal level:** must not happen. Arithmetic before integers stays non-negative. Pinned in Tasks 2 and 4.
5. **Mock exams of L0 once all 9 topics have generators:** must still be even and reproducible. The mock test must not hard-code registry contents. Pinned in Task 1 (explicit registry) and Task 8.

---

## File Structure

```
packages/math-engine/
├─ src/
│  ├─ rational.ts                 + mul()
│  ├─ format.ts                   + decimalText()
│  ├─ check.ts                    cleanNumber also strips a trailing "%"
│  └─ generators/
│     ├─ integers.ts              hint matches the operation
│     ├─ order-of-operations.ts   divisor from [2, 3, 4] (no ÷ 1)
│     ├─ whole-number-operations.ts   (new)
│     ├─ factors-and-multiples.ts     (new)
│     ├─ decimals.ts                  (new)
│     ├─ percents.ts                  (new)
│     ├─ ratios-and-rates.ts          (new)
│     ├─ exponents-and-roots.ts       (new)
│     └─ registry.ts              all 11 generators
└─ test/
   ├─ contract.ts                 expectGeneratorContract(generator) (new)
   ├─ oracle.ts                   promptMath also maps ³ ⁰ √n
   ├─ mock-exam.test.ts           uses an explicit registry
   ├─ wording.test.ts             + ÷ 1, × 1
   └─ generators-l0b.test.ts      oracle tests for the 6 new generators (new)
```

---

### Task 1: L0 polish and shared test helpers

**Files:**

- Modify: `src/check.ts`, `src/rational.ts`, `src/format.ts`, `src/generators/integers.ts`, `src/generators/order-of-operations.ts`, `test/check.test.ts`, `test/rational.test.ts`, `test/format.test.ts`, `test/oracle.ts`, `test/mock-exam.test.ts`, `test/wording.test.ts`
- Create: `test/contract.ts`

**Interfaces:**

- Produces:
  - `mul(a: Rational, b: Rational): Rational`
  - `decimalText(r: Rational): string`: exact decimal text for a rational whose denominator divides a power of ten (`17/4` → `"4.25"`, `-3/10` → `"-0.3"`, `5/1` → `"5"`). Throws `RangeError` otherwise.
  - `checkAnswer` now accepts `25%` for 25.
  - `expectGeneratorContract(generator: Generator): void` (registers a `describe` block)
  - `promptMath` also maps `³` → `^3`, `⁰` → `^0`, `√49` → `\sqrt{49}`

- [ ] **Step 1: Write the failing tests**

Append to `packages/math-engine/test/rational.test.ts`:

```ts
describe('mul', () => {
  it('multiplies and reduces', () => {
    expect(mul(rational(2, 3), rational(9, 4))).toEqual({ num: 3, den: 2 });
  });
});
```

and add `mul` to its import from `../src/rational`.

Append to `packages/math-engine/test/format.test.ts`:

```ts
describe('decimalText', () => {
  it.each([
    [17, 4, '4.25'],
    [-3, 10, '-0.3'],
    [5, 1, '5'],
    [1, 8, '0.125'],
    [0, 1, '0'],
  ])('%i/%i = %s', (num, den, text) => {
    expect(decimalText(rational(num, den))).toBe(text);
  });

  it('rejects a non-terminating decimal', () => {
    expect(() => decimalText(rational(1, 3))).toThrow(RangeError);
  });
});
```

and add `import { rational } from '../src/rational';` plus `decimalText` to the `../src/format` import.

Append to `packages/math-engine/test/check.test.ts`:

```ts
describe('checkAnswer: percent sign', () => {
  it('accepts a trailing percent sign on a number answer', () => {
    expect(checkAnswer(num(25), '25%')).toBe('correct');
    expect(checkAnswer(num(25), '25 %')).toBe('correct');
    expect(checkAnswer(num(25), '24%')).toBe('incorrect');
  });
});
```

Append to the `AWKWARD` array in `packages/math-engine/test/wording.test.ts` (before the closing `]`):

```ts
  /÷ 1(?![\d.])/, // dividing by one
  /× 1(?![\d.])/, // multiplying by one
```

Append to `packages/math-engine/test/wording.test.ts`:

```ts
describe('integers hint', () => {
  it('matches the operation in the prompt', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = DEFAULT_REGISTRY.get('integers')?.generate(seed, d);
        if (problem === undefined) throw new Error('integers generator missing');
        const isAddition = / \+ /.test(problem.prompt);
        expect(problem.hints.join(' ')).not.toMatch(
          isAddition ? /Subtracting/ : /Adding a negative/,
        );
      }),
      RUNS,
    );
  });
});
```

Replace the first test inside `describe('buildMockExam', …)` in `packages/math-engine/test/mock-exam.test.ts` with:

```ts
it('covers every L0 topic that has a generator, evenly, at difficulty 3', () => {
  const registry = createRegistry([
    integersGenerator,
    fractionsGenerator,
    orderOfOperationsGenerator,
  ]);
  const exam = buildMockExam(ONTARIO_GRAPH, registry, 'L0', 42, 6);
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
```

and extend its imports:

```ts
import { fractionsGenerator } from '../src/generators/fractions';
import { integersGenerator } from '../src/generators/integers';
import { orderOfOperationsGenerator } from '../src/generators/order-of-operations';
import { createRegistry, DEFAULT_REGISTRY } from '../src/generators/registry';
```

(replacing the existing `DEFAULT_REGISTRY`-only import).

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test`
Expected: FAIL. `mul` and `decimalText` aren't exported; `25%` is `unreadable`; the wording test fails on `order-of-operations` (`÷ 1`); the integers hint test fails.

- [ ] **Step 3: Implement**

Append to `packages/math-engine/src/rational.ts`:

```ts
export const mul = (a: Rational, b: Rational): Rational => rational(a.num * b.num, a.den * b.den);
```

Append to `packages/math-engine/src/format.ts`:

```ts
const MAX_DECIMAL_PLACES = 12;

/** Exact decimal text for a terminating rational: 17/4 → "4.25". Throws for 1/3 etc. */
export function decimalText(r: Rational): string {
  for (let places = 0; places <= MAX_DECIMAL_PLACES; places += 1) {
    const power = 10 ** places;
    if (power % r.den !== 0) continue;
    const scaled = Math.abs(r.num) * (power / r.den);
    const whole = Math.floor(scaled / power);
    const fraction = String(scaled % power)
      .padStart(places, '0')
      .replace(/0+$/, '');
    const sign = r.num < 0 ? '-' : '';
    return fraction === '' ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
  }
  throw new RangeError(`${r.num}/${r.den} has no terminating decimal`);
}
```

and add `import type { Rational } from './rational';` at the top of `format.ts`.

In `packages/math-engine/src/check.ts`, extend `cleanNumber` with a percent-sign strip as its first replacement:

```ts
const cleanNumber = (text: string): string =>
  text
    .replace(/\s*%$/, '')
    .replace(/^\((.*)\)$/, '$1')
    .trim()
    .replace(/^\+/, '')
    .replace(/^-\s+/, '-')
    .replace(/(\d)\.$/, '$1');
```

In `packages/math-engine/src/generators/integers.ts`, replace the `hints` value with:

```ts
      hints: [HINTS[op]],
```

and add above the generator:

```ts
const HINTS = {
  '+': 'Adding a negative number is the same as subtracting it.',
  '-': 'Subtracting a number is the same as adding its opposite.',
  '×': 'Same signs give a positive product; different signs give a negative product.',
} as const;
```

In `packages/math-engine/src/generators/integers.ts`, avoid `× 1` (the wording test now forbids it). Replace the `b` and `op` lines with:

```ts
const op = rng.pick(['+', '-', '×'] as const);
const drawn = rng.int(-limit, limit);
const b = op === '×' && drawn === 1 ? 2 : drawn;
```

(Draw order changes, so seeds map to different problems. Determinism is unaffected.)

In `packages/math-engine/src/generators/order-of-operations.ts`, change the divisor choice and keep multiplied operands ≥ 2:

```ts
const c = rng.pick([2, 3, 4]);
```

and in the difficulty-1 and difficulty-2 branches draw the multiplied operands from `rng.int(2, max)` instead of `rng.int(1, max)`:

```ts
const [a, b, c] = [rng.int(1, max), rng.int(2, max), rng.int(2, max)];
```

```ts
const [a, b, c, d] = [rng.int(1, max), rng.int(1, max), rng.int(2, max), rng.int(1, max)];
```

Append to `packages/math-engine/test/oracle.ts` a richer `promptMath` (replace the existing one):

```ts
/** The math part of a prompt, rewritten for the CAS ("Calculate: 3³ + √49" → "3^3 + \sqrt{49}"). */
export const promptMath = (prompt: string): string =>
  prompt
    .slice(prompt.indexOf(': ') + 2)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁰/g, '^0')
    .replace(/√(\d+)/g, '\\sqrt{$1}');
```

Create `packages/math-engine/test/contract.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { answerText, checkAnswer } from '../src/check';
import { gcd } from '../src/rational';
import type { Generator, Problem } from '../src/types';
import { RUNS, seedAndDifficulty } from './oracle';

const lowestTerms = (problem: Problem): boolean => {
  const { answer } = problem;
  if (answer.type === 'number') return gcd(answer.value.num, answer.value.den) === 1;
  return true;
};

/** What every generator promises, whatever its topic. */
export function expectGeneratorContract(generator: Generator): void {
  describe(`${generator.topicId} contract`, () => {
    it('is deterministic, in lowest terms, self-consistent and explained', () => {
      fc.assert(
        fc.property(seedAndDifficulty, ([seed, d]) => {
          const problem = generator.generate(seed, d);
          expect(generator.generate(seed, d)).toEqual(problem);
          expect(problem).toMatchObject({ topicId: generator.topicId, seed, difficulty: d });
          expect(lowestTerms(problem)).toBe(true);
          expect(checkAnswer(problem.answer, answerText(problem.answer))).toBe('correct');
          expect(problem.hints.length).toBeGreaterThan(0);
          expect(problem.steps.length).toBeGreaterThan(0);
        }),
        RUNS,
      );
    });
  });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "fix(math-engine): polish L0 generators and add shared generator contract tests"
```

---

### Task 2: `whole-number-operations` generator

**Files:**

- Create: `src/generators/whole-number-operations.ts`, `test/generators-l0b.test.ts`
- Modify: `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Consumes: `createRng`, `rational`, `Generator`; `expectGeneratorContract`, `promptMath`, `evaluate`, `RUNS`, `seedAndDifficulty`.
- Produces: `wholeNumberOperationsGenerator` (topic `whole-number-operations`). Prompt `Calculate: a op b` with `op ∈ {+, -, ×, ÷}`. All operands and answers are whole numbers ≥ 0. Division is exact, with divisor ≥ 2 and quotient ≥ 2. Multiplication factors ≥ 2.

Difficulty table (index = difficulty − 1):

|                         | d1  | d2  | d3   | d4   | d5    |
| ----------------------- | --- | --- | ---- | ---- | ----- |
| add/sub max             | 20  | 100 | 1000 | 1000 | 10000 |
| × / ÷ first factor max  | 10  | 12  | 99   | 99   | 999   |
| × / ÷ second factor max | 10  | 12  | 9    | 99   | 99    |

- [ ] **Step 1: Write the failing test**

`packages/math-engine/test/generators-l0b.test.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { wholeNumberOperationsGenerator } from '../src/generators/whole-number-operations';
import { toNumber } from '../src/rational';
import { expectGeneratorContract } from './contract';
import { evaluate, promptMath, RUNS, seedAndDifficulty } from './oracle';

const numberAnswer = (answer: { type: string; value?: { num: number; den: number } }): number => {
  if (answer.type !== 'number' || answer.value === undefined) throw new Error('expected a number');
  return toNumber(answer.value);
};

expectGeneratorContract(wholeNumberOperationsGenerator);

describe('whole-number-operations oracle', () => {
  it('matches the CAS and never goes negative or fractional', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = wholeNumberOperationsGenerator.generate(seed, d);
        const value = numberAnswer(problem.answer);
        expect(evaluate(promptMath(problem.prompt))).toBeCloseTo(value, 9);
        expect(Number.isInteger(value) && value >= 0).toBe(true);
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l0b`
Expected: FAIL, cannot resolve `../src/generators/whole-number-operations`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/whole-number-operations.ts`:

```ts
import { rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

const ADD_MAX = [20, 100, 1000, 1000, 10000];
const FIRST_MAX = [10, 12, 99, 99, 999];
const SECOND_MAX = [10, 12, 9, 99, 99];

type Op = '+' | '-' | '×' | '÷';

const HINTS: Record<Op, string> = {
  '+': 'Add the ones, then the tens, then the hundreds, carrying when a column reaches 10.',
  '-': 'Subtract column by column from the right, borrowing from the next column when needed.',
  '×': 'Multiply by each digit of the second number, then add the partial products.',
  '÷': 'Ask: which number times the divisor gives the dividend?',
};

/** [left, right, answer] for the operation, all whole numbers ≥ 0. */
function operands(rng: Rng, op: Op, level: number): [number, number, number] {
  const addMax = ADD_MAX[level] as number;
  const firstMax = FIRST_MAX[level] as number;
  const secondMax = SECOND_MAX[level] as number;
  if (op === '+') {
    const [a, b] = [rng.int(0, addMax), rng.int(0, addMax)];
    return [a, b, a + b];
  }
  if (op === '-') {
    const [x, y] = [rng.int(0, addMax), rng.int(0, addMax)];
    return [Math.max(x, y), Math.min(x, y), Math.abs(x - y)];
  }
  if (op === '×') {
    const [a, b] = [rng.int(2, firstMax), rng.int(2, secondMax)];
    return [a, b, a * b];
  }
  const [divisor, quotient] = [rng.int(2, secondMax), rng.int(2, firstMax)];
  return [divisor * quotient, divisor, quotient];
}

export const wholeNumberOperationsGenerator: Generator = {
  topicId: 'whole-number-operations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const op = rng.pick(['+', '-', '×', '÷'] as const);
    const [a, b, value] = operands(rng, op, difficulty - 1);
    const step =
      op === '÷'
        ? `${a} ÷ ${b} = ${value}, because ${b} × ${value} = ${a}`
        : `${a} ${op} ${b} = ${value}`;
    return {
      topicId: 'whole-number-operations',
      seed,
      difficulty,
      prompt: `Calculate: ${a} ${op} ${b}`,
      answer: { type: 'number', value: rational(value) },
      hints: [HINTS[op]],
      steps: [step],
    };
  },
};
```

In `src/generators/registry.ts`, import `wholeNumberOperationsGenerator` from `./whole-number-operations` and add it as the **first** entry of `DEFAULT_REGISTRY`'s list.
Append to `src/index.ts`:

```ts
export * from './generators/whole-number-operations';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS (including the wording test, which now covers this generator).

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add whole-number operations generator"
```

---

### Task 3: `factors-and-multiples` generator

**Files:**

- Create: `src/generators/factors-and-multiples.ts`
- Modify: `test/generators-l0b.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Consumes: `gcd`, `rational`, `createRng`, `Rng`, `Generator`.
- Produces: `factorsAndMultiplesGenerator` (topic `factors-and-multiples`). The prompt is either `Find the greatest common factor of A and B` or `Find the least common multiple of A and B`, with `A = g·m`, `B = g·n`, `m ≠ n` coprime, `g ≥ 2`. The answer is a number.

- [ ] **Step 1: Write the failing test**

Append to `packages/math-engine/test/generators-l0b.test.ts`:

```ts
import { factorsAndMultiplesGenerator } from '../src/generators/factors-and-multiples';

const bruteGcf = (a: number, b: number): number => {
  for (let k = Math.min(a, b); k >= 1; k -= 1) if (a % k === 0 && b % k === 0) return k;
  return 1;
};
const bruteLcm = (a: number, b: number): number => {
  for (let k = Math.max(a, b); ; k += 1) if (k % a === 0 && k % b === 0) return k;
};

expectGeneratorContract(factorsAndMultiplesGenerator);

describe('factors-and-multiples oracle', () => {
  it('agrees with brute force', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = factorsAndMultiplesGenerator.generate(seed, d);
        const match = /(greatest common factor|least common multiple) of (\d+) and (\d+)/.exec(
          problem.prompt,
        );
        if (match === null) throw new Error(`unexpected prompt: ${problem.prompt}`);
        const [, kind, a, b] = match;
        const expected =
          kind === 'greatest common factor'
            ? bruteGcf(Number(a), Number(b))
            : bruteLcm(Number(a), Number(b));
        expect(numberAnswer(problem.answer)).toBe(expected);
      }),
      RUNS,
    );
  });
});
```

(Move the new `import` line up into the import block at the top of the file.)

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l0b`
Expected: FAIL, cannot resolve `../src/generators/factors-and-multiples`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/factors-and-multiples.ts`:

```ts
import { gcd, rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

const MAX_TRIES = 20;

/** Two different coprime numbers in [2, max]; (2, 3) if the draws keep colliding. */
function coprimePair(rng: Rng, max: number): [number, number] {
  for (let tries = 0; tries < MAX_TRIES; tries += 1) {
    const [m, n] = [rng.int(2, max), rng.int(2, max)];
    if (m !== n && gcd(m, n) === 1) return [m, n];
  }
  return [2, 3];
}

const factorsOf = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => i + 1).filter((k) => n % k === 0);

export const factorsAndMultiplesGenerator: Generator = {
  topicId: 'factors-and-multiples',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const g = rng.int(2, 2 + 2 * difficulty);
    const [m, n] = coprimePair(rng, 3 + difficulty);
    const [a, b] = [g * m, g * n];
    const base = { topicId: 'factors-and-multiples', seed, difficulty } as const;

    if (rng.pick(['gcf', 'lcm'] as const) === 'gcf') {
      return {
        ...base,
        prompt: `Find the greatest common factor of ${a} and ${b}`,
        answer: { type: 'number', value: rational(g) },
        hints: ['List the factors of each number and find the largest one they share.'],
        steps: [
          `Factors of ${a}: ${factorsOf(a).join(', ')}`,
          `Factors of ${b}: ${factorsOf(b).join(', ')}`,
          `The largest shared factor is ${g}`,
        ],
      };
    }
    const lcm = g * m * n;
    return {
      ...base,
      prompt: `Find the least common multiple of ${a} and ${b}`,
      answer: { type: 'number', value: rational(lcm) },
      hints: ['The least common multiple is the smallest number both divide into evenly.'],
      steps: [
        `The greatest common factor of ${a} and ${b} is ${g}`,
        `LCM = ${a} × ${b} ÷ ${g} = ${lcm}`,
      ],
    };
  },
};
```

Register it in `DEFAULT_REGISTRY` (after `orderOfOperationsGenerator`) and append to `src/index.ts`:

```ts
export * from './generators/factors-and-multiples';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add factors and multiples generator"
```

---

### Task 4: `decimals` generator

**Files:**

- Create: `src/generators/decimals.ts`
- Modify: `test/generators-l0b.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Consumes: `rational`, `add`, `mul`, `decimalText`, `createRng`, `Generator`.
- Produces: `decimalsGenerator` (topic `decimals`). Prompt `Calculate: X op Y`:
  - d1–2: `+`/`-` with 1 decimal place.
  - d3–5: `+`, `-`, `×` (one-decimal × whole number 2–9, or one-decimal × one-decimal at d ≥ 4), and `÷` (a decimal divided by a whole number 2–9, with an exact one-decimal quotient). From d3 on, `+`/`-` use 2 decimal places.
  - Subtraction is ordered so the result is ≥ 0.
  - The answer is an exact rational.

- [ ] **Step 1: Write the failing test**

Append to `packages/math-engine/test/generators-l0b.test.ts` (move the import up):

```ts
import { decimalsGenerator } from '../src/generators/decimals';
import { checkAnswer } from '../src/check';
import { decimalText } from '../src/format';

expectGeneratorContract(decimalsGenerator);

describe('decimals oracle', () => {
  it('matches the CAS, stays non-negative, and accepts the decimal form', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = decimalsGenerator.generate(seed, d);
        const value = numberAnswer(problem.answer);
        expect(evaluate(promptMath(problem.prompt))).toBeCloseTo(value, 9);
        expect(value).toBeGreaterThanOrEqual(0);
        if (problem.answer.type !== 'number') throw new Error('expected a number');
        expect(checkAnswer(problem.answer, decimalText(problem.answer.value))).toBe('correct');
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l0b`
Expected: FAIL, cannot resolve `../src/generators/decimals`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/decimals.ts`:

```ts
import { decimalText } from '../format';
import { add, mul, rational, toNumber, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

type Op = '+' | '-' | '×' | '÷';

const HINTS: Record<Op, string> = {
  '+': 'Line up the decimal points, then add as with whole numbers.',
  '-': 'Line up the decimal points, then subtract as with whole numbers.',
  '×': 'Multiply as whole numbers, then count the decimal places in both factors.',
  '÷': 'Divide as with whole numbers and keep the decimal point above where it is in the dividend.',
};

/** [left, right, answer] as exact rationals. */
function operands(rng: Rng, op: Op, difficulty: number): [Rational, Rational, Rational] {
  const scale = difficulty <= 2 ? 10 : 100;
  if (op === '+' || op === '-') {
    const x = rational(rng.int(1, 100 * difficulty), scale);
    const y = rational(rng.int(1, 100 * difficulty), scale);
    if (op === '+') return [x, y, add(x, y)];
    const [big, small] = toNumber(x) >= toNumber(y) ? [x, y] : [y, x];
    return [big, small, add(big, rational(-small.num, small.den))];
  }
  if (op === '×') {
    const x = rational(rng.int(11, 99), 10);
    const y = difficulty >= 4 ? rational(rng.int(11, 99), 10) : rational(rng.int(2, 9));
    return [x, y, mul(x, y)];
  }
  const divisor = rational(rng.int(2, 9));
  const quotient = rational(rng.int(11, 99), 10);
  return [mul(quotient, divisor), divisor, quotient];
}

export const decimalsGenerator: Generator = {
  topicId: 'decimals',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const op =
      difficulty <= 2 ? rng.pick(['+', '-'] as const) : rng.pick(['+', '-', '×', '÷'] as const);
    const [x, y, value] = operands(rng, op, difficulty);
    const [xs, ys, vs] = [decimalText(x), decimalText(y), decimalText(value)];
    return {
      topicId: 'decimals',
      seed,
      difficulty,
      prompt: `Calculate: ${xs} ${op} ${ys}`,
      answer: { type: 'number', value },
      hints: [HINTS[op]],
      steps: [`${xs} ${op} ${ys} = ${vs}`],
    };
  },
};
```

Register it in `DEFAULT_REGISTRY` (after `fractionsGenerator`) and append to `src/index.ts`:

```ts
export * from './generators/decimals';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add decimals generator"
```

---

### Task 5: `percents` generator

**Files:**

- Create: `src/generators/percents.ts`
- Modify: `test/generators-l0b.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Consumes: `rational`, `add`, `decimalText`, `createRng`, `Generator`.
- Produces: `percentsGenerator` (topic `percents`). Three prompt forms:
  - `What is P% of N?` (all difficulties)
  - `What percent of B is A?` (d ≥ 2). The answer is the percent number; `25%` is also accepted (Task 1).
  - `Increase N by P%` (d ≥ 4)
  - P is a multiple of 5. At d1, P ∈ {10, 20, 25, 50, 75}.

- [ ] **Step 1: Write the failing test**

Append to `packages/math-engine/test/generators-l0b.test.ts` (move the import up):

```ts
import { percentsGenerator } from '../src/generators/percents';

expectGeneratorContract(percentsGenerator);

describe('percents oracle', () => {
  it('agrees with plain arithmetic parsed from the prompt', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = percentsGenerator.generate(seed, d);
        const value = numberAnswer(problem.answer);
        const of = /^What is (\d+)% of (\d+)\?$/.exec(problem.prompt);
        const whatPercent = /^What percent of (\d+) is (\d+)\?$/.exec(problem.prompt);
        const increase = /^Increase (\d+) by (\d+)%$/.exec(problem.prompt);
        if (of) expect(value).toBeCloseTo((Number(of[1]) * Number(of[2])) / 100, 9);
        else if (whatPercent)
          expect(value).toBeCloseTo((Number(whatPercent[2]) / Number(whatPercent[1])) * 100, 9);
        else if (increase)
          expect(value).toBeCloseTo(Number(increase[1]) * (1 + Number(increase[2]) / 100), 9);
        else throw new Error(`unexpected prompt: ${problem.prompt}`);
      }),
      RUNS,
    );
  });

  it('only uses the harder forms from their difficulty', () => {
    expect(percentsGenerator.generate(3, 1).prompt).toMatch(/^What is /);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l0b`
Expected: FAIL, cannot resolve `../src/generators/percents`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/percents.ts`:

```ts
import { decimalText } from '../format';
import { add, rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Difficulty, Generator, Problem } from '../types';

type Kind = 'of' | 'whatPercent' | 'increase';

const KINDS: Record<Difficulty, readonly Kind[]> = {
  1: ['of'],
  2: ['of', 'whatPercent'],
  3: ['of', 'whatPercent'],
  4: ['of', 'whatPercent', 'increase'],
  5: ['of', 'whatPercent', 'increase'],
};

const EASY_PERCENTS = [10, 20, 25, 50, 75];

const percent = (rng: Rng, difficulty: Difficulty): number =>
  difficulty === 1 ? rng.pick(EASY_PERCENTS) : rng.int(1, 19) * 5;

export const percentsGenerator: Generator = {
  topicId: 'percents',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const kind = rng.pick(KINDS[difficulty]);
    const p = percent(rng, difficulty);
    const base = { topicId: 'percents', seed, difficulty } as const;
    const make = (
      prompt: string,
      value: ReturnType<typeof rational>,
      hint: string,
      steps: string[],
    ): Problem => ({
      ...base,
      prompt,
      answer: { type: 'number', value },
      hints: [hint],
      steps,
    });

    if (kind === 'of') {
      const n = rng.int(2, 20 * difficulty);
      const value = rational(p * n, 100);
      return make(`What is ${p}% of ${n}?`, value, 'A percent is a number out of 100.', [
        `${p}% = ${p}/100`,
        `${p}/100 × ${n} = ${decimalText(value)}`,
      ]);
    }
    if (kind === 'whatPercent') {
      const k = rng.int(1, 5 * difficulty);
      const [whole, part] = [20 * k, (p * k) / 5];
      const ratio = decimalText(rational(part, whole));
      return make(
        `What percent of ${whole} is ${part}?`,
        rational(p),
        'Divide the part by the whole, then multiply by 100.',
        [`${part} ÷ ${whole} = ${ratio}`, `${ratio} × 100 = ${p}%`],
      );
    }
    const n = rng.int(2, 40) * 5;
    const increase = rational(p * n, 100);
    const value = add(rational(n), increase);
    return make(
      `Increase ${n} by ${p}%`,
      value,
      'Find the percent of the number, then add it on.',
      [
        `${p}% of ${n} = ${decimalText(increase)}`,
        `${n} + ${decimalText(increase)} = ${decimalText(value)}`,
      ],
    );
  },
};
```

Register it in `DEFAULT_REGISTRY` (after `decimalsGenerator`) and append to `src/index.ts`:

```ts
export * from './generators/percents';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add percents generator"
```

---

### Task 6: `ratios-and-rates` generator

**Files:**

- Create: `src/generators/ratios-and-rates.ts`
- Modify: `test/generators-l0b.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Consumes: `rational`, `toText`, `createRng`, `Generator`.
- Produces: `ratiosAndRatesGenerator` (topic `ratios-and-rates`). Forms:
  - **Scale proportion** (d1–3): `Solve for x: A/B = x/C`, where `C = B·k` and the answer is `A·k`.
  - **Unit rate** (d3): `A car travels D km in H hours. How many km does it travel per hour?`, with integer speed and `H ≥ 2`.
  - **Cross-multiplication** (d4–5): `Solve for x: A/B = C/x`, where `A ≥ 2` and the answer `B·C/A` may be a fraction.

- [ ] **Step 1: Write the failing test**

Append to `packages/math-engine/test/generators-l0b.test.ts` (move the import up):

```ts
import { ratiosAndRatesGenerator } from '../src/generators/ratios-and-rates';

expectGeneratorContract(ratiosAndRatesGenerator);

describe('ratios-and-rates oracle', () => {
  it('answer satisfies the proportion, or the rate parsed from the prompt', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = ratiosAndRatesGenerator.generate(seed, d);
        const x = numberAnswer(problem.answer);
        const rate = /travels (\d+) km in (\d+) hours/.exec(problem.prompt);
        if (rate) {
          expect(x).toBe(Number(rate[1]) / Number(rate[2]));
          return;
        }
        const [lhs = '', rhs = ''] = promptMath(problem.prompt).split('=');
        expect(evaluate(lhs, { x })).toBeCloseTo(evaluate(rhs, { x }), 9);
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l0b`
Expected: FAIL, cannot resolve `../src/generators/ratios-and-rates`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/ratios-and-rates.ts`:

```ts
import { rational, toText } from '../rational';
import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

export const ratiosAndRatesGenerator: Generator = {
  topicId: 'ratios-and-rates',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const base = { topicId: 'ratios-and-rates', seed, difficulty } as const;

    if (difficulty === 3 && rng.next() < 0.5) {
      const [hours, speed] = [rng.int(2, 6), rng.int(4, 24) * 5];
      const distance = hours * speed;
      return {
        ...base,
        prompt: `A car travels ${distance} km in ${hours} hours. How many km does it travel per hour?`,
        answer: { type: 'number', value: rational(speed) },
        hints: ['A rate per hour means: divide by the number of hours.'],
        steps: [`${distance} ÷ ${hours} = ${speed} km per hour`],
      };
    }

    const b = rng.int(2, 4 + difficulty);
    if (difficulty <= 3) {
      const [a, k] = [rng.int(1, 3 * b), rng.int(2, 2 + difficulty)];
      const c = b * k;
      const problem: Problem = {
        ...base,
        prompt: `Solve for x: ${a}/${b} = x/${c}`,
        answer: { type: 'number', value: rational(a * k) },
        hints: ['Find what the bottom number was multiplied by, then do the same to the top.'],
        steps: [`${c} ÷ ${b} = ${k}`, `x = ${a} × ${k} = ${a * k}`],
      };
      return problem;
    }

    const [a, c] = [rng.int(2, 3 * b), rng.int(2, 12)];
    const value = rational(b * c, a);
    return {
      ...base,
      prompt: `Solve for x: ${a}/${b} = ${c}/x`,
      answer: { type: 'number', value },
      hints: ['Cross-multiply, then divide.'],
      steps: [`Cross-multiply: ${a} × x = ${b} × ${c}`, `x = ${b * c} ÷ ${a} = ${toText(value)}`],
    };
  },
};
```

Register it in `DEFAULT_REGISTRY` (after `percentsGenerator`) and append to `src/index.ts`:

```ts
export * from './generators/ratios-and-rates';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add ratios and rates generator"
```

---

### Task 7: `exponents-and-roots` generator

**Files:**

- Create: `src/generators/exponents-and-roots.ts`
- Modify: `test/generators-l0b.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Consumes: `rational`, `createRng`, `Generator`.
- Produces: `exponentsAndRootsGenerator` (topic `exponents-and-roots`). Prompt `Calculate: …` using `²`, `³`, `⁰` and `√n` (n a perfect square):
  - d1: `a²` or `√(k²)`, with a and k in 2–12
  - d2: `a³` (a 2–6) or `√(k²)` (k 2–15)
  - d3–4: `aⁿ ± √(k²)`, with n ∈ {2, 3}
  - d5: `a⁰ + b²` or `aⁿ ± √(k²)`

- [ ] **Step 1: Write the failing test**

Append to `packages/math-engine/test/generators-l0b.test.ts` (move the import up):

```ts
import { exponentsAndRootsGenerator } from '../src/generators/exponents-and-roots';

expectGeneratorContract(exponentsAndRootsGenerator);

describe('exponents-and-roots oracle', () => {
  it('matches the CAS', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = exponentsAndRootsGenerator.generate(seed, d);
        expect(evaluate(promptMath(problem.prompt))).toBeCloseTo(numberAnswer(problem.answer), 9);
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l0b`
Expected: FAIL, cannot resolve `../src/generators/exponents-and-roots`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/exponents-and-roots.ts`:

```ts
import { rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator, Problem } from '../types';

const SUPERSCRIPT: Record<number, string> = { 0: '⁰', 2: '²', 3: '³' };

type Part = Readonly<{ text: string; value: number; step: string }>;

const power = (a: number, n: number): Part => ({
  text: `${a}${SUPERSCRIPT[n]}`,
  value: a ** n,
  step:
    n === 0
      ? `${a}⁰ = 1 (any non-zero number to the power 0 is 1)`
      : `${a}${SUPERSCRIPT[n]} = ${a ** n}`,
});

const root = (k: number): Part => ({
  text: `√${k * k}`,
  value: k,
  step: `√${k * k} = ${k}, because ${k}² = ${k * k}`,
});

function single(rng: Rng, difficulty: number): Part {
  if (difficulty === 1) return rng.next() < 0.5 ? power(rng.int(2, 12), 2) : root(rng.int(2, 12));
  return rng.next() < 0.5 ? power(rng.int(2, 6), 3) : root(rng.int(2, 15));
}

export const exponentsAndRootsGenerator: Generator = {
  topicId: 'exponents-and-roots',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const base = {
      topicId: 'exponents-and-roots',
      seed,
      difficulty,
      hints: ['Work out each power and root first, then add or subtract.'],
    } as const;
    const make = (prompt: string, value: number, steps: string[]): Problem => ({
      ...base,
      prompt: `Calculate: ${prompt}`,
      answer: { type: 'number', value: rational(value) },
      steps,
    });

    if (difficulty <= 2) {
      const part = single(rng, difficulty);
      return make(part.text, part.value, [part.step]);
    }
    const left =
      difficulty === 5 && rng.next() < 0.5
        ? power(rng.int(2, 9), 0)
        : power(rng.int(2, 5), rng.pick([2, 3]));
    const right = left.value === 1 ? power(rng.int(2, 12), 2) : root(rng.int(2, 12));
    const op = left.value === 1 ? '+' : rng.pick(['+', '-'] as const);
    const value = op === '+' ? left.value + right.value : left.value - right.value;
    return make(`${left.text} ${op} ${right.text}`, value, [
      left.step,
      right.step,
      `${left.value} ${op} ${right.value} = ${value}`,
    ]);
  },
};
```

Register it in `DEFAULT_REGISTRY` (after `ratiosAndRatesGenerator`) and append to `src/index.ts`:

```ts
export * from './generators/exponents-and-roots';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS. Note `a³ - √(k²)` may be negative at d3+, which is fine: integers come before exponents in the graph.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add exponents and roots generator"
```

---

### Task 8: L0 completeness, ADR update, verification, learning note

**Files:**

- Modify: `test/generators-l0.test.ts` (add the completeness test), `docs/adr/0005-math-engine-design.md`

- [ ] **Step 1: Write the completeness test**

Append to `packages/math-engine/test/generators-l0.test.ts`:

```ts
describe('L0 completeness', () => {
  it('has a generator for every L0 topic, in a registry that matches the graph order', () => {
    const l0 = ONTARIO_GRAPH.topics.filter((t) => t.level === 'L0').map((t) => t.id);
    expect(l0.every((id) => DEFAULT_REGISTRY.has(id))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `bun run --cwd packages/math-engine test generators-l0`
Expected: PASS (all 9 L0 topics are registered after Tasks 2–7). If it fails, register the missing generator. Don't weaken the test.

- [ ] **Step 3: Update ADR 0005**

In the "Deferred spec items" table, change the §10.5 row's owner from `P2b, once more generators widen the difficulty range` to:

```
P4: a mastery *check* is a session-level choice of difficulties (the scheduler targets one band per attempt); the app picks mixed difficulties for the 5-problem check
```

- [ ] **Step 4: Full verification**

```bash
bun run format && bun run format:check && bun run lint && bun run typecheck && bun run coverage
grep -rn "Date.now\|Math.random" packages/math-engine/src && echo VIOLATION || echo deterministic
git log --format='%an <%ae>%n%b' | grep -i "co-authored\|claude" && echo VIOLATION || echo "authorship clean"
```

Expected: all green; `math-engine` coverage ≥ 90%; `deterministic`; `authorship clean`.

- [ ] **Step 5: Commit and write the learning note**

```bash
git add packages/math-engine docs/adr/0005-math-engine-design.md
git commit -m "test(math-engine): require a generator for every L0 topic"
```

Write `learning/03-p2b-l0-generators.md` (not committed). Cover: contract tests vs. oracle tests; choosing an oracle when the prompt isn't math (brute force, parsed arithmetic); exact decimal printing without floats; why subtraction stays non-negative before integers; constructing "nice" problems backwards (pick the answer first, then build the question); and 5 self-check questions.
