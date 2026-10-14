# Future Flow P2c: Step Validator + Complete L1 (Grade 9, MTH1W) Generators

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Machine-check the arithmetic inside every worked step of every generator. (2) Give every remaining L1 topic a generator, with the answer types Grade 9 needs.

**Architecture:**

- A test-side **step validator** (`test/steps.ts`) extracts numeric equation chains from step text and recomputes them with exact rationals. It runs over the whole registry, so all current and future generators are covered.
- The checker gains:
  - an `inequality` answer type
  - a `monomial` form rule
  - `π` support
  - stripping of `$`, length units and a `y =` prefix
  - an absolute `tolerance` for rounded money answers
- Six generators fill L1: linear-inequalities, linear-relations, exponent-laws, measurement-and-geometry, data-and-statistics, financial-literacy.

**Tech Stack:** Bun, TypeScript 6, Vitest 5, fast-check, @cortex-js/compute-engine, @futureflow/core.

**Spec:** `docs/superpowers/specs/2026-10-08-futureflow-v1-design.md` §10; ADR 0005. **Moves `interval`/inequality answers from P2d into P2c**, because linear inequalities are Grade 9.

## Global Constraints

- Run package scripts as `bun run --cwd packages/math-engine <script>`; tools via `bun x`.
- No `Date.now()` or `Math.random()` in `src/`; randomness only via `createRng(seed)`.
- Every generator: the shared contract (`expectGeneratorContract`), an independent oracle test, the registry-wide wording test **and the registry-wide step validator**.
- Build problems backwards (answer first) so numbers stay friendly. Never print `× 1`, `÷ 1`, `- -`, `+ -`, `1x`.
- Show negatives inside steps in brackets: `4 - (-3)`, never `4 - -3`.
- Coverage ≥ 90%. Conventional commits under the owner's identity. **No AI attribution.**

## Review Focus

1. **A worked step with wrong arithmetic** (e.g. `34 × 20 = 690`): the validator must catch it. Pinned in Task 1, both by a planted wrong example and by running the validator registry-wide.
2. **An inequality answer written backwards or with typed operators** (`3 < x`, `x >= 3`, `x => 3`, `x ≥ 3`): must be read correctly, and the wrong direction must be incorrect. Pinned in Task 2.
3. **Dividing an inequality by a negative:** the answer's sign must flip. Pinned in Task 3 by a truth-table oracle that tests points on both sides of the boundary.
4. **A rounded money answer** (`$56.49` for 56.4887) and **a unit typed after a length** (`28 cm²`): must be correct. Pinned in Tasks 6 and 8.
5. **An unsimplified exponent answer** (`x^3*x^4` for `x^7`): must be incorrect. Pinned in Task 5 (monomial form).

---

## File Structure

```
packages/math-engine/
├─ src/
│  ├─ check.ts       + inequality answers, monomial form, π, units, $, y= prefix, tolerance
│  ├─ format.ts      + show() (negatives in brackets)
│  └─ generators/
│     ├─ linear-inequalities.ts       (new)
│     ├─ linear-relations.ts          (new)
│     ├─ exponent-laws.ts             (new)
│     ├─ measurement-and-geometry.ts  (new)
│     ├─ data-and-statistics.ts       (new)
│     ├─ financial-literacy.ts        (new)
│     └─ registry.ts                  + 6 generators
└─ test/
   ├─ steps.ts            step-equation extractor and validator (new)
   ├─ steps.test.ts       validator unit tests + registry-wide run (new)
   └─ generators-l1b.test.ts  contract + oracle tests for the 6 generators (new)
```

---

### Task 1: Step-arithmetic validator

**Files:**

- Create: `test/steps.ts`, `test/steps.test.ts`

**Interfaces:**

- Consumes: `parseRational`, `rational`, `add`, `mul`, `equals`, `Rational` (src/rational); `DEFAULT_REGISTRY`; `RUNS`, `seedAndDifficulty`.
- Produces:
  - `type StepEquation = Readonly<{ text: string; valid: boolean }>`
  - `stepEquations(step: string): StepEquation[]`: every chain `N op N (op N)* = N` found in the text, evaluated with × and ÷ before + and −

The extraction rules are deliberately conservative:

- A **number** is `(-3)`, `-3`, `4.25` or `3/4`. It must not be followed by a letter, digit, `.`, `/`, `²`, `³`, `⁰` or `^`.
- A chain must not start right after a letter, digit, `)`, `/`, `%`, `√`, a superscript, or an operator plus a space.
- The result must be followed by the end, `%`, `,`, `;`, `)`, or a space that is **not** followed by another operator. So `3/4 + 1/2 = 6/8 + 4/8` is skipped: its right side is an expression.

- [ ] **Step 1: Write the failing tests**

`packages/math-engine/test/steps.test.ts`:

```ts
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
  ])('validates %j', (step, expected) => {
    expect(validity(step)).toEqual(expected);
  });

  it.each([
    ['34 × 20 = 690', [false]],
    ['2 + 3 × 4 = 20', [false]],
    ['7582 - 6800 = 728', [false]],
  ])('catches the wrong arithmetic in %j', (step, expected) => {
    expect(validity(step)).toEqual(expected);
  });

  it.each([
    '2³ = 8',
    'Subtract 4 from both sides: 3x = 11',
    '(-3) - (5) = (-3) + (-5)',
    '3/4 + 1/2 = 6/8 + 4/8',
    '50% = 50/100',
    'Factors of 12: 1, 2, 3, 4, 6, 12',
    '√16 = 4, because 4² = 16',
    'Cross-multiply: 2 × x = 7 × 8',
    'A = 2000 × 1.05^3 = 2315.25',
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test steps`
Expected: FAIL, cannot resolve `./steps`.

- [ ] **Step 3: Implement the validator**

`packages/math-engine/test/steps.ts`:

```ts
import { add, equals, mul, parseRational, rational, type Rational } from '../src/rational';

export type StepEquation = Readonly<{ text: string; valid: boolean }>;

const NUMBER = String.raw`(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?(?:\/\d+)?)(?![\w.\/²³⁰^])`;
const OP = String.raw`[+\-×÷]`;
const CHAIN = new RegExp(
  String.raw`(?<![\w.)\/%√²³⁰])(?<!${OP}\s)` +
    `(${NUMBER}(?:\\s${OP}\\s${NUMBER})+)\\s=\\s(${NUMBER})` +
    String.raw`(?=%|$|[,;)]|\s(?!${OP}\s))`,
  'g',
);
const TOKEN = new RegExp(`(${OP})?\\s?(${NUMBER})`, 'g');

const toRational = (token: string): Rational => {
  const value = parseRational(token.replace(/^\((.*)\)$/, '$1'));
  if (value === null) throw new Error(`unparseable number token: ${token}`);
  return value;
};

const divide = (a: Rational, b: Rational): Rational => mul(a, rational(b.den, b.num));

/** Evaluates `n op n op n…` with × and ÷ before + and −, exactly. */
function evaluateChain(chain: string): Rational {
  const parts = [...chain.matchAll(TOKEN)].map((m) => ({
    op: m[1],
    value: toRational(m[2] ?? ''),
  }));
  const terms: { sign: 1 | -1; value: Rational }[] = [];
  for (const { op, value } of parts) {
    const last = terms.at(-1);
    if (op === '×' && last) last.value = mul(last.value, value);
    else if (op === '÷' && last) last.value = divide(last.value, value);
    else terms.push({ sign: op === '-' ? -1 : 1, value });
  }
  return terms.reduce<Rational>(
    (sum, t) => add(sum, t.sign === 1 ? t.value : rational(-t.value.num, t.value.den)),
    rational(0),
  );
}

export function stepEquations(step: string): StepEquation[] {
  return [...step.matchAll(CHAIN)].map((m) => {
    const [text, chain = '', result = ''] = m;
    return { text, valid: equals(evaluateChain(chain), toRational(result)) };
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `bun run --cwd packages/math-engine test steps`
Expected: PASS. **If a registry-wide case fails, that's a real wrong step in an existing generator.** Read the failing step, fix the generator (not the validator), and record a ruling. If an extraction-rule test fails, fix the regex. Never loosen a rule just to make a generator pass.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "test(math-engine): verify the arithmetic inside every worked step"
```

---

### Task 2: Checker: inequality answers and the `y =` prefix

**Files:**

- Modify: `src/check.ts`, `test/check.test.ts`

**Interfaces:**

- Produces:
  - `type InequalityOp = '<' | '≤' | '>' | '≥'`
  - `Answer` gains `Readonly<{ type: 'inequality'; variable: string; op: InequalityOp; bound: Rational }>`
  - `answerText` for inequalities returns `"x ≥ 3"`
  - Expression answers accept a leading `y =` (any letter **not** among the expected answer's unknowns)

- [ ] **Step 1: Write the failing tests**

Append to `packages/math-engine/test/check.test.ts`:

```ts
describe('checkAnswer: inequality', () => {
  const greater: Answer = { type: 'inequality', variable: 'x', op: '>', bound: rational(3) };
  const atLeast: Answer = { type: 'inequality', variable: 'x', op: '≥', bound: rational(3) };

  it.each([
    ['x > 3', 'correct'],
    ['x>3', 'correct'],
    ['3 < x', 'correct'],
    ['x > 6/2', 'correct'],
    ['x >= 3', 'incorrect'],
    ['x < 3', 'incorrect'],
    ['x > 4', 'incorrect'],
    ['y > 3', 'unreadable'],
    ['x >', 'unreadable'],
    ['banana', 'unreadable'],
  ])('x > 3 vs %j is %s', (given, outcome) => {
    expect(checkAnswer(greater, given)).toBe(outcome);
  });

  it.each(['x >= 3', 'x => 3', 'x ≥ 3', '3 <= x', '3 ≤ x'])('x ≥ 3 accepts %j', (given) => {
    expect(checkAnswer(atLeast, given)).toBe('correct');
  });

  it('round-trips through answerText', () => {
    expect(answerText(atLeast)).toBe('x ≥ 3');
    expect(checkAnswer(atLeast, answerText(atLeast))).toBe('correct');
  });
});

describe('checkAnswer: y = prefix on expressions', () => {
  it('accepts "y = …" when y is not part of the expected expression', () => {
    expect(checkAnswer({ type: 'expression', text: '2x+1' }, 'y = 2x + 1')).toBe('correct');
    expect(checkAnswer({ type: 'expression', text: '2x+1' }, 'y = 2x + 3')).toBe('incorrect');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test check`
Expected: FAIL (inequality type unknown; the `y =` form is `unreadable`).

- [ ] **Step 3: Implement**

In `src/check.ts`:

1. Extend the `Answer` union and add the type:

```ts
export type InequalityOp = '<' | '≤' | '>' | '≥';
```

```ts
  | Readonly<{ type: 'inequality'; variable: string; op: InequalityOp; bound: Rational }>
```

2. Add the reader and checker:

```ts
const FLIP: Readonly<Record<InequalityOp, InequalityOp>> = {
  '<': '>',
  '>': '<',
  '≤': '≥',
  '≥': '≤',
};

const readOp = (raw: string): InequalityOp => {
  if (raw === '<=' || raw === '=<' || raw === '≤') return '≤';
  if (raw === '>=' || raw === '=>' || raw === '≥') return '≥';
  return raw === '<' ? '<' : '>';
};

const RELATION = '(<=|>=|=<|=>|≤|≥|<|>)';
const VARIABLE_FIRST = new RegExp(`^([a-z])\\s*${RELATION}\\s*(.+)$`, 'i');
const VARIABLE_LAST = new RegExp(`^(.+?)\\s*${RELATION}\\s*([a-z])$`, 'i');

function readInequality(
  text: string,
): { variable: string; op: InequalityOp; boundText: string } | null {
  const first = VARIABLE_FIRST.exec(text);
  if (first) {
    return {
      variable: (first[1] ?? '').toLowerCase(),
      op: readOp(first[2] ?? ''),
      boundText: first[3] ?? '',
    };
  }
  const last = VARIABLE_LAST.exec(text);
  if (last) {
    return {
      variable: (last[3] ?? '').toLowerCase(),
      op: FLIP[readOp(last[2] ?? '')],
      boundText: last[1] ?? '',
    };
  }
  return null;
}

function checkInequality(
  expected: Readonly<{ variable: string; op: InequalityOp; bound: Rational }>,
  given: string,
): CheckOutcome {
  const read = readInequality(normalize(given));
  if (read === null || read.variable !== expected.variable) return 'unreadable';
  const bound = parseRational(cleanNumber(read.boundText));
  if (bound === null) return 'unreadable';
  return read.op === expected.op && equals(bound, expected.bound) ? 'correct' : 'incorrect';
}
```

3. In `checkAnswer`, add the case:

```ts
    case 'inequality':
      return checkInequality(expected, given);
```

and in `answerText`:

```ts
    case 'inequality':
      return `${answer.variable} ${answer.op} ${toText(answer.bound)}`;
```

4. In `checkExpression`, strip a `<letter> =` prefix when that letter is not an unknown of the expected answer. Do this **after** parsing the target and **before** parsing the given text. The function becomes:

```ts
function checkExpression(expected: string, given: string, maxTerms?: number): CheckOutcome {
  const target = ce().parse(normalize(expected));
  const allowed = new Set(target.unknowns);
  const prefixed = /^([a-z])\s*=\s*(.+)$/i.exec(normalize(given));
  const text = prefixed && !allowed.has(prefixed[1] ?? '') ? (prefixed[2] ?? '') : normalize(given);
  if (text === '') return 'unreadable';
  const parsed = ce().parse(text);
  if (!parsed.isValid || parsed.operator === 'Equal') return 'unreadable';
  // Letters the answer can't contain mean a typo (or a word), not a wrong answer.
  if (parsed.unknowns.some((symbol) => !allowed.has(symbol))) return 'unreadable';
  if (maxTerms !== undefined && (text.includes('(') || countTerms(text) > maxTerms)) {
    return 'incorrect';
  }
  // Only `true` is a proof: the CAS answers `false` for some true identities (2^x·2 vs 2^(x+1)).
  if (target.isIdenticallyEqual(parsed) === true) return 'correct';
  return sampleEqual(target, parsed) ? 'correct' : 'incorrect';
}
```

(Keep the existing behaviour. Only the prefix handling and the position of the `target` parse are new.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS. All earlier checker tests stay green (e.g. `x = 3` on `2x+2` is still `unreadable`, because `x` _is_ an unknown of the target).

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): read inequality answers and accept y = on expressions"
```

---

### Task 3: `linear-inequalities` generator

**Files:**

- Create: `src/generators/linear-inequalities.ts`, `test/generators-l1b.test.ts`
- Modify: `src/format.ts`, `test/format.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces:
  - `show(n: number): string` in `format.ts`: `"(-3)"` for negatives, `"3"` otherwise
  - `linearInequalitiesGenerator` (topic `linear-inequalities`). Prompt `Solve: <ax + b> <op> <c>`; the answer is an `inequality` in `x`.
    - d1: `a = 1`, `b ≠ 0`
    - d2: `a` in 2–5
    - d3–5: `|a|` in 2–6 with random sign; a negative `a` flips the answer's operator

- [ ] **Step 1: Write the failing tests**

Append to `packages/math-engine/test/format.test.ts`:

```ts
describe('show', () => {
  it('brackets negatives only', () => {
    expect(show(-3)).toBe('(-3)');
    expect(show(4)).toBe('4');
    expect(show(0)).toBe('0');
  });
});
```

and add `show` to the `../src/format` import.

`packages/math-engine/test/generators-l1b.test.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Answer } from '../src/check';
import { linearInequalitiesGenerator } from '../src/generators/linear-inequalities';
import { toNumber } from '../src/rational';
import { expectGeneratorContract } from './contract';
import { evaluate, RUNS, seedAndDifficulty } from './oracle';

const numberAnswer = (answer: Answer): number => {
  if (answer.type !== 'number') throw new Error('expected a number');
  return toNumber(answer.value);
};

const holds = (left: number, op: string, right: number): boolean =>
  op === '<'
    ? left < right
    : op === '≤'
      ? left <= right
      : op === '>'
        ? left > right
        : left >= right;

expectGeneratorContract(linearInequalitiesGenerator);

describe('linear-inequalities oracle', () => {
  it('the answer is true exactly where the original inequality is true', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearInequalitiesGenerator.generate(seed, d);
        if (problem.answer.type !== 'inequality') throw new Error('expected an inequality');
        const match = /^Solve: (.+) ([<>≤≥]) (-?\d+)$/.exec(problem.prompt);
        if (match === null) throw new Error(`unexpected prompt: ${problem.prompt}`);
        const [, lhs = '', op = '', rhs = ''] = match;
        const bound = toNumber(problem.answer.bound);
        for (const x of [bound - 0.5, bound, bound + 0.5]) {
          expect(holds(x, problem.answer.op, bound)).toBe(
            holds(evaluate(lhs, { x }), op, Number(rhs)),
          );
        }
      }),
      RUNS,
    );
  });

  it('flips the sign when dividing by a negative', () => {
    const flipped = Array.from({ length: 200 }, (_, seed) =>
      linearInequalitiesGenerator.generate(seed, 4),
    ).filter((p) => /^Solve: -/.test(p.prompt));
    expect(flipped.length).toBeGreaterThan(0);
    for (const p of flipped) expect(p.steps.join(' ')).toMatch(/flip/);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test generators-l1b format`
Expected: FAIL (`show` is not exported; cannot resolve the generator module).

- [ ] **Step 3: Implement**

Append to `packages/math-engine/src/format.ts`:

```ts
/** Negatives in brackets so steps never read "4 - -3". */
export const show = (n: number): string => (n < 0 ? `(${n})` : String(n));
```

`packages/math-engine/src/generators/linear-inequalities.ts`:

```ts
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
```

Register it in `DEFAULT_REGISTRY` after `linearEquationsGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/linear-inequalities';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS (contract, oracle, wording, step validator).

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add linear inequalities generator"
```

---

### Task 4: `linear-relations` generator

**Files:**

- Create: `src/generators/linear-relations.ts`
- Modify: `test/generators-l1b.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces: `linearRelationsGenerator` (topic `linear-relations`):
  - d1: `For y = <mx + b>, find y when x = X.` The answer is a number.
  - d2–3: `Find the slope of the line through (x1, y1) and (x2, y2).` The answer is a rational slope; d2 has an integer slope, d3 may be fractional; `|x2 − x1| ≥ 2`.
  - d4: `Find the equation of the line with slope M through (X, Y), in the form y = mx + b.` The answer is an expression `formatLinear(m, b)`, `maxTerms: 2`; `X ∉ {0, 1}`.
  - d5: `Find the equation of the line through (x1, y1) and (x2, y2), in the form y = mx + b.` (integer slope)

- [ ] **Step 1: Write the failing test**

Append to `packages/math-engine/test/generators-l1b.test.ts` (hoist the import):

```ts
import { linearRelationsGenerator } from '../src/generators/linear-relations';

expectGeneratorContract(linearRelationsGenerator);

describe('linear-relations oracle', () => {
  it('values, slopes and equations agree with the numbers in the prompt', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = linearRelationsGenerator.generate(seed, d);
        const points = [...problem.prompt.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [
          Number(m[1]),
          Number(m[2]),
        ]);
        const evaluateAt = /^For y = (.+), find y when x = (-?\d+)\.$/.exec(problem.prompt);
        if (evaluateAt) {
          expect(numberAnswer(problem.answer)).toBeCloseTo(
            evaluate(evaluateAt[1] ?? '', { x: Number(evaluateAt[2]) }),
            9,
          );
        } else if (/^Find the slope/.test(problem.prompt)) {
          const [[x1, y1] = [], [x2, y2] = []] = points;
          expect(numberAnswer(problem.answer)).toBeCloseTo(
            ((y2 ?? 0) - (y1 ?? 0)) / ((x2 ?? 0) - (x1 ?? 1)),
            9,
          );
        } else {
          if (problem.answer.type !== 'expression') throw new Error('expected an equation');
          for (const [x = 0, y = 0] of points)
            expect(evaluate(problem.answer.text, { x })).toBeCloseTo(y, 9);
          const slope = /slope (-?\d+)/.exec(problem.prompt);
          if (slope)
            expect(
              evaluate(problem.answer.text, { x: 1 }) - evaluate(problem.answer.text, { x: 0 }),
            ).toBeCloseTo(Number(slope[1]), 9);
        }
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l1b`
Expected: FAIL, cannot resolve `../src/generators/linear-relations`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/linear-relations.ts`:

```ts
import { formatLinear, show } from '../format';
import { rational, toText } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator, Problem } from '../types';

const nonZero = (rng: Rng, limit: number): number =>
  rng.int(1, limit) * (rng.next() < 0.5 ? -1 : 1);

/** Two x-values at least 2 apart (so the run is never 1), left to right. */
function twoXs(rng: Rng): [number, number] {
  const x1 = rng.int(-6, 4);
  return [x1, x1 + rng.int(2, 6)];
}

function slopeSteps(x1: number, y1: number, x2: number, y2: number, slopeText: string): string[] {
  const [rise, run] = [y2 - y1, x2 - x1];
  return [
    `Rise: ${y2} - ${show(y1)} = ${rise}`,
    `Run: ${x2} - ${show(x1)} = ${run}`,
    `Slope = rise ÷ run = ${show(rise)} ÷ ${run} = ${slopeText}`,
  ];
}

function interceptSteps(m: number, x: number, y: number, b: number): string[] {
  return [
    `Substitute the point into y = mx + b: ${y} = ${m} × ${show(x)} + b`,
    `b = ${y} - ${show(m * x)} = ${b}`,
    `y = ${formatLinear(m, b)}`,
  ];
}

export const linearRelationsGenerator: Generator = {
  topicId: 'linear-relations',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const base = { topicId: 'linear-relations', seed, difficulty } as const;

    if (difficulty === 1) {
      const [m, b] = [nonZero(rng, 6), rng.int(-9, 9)];
      const x = rng.pick([-5, -4, -3, -2, -1, 2, 3, 4, 5, 6]); // never 0 or 1: no × 1 in the step
      const y = m * x + b;
      const problem: Problem = {
        ...base,
        prompt: `For y = ${formatLinear(m, b)}, find y when x = ${x}.`,
        answer: { type: 'number', value: rational(y) },
        hints: ['Replace x with the number, then follow the order of operations.'],
        steps: [`y = ${m} × ${show(x)} + ${show(b)} = ${y}`],
      };
      return problem;
    }

    if (difficulty <= 3) {
      const [x1, x2] = twoXs(rng);
      const run = x2 - x1;
      const rise = difficulty === 2 ? run * nonZero(rng, 4) : nonZero(rng, 9);
      const y1 = rng.int(-8, 8);
      const y2 = y1 + rise;
      const slope = rational(rise, run);
      return {
        ...base,
        prompt: `Find the slope of the line through (${x1}, ${y1}) and (${x2}, ${y2}).`,
        answer: { type: 'number', value: slope },
        hints: ['Slope = rise ÷ run = (change in y) ÷ (change in x).'],
        steps: slopeSteps(x1, y1, x2, y2, toText(slope)),
      };
    }

    const m = nonZero(rng, 5);
    const b = rng.int(-9, 9);
    const equation = { type: 'expression', text: formatLinear(m, b), maxTerms: 2 } as const;
    const hints = ['Use y = mx + b: substitute a point to find b.'];

    if (difficulty === 4) {
      const x = rng.pick([-4, -3, -2, 2, 3, 4, 5]);
      const y = m * x + b;
      return {
        ...base,
        prompt: `Find the equation of the line with slope ${m} through (${x}, ${y}), in the form y = mx + b.`,
        answer: equation,
        hints,
        steps: interceptSteps(m, x, y, b),
      };
    }

    const [x1, x2] = twoXs(rng);
    const [y1, y2] = [m * x1 + b, m * x2 + b];
    const pointX = x1 === 0 || x1 === 1 ? x2 : x1;
    return {
      ...base,
      prompt: `Find the equation of the line through (${x1}, ${y1}) and (${x2}, ${y2}), in the form y = mx + b.`,
      answer: equation,
      hints,
      steps: [
        ...slopeSteps(x1, y1, x2, y2, String(m)),
        ...interceptSteps(m, pointX, m * pointX + b, b),
      ],
    };
  },
};
```

Register it in `DEFAULT_REGISTRY` after `linearInequalitiesGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/linear-relations';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test`
Expected: PASS. Watch the wording test: if `twoXs` produces `x1 = 1` together with `x2 = 1 + …` for d5, `pointX` avoids `× 1`. Any other wording failure is a real bug: fix the generator.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add linear relations generator"
```

---

### Task 5: Monomial form + `exponent-laws` generator

**Files:**

- Create: `src/generators/exponent-laws.ts`
- Modify: `src/check.ts`, `test/check.test.ts`, `test/generators-l1b.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces:
  - Expression answers gain `form?: 'monomial'`. When it is set, the typed answer (spaces removed) must match `^-?(\d+\*?)?[a-z](\^\{?\d+\}?)?$`, otherwise it is `incorrect`.
  - `exponentLawsGenerator` (topic `exponent-laws`):
    - d1: `x^a × x^b`
    - d2: `x^a ÷ x^b` (a − b ≥ 2)
    - d3: `(x^a)^b`
    - d4: `(c1x^a)(c2x^b)`
    - d5: `(cx^a)^b` (b ∈ {2, 3})
    - Exponents are 2–5 and coefficients 2–6.

- [ ] **Step 1: Write the failing tests**

Append to `packages/math-engine/test/check.test.ts`:

```ts
describe('checkAnswer: monomial form', () => {
  const answer: Answer = { type: 'expression', text: '6x^7', form: 'monomial' };

  it.each([
    ['6x^7', 'correct'],
    ['6*x^7', 'correct'],
    ['6 x^7', 'correct'],
    ['6x^(7)', 'correct'],
    ['2x^3*3x^4', 'incorrect'],
    ['6x^3*x^4', 'incorrect'],
    ['6x^6', 'incorrect'],
  ])('6x^7 vs %j is %s', (given, outcome) => {
    expect(checkAnswer(answer, given)).toBe(outcome);
  });
});
```

Append to `packages/math-engine/test/generators-l1b.test.ts` (hoist the imports):

```ts
import { exponentLawsGenerator } from '../src/generators/exponent-laws';
import { promptMath } from './oracle';

expectGeneratorContract(exponentLawsGenerator);

describe('exponent-laws oracle', () => {
  it('answer equals the prompt numerically and is a single simplified term', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = exponentLawsGenerator.generate(seed, d);
        if (problem.answer.type !== 'expression') throw new Error('expected an expression');
        for (const x of [1.3, 2.1, -0.7]) {
          expect(evaluate(problem.answer.text, { x })).toBeCloseTo(
            evaluate(promptMath(problem.prompt), { x }),
            6,
          );
        }
        expect(problem.answer.text).toMatch(/^-?\d*x\^\d+$/);
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test check generators-l1b`
Expected: FAIL (`2x^3*3x^4` is accepted because no form rule exists yet; cannot resolve the generator).

- [ ] **Step 3: Implement**

In `src/check.ts`:

- Extend the expression variant: `Readonly<{ type: 'expression'; text: string; maxTerms?: number; form?: 'monomial' }>`.
- Add `const MONOMIAL = /^-?(\d+\*?)?[a-z](\^\{?\d+\}?)?$/i;`
- Give `checkExpression` a `form?: 'monomial'` parameter and, right after the `maxTerms` check, add:

```ts
if (form === 'monomial' && !MONOMIAL.test(text.replace(/\s+/g, ''))) return 'incorrect';
```

- Call it from `checkAnswer` as `checkExpression(expected.text, given, expected.maxTerms, expected.form)`.

`packages/math-engine/src/generators/exponent-laws.ts`:

```ts
import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

const monomial = (coefficient: number, exponent: number): string =>
  `${coefficient === 1 ? '' : coefficient}x^${exponent}`;

export const exponentLawsGenerator: Generator = {
  topicId: 'exponent-laws',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const exponent = (): number => rng.int(2, 5);
    const coefficient = (): number => rng.int(2, 6);
    const make = (
      prompt: string,
      c: number,
      n: number,
      hint: string,
      steps: string[],
    ): Problem => ({
      topicId: 'exponent-laws',
      seed,
      difficulty,
      prompt: `Simplify: ${prompt}`,
      answer: { type: 'expression', text: monomial(c, n), form: 'monomial' },
      hints: [hint],
      steps: [...steps, monomial(c, n)],
    });

    if (difficulty === 1) {
      const [a, b] = [exponent(), exponent()];
      return make(`x^${a} × x^${b}`, 1, a + b, 'Same base, multiplying: add the exponents.', [
        `Add the exponents: ${a} + ${b} = ${a + b}`,
      ]);
    }
    if (difficulty === 2) {
      const b = exponent();
      const a = b + rng.int(2, 4);
      return make(`x^${a} ÷ x^${b}`, 1, a - b, 'Same base, dividing: subtract the exponents.', [
        `Subtract the exponents: ${a} - ${b} = ${a - b}`,
      ]);
    }
    if (difficulty === 3) {
      const [a, b] = [exponent(), rng.int(2, 3)];
      return make(`(x^${a})^${b}`, 1, a * b, 'A power of a power: multiply the exponents.', [
        `Multiply the exponents: ${a} × ${b} = ${a * b}`,
      ]);
    }
    if (difficulty === 4) {
      const [c1, a, c2, b] = [coefficient(), exponent(), coefficient(), exponent()];
      return make(
        `(${c1}x^${a})(${c2}x^${b})`,
        c1 * c2,
        a + b,
        'Multiply the numbers, then add the exponents.',
        [
          `Multiply the coefficients: ${c1} × ${c2} = ${c1 * c2}`,
          `Add the exponents: ${a} + ${b} = ${a + b}`,
        ],
      );
    }
    const [c, a, b] = [rng.int(2, 4), exponent(), rng.int(2, 3)];
    return make(
      `(${c}x^${a})^${b}`,
      c ** b,
      a * b,
      'Raise the number to the power, and multiply the exponents.',
      [
        `Raise the coefficient: ${c}^${b} = ${c ** b}`,
        `Multiply the exponents: ${a} × ${b} = ${a * b}`,
      ],
    );
  },
};
```

Register it in `DEFAULT_REGISTRY` after `linearRelationsGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/exponent-laws';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add monomial form rule and exponent laws generator"
```

---

### Task 6: π, units + `measurement-and-geometry` generator

**Files:**

- Create: `src/generators/measurement-and-geometry.ts`
- Modify: `src/check.ts`, `test/check.test.ts`, `test/generators-l1b.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces:
  - `normalize` maps `π` and a standalone `pi` to `\pi`.
  - `cleanNumber` strips a trailing length, area or volume unit (`cm`, `m`, `mm`, `km`, optionally followed by `²`, `³`, `^2`, `^3`, `2` or `3`).
  - `measurementAndGeometryGenerator` (topic `measurement-and-geometry`):
    - d1: rectangle area
    - d2: triangle area (`b × h ÷ 2`, may be `.5`)
    - d3: hypotenuse from scaled Pythagorean triples
    - d4: rectangular prism volume, or a missing leg
    - d5: circle area or circumference "in terms of π" (an expression answer like `25π`)

- [ ] **Step 1: Write the failing tests**

Append to `packages/math-engine/test/check.test.ts`:

```ts
describe('checkAnswer: π and units', () => {
  it('reads π answers and rejects decimal approximations of them', () => {
    const circle: Answer = { type: 'expression', text: '25π' };
    expect(checkAnswer(circle, '25π')).toBe('correct');
    expect(checkAnswer(circle, '25pi')).toBe('correct');
    expect(checkAnswer(circle, '25*pi')).toBe('correct');
    expect(checkAnswer(circle, '78.5')).toBe('incorrect');
  });

  it.each(['28 cm²', '28cm^2', '28 cm2', '28 m'])('strips the unit in %j', (given) => {
    expect(checkAnswer(num(28), given)).toBe('correct');
  });
});
```

Append to `packages/math-engine/test/generators-l1b.test.ts` (hoist the import):

```ts
import { measurementAndGeometryGenerator } from '../src/generators/measurement-and-geometry';

expectGeneratorContract(measurementAndGeometryGenerator);

describe('measurement-and-geometry oracle', () => {
  it('agrees with the formulas applied to the numbers in the prompt', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = measurementAndGeometryGenerator.generate(seed, d);
        const n = [...problem.prompt.matchAll(/(\d+) cm/g)].map((m) => Number(m[1]));
        const [p = 0, q = 0, r = 0] = n;
        const text = problem.prompt;
        const expected = /rectangle/.test(text)
          ? p * q
          : /triangle has a base/.test(text)
            ? (p * q) / 2
            : /legs of/.test(text)
              ? Math.hypot(p, q)
              : /hypotenuse of/.test(text)
                ? Math.sqrt(p * p - q * q)
                : /prism/.test(text)
                  ? p * q * r
                  : /area of a circle/.test(text)
                    ? Math.PI * p * p
                    : 2 * Math.PI * p;
        const value =
          problem.answer.type === 'expression'
            ? evaluate(problem.answer.text.replace('π', '\\pi'))
            : numberAnswer(problem.answer);
        expect(value).toBeCloseTo(expected, 6);
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test check generators-l1b`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/check.ts`:

- In `normalize`, add before `bracePowers` runs, as part of the replacement chain:

```ts
      .replace(/π|(?<![a-z])pi(?![a-z])/gi, '\\pi')
```

- In `cleanNumber`, add as the first replacement:

```ts
    .replace(/\s*(?:mm|cm|km|m)(?:²|³|\^?[23])?$/i, '')
```

`packages/math-engine/src/generators/measurement-and-geometry.ts`:

```ts
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
      answer: { type: 'number', value: typeof value === 'number' ? rational(value) : value },
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
```

Register it in `DEFAULT_REGISTRY` after `exponentLawsGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/measurement-and-geometry';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS. (The `k = 1` scale doesn't print `× 1`: it never appears in the text.)

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add pi and unit handling and the measurement and geometry generator"
```

---

### Task 7: `data-and-statistics` generator

**Files:**

- Create: `src/generators/data-and-statistics.ts`
- Modify: `test/generators-l1b.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces: `dataAndStatisticsGenerator` (topic `data-and-statistics`). Prompt `Find the <stat> of: v1, v2, …, vn`:
  - d1: range or mode
  - d2: median (odd n)
  - d3: mean
  - d4: median (even n) or mean
  - d5: any of the above, with larger data
  - The data has a unique mode when the stat is mode, and the mean is always a whole number.

- [ ] **Step 1: Write the failing test**

Append to `packages/math-engine/test/generators-l1b.test.ts` (hoist the import):

```ts
import { dataAndStatisticsGenerator } from '../src/generators/data-and-statistics';

expectGeneratorContract(dataAndStatisticsGenerator);

describe('data-and-statistics oracle', () => {
  it('agrees with an independent computation on the listed data', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = dataAndStatisticsGenerator.generate(seed, d);
        const match = /^Find the (\w+) of: (.+)$/.exec(problem.prompt);
        if (match === null) throw new Error(`unexpected prompt: ${problem.prompt}`);
        const [, stat = '', list = ''] = match;
        const values = list.split(', ').map(Number);
        const sorted = [...values].sort((x, y) => x - y);
        const mid = sorted.length / 2;
        const counts = new Map<number, number>();
        for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
        const top = Math.max(...counts.values());
        const modes = [...counts].filter(([, c]) => c === top).map(([v]) => v);
        const expected: Record<string, number> = {
          mean: values.reduce((s, v) => s + v, 0) / values.length,
          median:
            sorted.length % 2 === 1
              ? (sorted[Math.floor(mid)] ?? 0)
              : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2,
          mode: modes.length === 1 ? (modes[0] ?? 0) : Number.NaN,
          range: (sorted.at(-1) ?? 0) - (sorted[0] ?? 0),
        };
        expect(numberAnswer(problem.answer)).toBeCloseTo(expected[stat] ?? Number.NaN, 9);
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd packages/math-engine test generators-l1b`
Expected: FAIL, cannot resolve `../src/generators/data-and-statistics`.

- [ ] **Step 3: Implement**

`packages/math-engine/src/generators/data-and-statistics.ts`:

```ts
import { decimalText } from '../format';
import { rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Difficulty, Generator } from '../types';

type Stat = 'mean' | 'median' | 'mode' | 'range';

const STATS: Record<Difficulty, readonly Stat[]> = {
  1: ['range', 'mode'],
  2: ['median'],
  3: ['mean'],
  4: ['median', 'mean'],
  5: ['mean', 'median', 'mode', 'range'],
};

const HINTS: Record<Stat, string> = {
  mean: 'Mean = sum of the values ÷ number of values.',
  median: 'Sort the values; the median is the middle one (or the average of the middle two).',
  mode: 'The mode is the value that appears most often.',
  range: 'Range = largest value − smallest value.',
};

/** `count` different values from 1..max, in random order. */
function distinct(rng: Rng, count: number, max: number): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j] as number, pool[i] as number];
  }
  return pool.slice(0, count);
}

export const dataAndStatisticsGenerator: Generator = {
  topicId: 'data-and-statistics',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const stat = rng.pick(STATS[difficulty]);
    const evenCount = stat === 'median' && difficulty >= 4;
    const count = evenCount ? 6 : difficulty >= 5 ? 9 : 5 + 2 * rng.int(0, 1);
    const max = 10 * (difficulty + 1);

    const values =
      stat === 'mode'
        ? (() => {
            const pool = distinct(rng, count - 1, max);
            return [...pool, pool[rng.int(0, pool.length - 1)] as number];
          })()
        : distinct(rng, count, max);
    if (stat === 'mean') {
      const total = values.reduce((s, v) => s + v, 0);
      values[values.length - 1] = (values.at(-1) as number) + ((count - (total % count)) % count);
    }

    const sorted = [...values].sort((x, y) => x - y);
    const sum = values.reduce((s, v) => s + v, 0);
    const half = count / 2;
    let answer: ReturnType<typeof rational>;
    let steps: string[];
    if (stat === 'mean') {
      answer = rational(sum, count);
      steps = [
        `Sum: ${values.join(' + ')} = ${sum}`,
        `Mean = ${sum} ÷ ${count} = ${decimalText(answer)}`,
      ];
    } else if (stat === 'median') {
      const [low, high] = [
        sorted[Math.ceil(half) - 1] as number,
        sorted[Math.floor(half)] as number,
      ];
      answer =
        count % 2 === 1 ? rational(sorted[Math.floor(half)] as number) : rational(low + high, 2);
      steps = [
        `Sorted: ${sorted.join(', ')}`,
        count % 2 === 1
          ? `The middle value is ${decimalText(answer)}`
          : `The middle two are ${low} and ${high}: (${low} + ${high}) ÷ 2 = ${decimalText(answer)}`,
      ];
    } else if (stat === 'mode') {
      const repeated = values.at(-1) as number;
      answer = rational(repeated);
      steps = [
        `Sorted: ${sorted.join(', ')}`,
        `${repeated} appears twice; every other value appears once`,
      ];
    } else {
      const [min, top] = [sorted[0] as number, sorted.at(-1) as number];
      answer = rational(top - min);
      steps = [`Largest ${top}, smallest ${min}`, `Range = ${top} - ${min} = ${top - min}`];
    }

    return {
      topicId: 'data-and-statistics',
      seed,
      difficulty,
      prompt: `Find the ${stat} of: ${values.join(', ')}`,
      answer: { type: 'number', value: answer },
      hints: [HINTS[stat]],
      steps,
    };
  },
};
```

Note: the median step writes `(low + high) ÷ 2`. The step validator skips it, because `(5` isn't a number token, and the oracle checks the value. The mean adjustment may make the last value a duplicate. That's harmless, because the mean doesn't need distinct values.

Register it in `DEFAULT_REGISTRY` after `measurementAndGeometryGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/data-and-statistics';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck && bun run lint`
Expected: PASS. If lint rejects the in-place `values[…] =` adjustment (local array mutation), rewrite it as `const adjusted = [...values.slice(0, -1), last + extra]` and record a ruling.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add data and statistics generator"
```

---

### Task 8: Money: `$` and rounding tolerance + `financial-literacy` generator

**Files:**

- Create: `src/generators/financial-literacy.ts`
- Modify: `src/check.ts`, `test/check.test.ts`, `test/generators-l1b.test.ts`, `src/generators/registry.ts`, `src/index.ts`

**Interfaces:**

- Produces:
  - Number answers gain `tolerance?: number`. When set, a typed value within `tolerance` (absolute) of the exact answer is correct. Rounding to the nearest cent uses `0.005`.
  - `cleanNumber` strips a leading `$`.
  - `financialLiteracyGenerator` (topic `financial-literacy`):
    - d1: simple interest `I = P × r × t`
    - d2: total with 13% Ontario HST, rounded to the nearest cent
    - d3: sale price after a percent discount
    - d4: unit price per 100 g, rounded to the nearest cent
    - d5: compound interest, compounded annually, rounded to the nearest cent

- [ ] **Step 1: Write the failing tests**

Append to `packages/math-engine/test/check.test.ts`:

```ts
describe('checkAnswer: money', () => {
  const total: Answer = { type: 'number', value: rational(564887, 10000), tolerance: 0.005 };

  it.each([
    ['56.49', 'correct'],
    ['$56.49', 'correct'],
    ['56.4887', 'correct'],
    ['56.48', 'incorrect'],
    ['56.5', 'incorrect'],
  ])('56.4887 (to the cent) vs %j is %s', (given, outcome) => {
    expect(checkAnswer(total, given)).toBe(outcome);
  });
});
```

Append to `packages/math-engine/test/generators-l1b.test.ts` (hoist the import):

```ts
import { financialLiteracyGenerator } from '../src/generators/financial-literacy';

expectGeneratorContract(financialLiteracyGenerator);

describe('financial-literacy oracle', () => {
  it('agrees with plain arithmetic on the prompt numbers, within a cent where rounding applies', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = financialLiteracyGenerator.generate(seed, d);
        const n = [...problem.prompt.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
        const text = problem.prompt;
        const expected = /simple interest/.test(text)
          ? (n[0] ?? 0) * ((n[1] ?? 0) / 100) * (n[2] ?? 0)
          : /HST/.test(text)
            ? (n[0] ?? 0) * 1.13
            : /off/.test(text)
              ? (n[0] ?? 0) * (1 - (n[1] ?? 0) / 100)
              : /per 100 g/.test(text)
                ? ((n[1] ?? 0) / (n[0] ?? 1)) * 100
                : (n[0] ?? 0) * (1 + (n[1] ?? 0) / 100) ** (n[2] ?? 0);
        expect(Math.abs(numberAnswer(problem.answer) - expected)).toBeLessThan(1e-6);
      }),
      RUNS,
    );
  });

  it('asks for rounding exactly when the answer needs it', () => {
    fc.assert(
      fc.property(seedAndDifficulty, ([seed, d]) => {
        const problem = financialLiteracyGenerator.generate(seed, d);
        if (problem.answer.type !== 'number') throw new Error('expected a number');
        const asksToRound = /nearest cent/.test(problem.prompt);
        expect(problem.answer.tolerance === 0.005).toBe(asksToRound);
      }),
      RUNS,
    );
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run --cwd packages/math-engine test check generators-l1b`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/check.ts`:

- Extend the number variant: `Readonly<{ type: 'number'; value: Rational; unit?: 'percent'; tolerance?: number }>`.
- In `cleanNumber`, add as a replacement right after the unit strip: `.replace(/^\$\s*/, '')`.
- Give `checkNumber` a `tolerance?: number` parameter. Right after the percent check, add:

```ts
if (tolerance !== undefined) {
  return Math.abs(toNumber(value) - toNumber(expected)) <= tolerance + 1e-9
    ? 'correct'
    : 'incorrect';
}
```

and call it from `checkAnswer` as `checkNumber(expected.value, given, expected.unit, expected.tolerance)`.

`packages/math-engine/src/generators/financial-literacy.ts`:

```ts
import { decimalText } from '../format';
import { rational, type Rational } from '../rational';
import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

const CENT_TOLERANCE = 0.005;
const HST_PERCENT = 13; // Ontario harmonized sales tax
const ROUND = ' Round to the nearest cent.';

const money = (r: Rational): string => {
  const exact = Math.round((r.num / r.den) * 100) / 100;
  return exact.toFixed(2);
};

export const financialLiteracyGenerator: Generator = {
  topicId: 'financial-literacy',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const make = (
      prompt: string,
      value: Rational,
      rounded: boolean,
      hint: string,
      steps: string[],
    ): Problem => ({
      topicId: 'financial-literacy',
      seed,
      difficulty,
      prompt: rounded ? `${prompt}${ROUND}` : prompt,
      answer: rounded
        ? { type: 'number', value, tolerance: CENT_TOLERANCE }
        : { type: 'number', value },
      hints: [hint],
      steps,
    });

    if (difficulty === 1) {
      const [principal, rate, years] = [100 * rng.int(5, 50), rng.int(2, 9), rng.int(2, 5)];
      const interest = rational(principal * rate * years, 100);
      return make(
        `How much simple interest does $${principal} earn at ${rate}% per year for ${years} years?`,
        interest,
        false,
        'Simple interest: I = P × r × t, with r as a decimal.',
        [
          `I = P × r × t = ${principal} × ${decimalText(rational(rate, 100))} × ${years} = ${decimalText(interest)}`,
        ],
      );
    }
    if (difficulty === 2) {
      const price = rational(rng.int(500, 9999), 100);
      const tax = rational(price.num * HST_PERCENT, price.den * 100);
      const total = rational(price.num * (100 + HST_PERCENT), price.den * 100);
      return make(
        `A jacket costs $${decimalText(price)} before tax. What is the total with ${HST_PERCENT}% HST?`,
        total,
        true,
        'Tax = price × 0.13; total = price + tax.',
        [
          `Tax: ${decimalText(price)} × 0.13 = ${decimalText(tax)}`,
          `Total: ${decimalText(price)} + ${decimalText(tax)} = ${decimalText(total)}, about $${money(total)}`,
        ],
      );
    }
    if (difficulty === 3) {
      const [price, percent] = [5 * rng.int(4, 40), 5 * rng.int(1, 14)];
      const discount = rational(price * percent, 100);
      const sale = rational(price * (100 - percent), 100);
      return make(
        `A $${price} item is ${percent}% off. What is the sale price?`,
        sale,
        false,
        'Find the discount, then subtract it from the price.',
        [
          `Discount: ${price} × ${decimalText(rational(percent, 100))} = ${decimalText(discount)}`,
          `Sale price: ${price} - ${decimalText(discount)} = ${decimalText(sale)}`,
        ],
      );
    }
    if (difficulty === 4) {
      const grams = rng.pick([200, 300, 400, 500, 1000]);
      const centsPer100 = rng.int(20, 150);
      const price = rational((centsPer100 * grams) / 100, 100);
      const unit = rational(centsPer100, 100);
      return make(
        `A ${grams} g package costs $${decimalText(price)}. What is the price per 100 g?`,
        unit,
        true,
        'Divide the price by the number of 100 g portions.',
        [
          `${grams} g = ${grams / 100} portions of 100 g`,
          `${decimalText(price)} ÷ ${grams / 100} = ${decimalText(unit)}`,
        ],
      );
    }
    const [principal, rate, years] = [1000 * rng.int(1, 10), rng.int(2, 8), rng.int(2, 5)];
    const amount = rational(principal * (100 + rate) ** years, 100 ** years);
    return make(
      `$${principal} is invested at ${rate}% per year, compounded annually, for ${years} years. What is it worth then?`,
      amount,
      true,
      'Compound interest: A = P(1 + r)^t.',
      [
        `A = ${principal} × ${decimalText(rational(100 + rate, 100))}^${years} = ${decimalText(amount)}, about $${money(amount)}`,
      ],
    );
  },
};
```

Notes:

- The d4 step `500 g = 5 portions` divides by `grams / 100`, which is never 1, so `÷ 1` can't appear: 200 g → 2, 1000 g → 10.
- The `1.05^3` step is skipped by the step validator (`^`); the oracle checks the value.

Register it in `DEFAULT_REGISTRY` after `dataAndStatisticsGenerator`, and append to `src/index.ts`:

```ts
export * from './generators/financial-literacy';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run --cwd packages/math-engine test && bun run typecheck`
Expected: PASS. The step validator checks the tax, discount and simple-interest arithmetic exactly. A failure there is a real bug.

- [ ] **Step 5: Commit**

```bash
bun run format
git add packages/math-engine
git commit -m "feat(math-engine): add money rounding and the financial literacy generator"
```

---

### Task 9: L1 completeness, ADR, verification, learning note

**Files:**

- Modify: `test/generators-l1.test.ts`, `docs/adr/0005-math-engine-design.md`

- [ ] **Step 1: Write the completeness test**

Append to `packages/math-engine/test/generators-l1.test.ts`:

```ts
describe('L1 completeness', () => {
  it('has a generator for every L1 topic', () => {
    const l1 = ONTARIO_GRAPH.topics.filter((t) => t.level === 'L1').map((t) => t.id);
    expect(l1.filter((id) => !DEFAULT_REGISTRY.has(id))).toEqual([]);
  });
});
```

and add `import { ONTARIO_GRAPH } from '../src/curriculum';` to that file's imports if it isn't there yet.

- [ ] **Step 2: Run it**

Run: `bun run --cwd packages/math-engine test generators-l1`
Expected: PASS.

- [ ] **Step 3: Update ADR 0005**

Append:

```markdown
## Answer types added in P2c

- `inequality` (`x ≥ 3`; reads `3 ≤ x`, `x >= 3`, `x => 3`). Moved from P2d because linear inequalities are Grade 9.
- Expression `form: 'monomial'`: exponent-law answers must be a single simplified term.
- Number `tolerance`: rounded money answers (to the nearest cent, ±0.005) are correct only when the prompt asks for rounding.
- Input forgiveness: `$`, trailing length/area/volume units, `π`/`pi`, and a `y =` prefix on equation answers.

## Step verification

Every worked step is machine-checked: a test-side extractor finds numeric chains (`a op b op c = d`) in every
generator's steps and recomputes them with exact rationals, across the whole registry. Text steps and steps
containing powers are left to the per-generator oracles.
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
git commit -m "test(math-engine): require a generator for every L1 topic"
```

Write `learning/04-p2c-l1-generators.md` (not committed). Cover: the step validator as defence against "teaching wrong math" (with its extraction rules and why they are conservative); inequality reading and why dividing by a negative flips the sign (with a number-line example); truth-table oracles; tolerance vs exactness and when each is right; Ontario HST; how each Grade 9 strand maps to a generator; and 6 self-check questions.
