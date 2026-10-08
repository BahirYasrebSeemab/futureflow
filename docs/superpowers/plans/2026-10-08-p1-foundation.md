# mflow P1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the mflow TypeScript monorepo with CI, plus the pure domain package `@mflow/core` (time model, time ledger, earning/spending rules, plan lifecycle, day types, verdicts) and the edge-validation package `@mflow/contracts`, all built test-first.

**Architecture:** pnpm workspaces monorepo. `packages/core` holds pure functions and types with no I/O or framework imports (hexagonal center). `packages/contracts` holds zod schemas that validate data at system edges and map onto core types. Internal packages are consumed as TypeScript source (`exports: ./src/index.ts`), with no build step.

**Tech Stack:** Node 24, pnpm (latest via corepack), TypeScript (strict), Vitest + @vitest/coverage-v8, zod v4, ESLint (flat config) + typescript-eslint, Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-08-mflow-v1-design.md` (sections 4, 5, 6, 13.1, 14, 16 apply to this phase)

## Global Constraints

- Node 24 (`.nvmrc` = `24`); pnpm workspaces; all packages are ESM (`"type": "module"`).
- TypeScript `strict: true` and `noUncheckedIndexedAccess: true`.
- `packages/core` imports **nothing** except its own files: no zod, no Node APIs, no `Date.now()`, no `crypto`. Time and IDs are injected.
- zod is used **only** in `packages/contracts` (edges).
- All domain data is `Readonly`. Functions return new objects and never mutate inputs.
- Ledger amounts are **integer seconds**. Rules are configured in seconds.
- Day boundary is **04:00 local**. A day key is `YYYY-MM-DD`, computed from an instant plus the device's UTC offset in minutes.
- Coverage: `core` ≥ 90% (lines/branches/functions/statements), `contracts` ≥ 80%.
- Commits use conventional format (`feat:`, `chore:`, `docs:`, `test:`, `ci:`) under the owner's git identity. **Never add `Co-Authored-By` or any AI attribution.**
- `learning/` is gitignored and is never committed.

## Review Focus

1. **Instants at exactly 04:00 local, and the same instant in two timezones** (travel, Dushanbe vs Toronto): must map to the correct day key. Pinned in Task 2.
2. **An earning that would cross the daily or math cap:** must be clipped to the remainder (and recorded at 0 once the cap is reached), not rejected or overshot. Pinned in Task 4.
3. **The same task, math attempt, or ledger event delivered twice:** must never pay twice. Pinned in Tasks 3 and 4, and in Task 9 (batch schema).
4. **An unlock reason padded with spaces** (`"                    "`): must be rejected as too short. Pinned in Task 5.
5. **A bad day declared on Sunday, then another on the following Monday:** different ISO weeks, so both are allowed. Pinned in Task 7.

---

## File Structure

```
mflow/
├─ package.json                 root scripts + dev tooling
├─ pnpm-workspace.yaml
├─ tsconfig.base.json           shared strict compiler options
├─ eslint.config.js             flat config
├─ .prettierrc.json  .prettierignore  .editorconfig  .nvmrc
├─ .github/workflows/ci.yml
├─ README.md
├─ docs/adr/
│  ├─ 0001-typescript-monorepo-pnpm.md
│  ├─ 0002-hexagonal-core-zod-at-edges.md
│  ├─ 0003-day-key-and-time-model.md
│  └─ 0004-event-sourced-time-ledger.md
└─ packages/
   ├─ core/
   │  ├─ package.json  tsconfig.json  vitest.config.ts
   │  ├─ src/
   │  │  ├─ index.ts        public exports
   │  │  ├─ result.ts       Result<T,E>, ok(), err()
   │  │  ├─ time.ts         DayKey, dayKeyFor, parseDayKey, weekdayOf, isoWeekKey, monthKey, addDays
   │  │  ├─ rules.ts        Rules type + DEFAULT_RULES
   │  │  ├─ ledger.ts       LedgerEvent, balance, eventsForDay, earnedSeconds, outstandingBorrowSeconds, mergeEvents
   │  │  ├─ earning.ts      earn()
   │  │  ├─ spending.ts     spend(), expireDay(), unlock()
   │  │  ├─ plan.ts         TaskSpec, Plan, createDraft, editDraft, lockPlan
   │  │  ├─ day-types.ts    DayRecord, declareBadDay, declareAway, applyAwayVerification, isRestDay, requiredTasks
   │  │  └─ verdict.ts      Verdict, Verifier port, resolveDecision, allPassed
   │  └─ test/
   │     ├─ fixtures.ts
   │     └─ *.test.ts (one per src file)
   └─ contracts/
      ├─ package.json  tsconfig.json  vitest.config.ts
      ├─ src/index.ts  src/schemas.ts
      └─ test/schemas.test.ts
```

---

### Task 1: Monorepo scaffold, tooling, CI, first ADRs

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.nvmrc`, `.github/workflows/ci.yml`, `README.md`, `docs/adr/0001-typescript-monorepo-pnpm.md`, `docs/adr/0002-hexagonal-core-zod-at-edges.md`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`, `packages/core/src/result.ts`, `packages/core/test/result.test.ts`

**Interfaces:**
- Produces: `Result<T, E extends string>`, `ok<T>(value): Result<T, never>`, `err<E>(error): Result<never, E>` from `@mflow/core`. Root scripts `lint`, `format:check`, `typecheck`, `test`, `coverage`.

- [ ] **Step 1: Install pnpm and create the root files**

```bash
cd /home/yasreb/projects/mflow
corepack enable || npm install -g pnpm
echo "24" > .nvmrc
```

`package.json`:
```json
{
  "name": "mflow",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "coverage": "pnpm -r coverage"
  }
}
```

Then pin pnpm (this writes the `packageManager` field):
```bash
corepack use pnpm@latest || pnpm pkg set packageManager="pnpm@$(pnpm --version)"
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`.prettierrc.json`:
```json
{ "singleQuote": true, "printWidth": 100 }
```

`.prettierignore`:
```
pnpm-lock.yaml
coverage/
learning/
```

`.editorconfig`:
```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

- [ ] **Step 2: Install root dev tooling and add the ESLint config**

```bash
pnpm add -D -w typescript eslint @eslint/js typescript-eslint prettier
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['**/node_modules/**', '**/coverage/**', '**/dist/**', 'learning/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
]);
```

- [ ] **Step 3: Create the `@mflow/core` package skeleton**

```bash
mkdir -p packages/core/src packages/core/test
```

`packages/core/package.json`:
```json
{
  "name": "@mflow/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "coverage": "vitest run --coverage"
  }
}
```

```bash
pnpm --filter @mflow/core add -D typescript vitest @vitest/coverage-v8
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
```

- [ ] **Step 4: Write the failing test for `Result`**

`packages/core/test/result.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from '../src/result';

describe('Result', () => {
  it('ok wraps a value', () => {
    const r: Result<number, 'nope'> = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it('err wraps an error code', () => {
    const r: Result<number, 'nope'> = err('nope');
    expect(r).toEqual({ ok: false, error: 'nope' });
  });
});
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `pnpm --filter @mflow/core test`
Expected: FAIL, "Failed to resolve import ../src/result" (or "Cannot find module").

- [ ] **Step 6: Implement `Result` and the index**

`packages/core/src/result.ts`:
```ts
/** Expected failures are values, not exceptions. Exceptions are reserved for programmer errors. */
export type Result<T, E extends string = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E extends string>(error: E): Result<never, E> => ({ ok: false, error });
```

`packages/core/src/index.ts`:
```ts
export * from './result';
```

- [ ] **Step 7: Run all checks and confirm they pass**

Run: `pnpm --filter @mflow/core test && pnpm typecheck && pnpm lint && pnpm format && pnpm format:check`
Expected: 2 tests PASS; typecheck, lint and format:check exit 0.

- [ ] **Step 8: Add CI, README and ADRs 0001–0002**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm coverage
```

`README.md`:
```markdown
# mflow

Earn your scroll time. mflow is an Android app where an AI "future you" turns who you want to
become into skills and daily plans, verifies the work with real evidence (GitHub diffs, math
answers checked by a CAS, reading logs), and pays out social-media time from an event-sourced
ledger that a native guard enforces.

> Status: Phase 1 (foundation). See `docs/superpowers/specs/` for the design and `docs/adr/` for decisions.

## Repo layout

| Path | What |
|---|---|
| `packages/core` | Pure domain rules: time model, ledger, earning, plans, day types, verdicts |
| `packages/contracts` | zod schemas for data crossing system edges |
| `docs/adr` | Architecture Decision Records |

## Develop

    pnpm install
    pnpm test        # all packages
    pnpm coverage    # with coverage gates
    pnpm lint && pnpm typecheck
```

`docs/adr/0001-typescript-monorepo-pnpm.md`:
```markdown
# ADR 0001: TypeScript monorepo with pnpm workspaces

- Status: Accepted
- Date: 2026-10-08

## Context
The phone app (Expo), the API (Cloudflare Worker) and shared libraries (domain rules, schemas,
math engine) must share types and logic. A single developer maintains everything.

## Decision
One repository, pnpm workspaces, TypeScript everywhere. `apps/*` are deployables and
`packages/*` are libraries. Internal packages export TypeScript source directly
(`"exports": "./src/index.ts"`), so there is no build step. Each app's bundler (Metro, wrangler/esbuild,
Vite for tests) compiles them.

## Alternatives
- **Separate repos:** shared code would need publishing or copying, and types would drift.
- **Turborepo / Nx:** task caching pays off in large repos. With fewer than 10 packages it
  adds config without a felt need (YAGNI). Revisit when CI time hurts.
- **npm/yarn workspaces:** they work, but pnpm's strict dependency isolation catches undeclared
  dependencies early.

## Consequences
- One `pnpm install`, one CI pipeline, atomic cross-package changes.
- Expo with pnpm needs care (Metro resolution). That's handled in P4.
```

`docs/adr/0002-hexagonal-core-zod-at-edges.md`:
```markdown
# ADR 0002: Hexagonal core; zod only at the edges

- Status: Accepted
- Date: 2026-10-08

## Context
Rules (earning, caps, plan locking, day types) must behave identically on the phone and the
server, be fast to test, and survive swapping infrastructure (Gemini → Jev, D1 → Postgres,
Workers → Node).

## Decision
`@mflow/core` contains only pure functions and types. It performs no I/O, reads no clock, and generates
no IDs (time and ID generators are injected). Infrastructure lives in adapters inside the apps.
Runtime validation (zod) lives in `@mflow/contracts` and is applied where untrusted data enters:
HTTP bodies, AI outputs, third-party API responses, stored JSON. Inside the boundary, plain
TypeScript types are trusted.

## Alternatives
- **Validate everywhere:** redundant work and noise; types already guarantee internal shapes.
- **Classes/ORM entities in the domain:** couples rules to persistence and makes tests slower.
- **Valibot / ArkType instead of zod:** smaller and faster, but zod v4 has native JSON Schema export
  (`z.toJSONSchema`), which we hand to LLMs for structured output, and broader ecosystem support.

## Consequences
- Core tests run in milliseconds with no mocks.
- Expected failures are returned as `Result` values; exceptions mean bugs.
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo with core package, CI and ADRs 0001-0002"
```

---

### Task 2: Time model (`time.ts`) + ADR 0003

**Files:**
- Create: `packages/core/src/time.ts`, `packages/core/test/time.test.ts`, `docs/adr/0003-day-key-and-time-model.md`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `type DayKey = string` (`YYYY-MM-DD`)
  - `dayKeyFor(atMs: number, utcOffsetMinutes: number, boundaryHour: number): DayKey`
  - `parseDayKey(key: DayKey): number` (UTC ms at 00:00; throws `RangeError` on invalid)
  - `weekdayOf(key: DayKey): number` (0 = Sunday … 6 = Saturday)
  - `isoWeekKey(key: DayKey): string` (`YYYY-Www`)
  - `monthKey(key: DayKey): string` (`YYYY-MM`)
  - `addDays(key: DayKey, days: number): DayKey`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/time.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addDays, dayKeyFor, isoWeekKey, monthKey, parseDayKey, weekdayOf } from '../src/time';

const TORONTO_EDT = -240;
const DUSHANBE = 300;
const BOUNDARY = 4;

describe('dayKeyFor', () => {
  it('counts 03:59 local as the previous day', () => {
    expect(dayKeyFor(Date.UTC(2026, 9, 8, 7, 59), TORONTO_EDT, BOUNDARY)).toBe('2026-10-07');
  });

  it('starts the new day at exactly 04:00 local', () => {
    expect(dayKeyFor(Date.UTC(2026, 9, 8, 8, 0), TORONTO_EDT, BOUNDARY)).toBe('2026-10-08');
  });

  it('maps the same instant to different days in different timezones', () => {
    const instant = Date.UTC(2026, 9, 7, 23, 0); // 04:00 in Dushanbe, 19:00 in Toronto
    expect(dayKeyFor(instant, DUSHANBE, BOUNDARY)).toBe('2026-10-08');
    expect(dayKeyFor(instant, TORONTO_EDT, BOUNDARY)).toBe('2026-10-07');
  });

  it('rejects non-finite instants and offsets', () => {
    expect(() => dayKeyFor(Number.NaN, 0, BOUNDARY)).toThrow(RangeError);
    expect(() => dayKeyFor(0, Number.NaN, BOUNDARY)).toThrow(RangeError);
  });
});

describe('parseDayKey', () => {
  it('returns UTC midnight for a valid key', () => {
    expect(parseDayKey('2026-10-08')).toBe(Date.UTC(2026, 9, 8));
  });

  it.each(['2026-02-30', '2026-1-05', 'yesterday', ''])('rejects %j', (key) => {
    expect(() => parseDayKey(key)).toThrow(RangeError);
  });
});

describe('calendar helpers', () => {
  it('weekdayOf uses 0 = Sunday', () => {
    expect(weekdayOf('2026-10-08')).toBe(4);
    expect(weekdayOf('2026-10-11')).toBe(0);
  });

  it.each([
    ['2026-01-01', '2026-W01'],
    ['2024-12-30', '2025-W01'],
    ['2026-10-08', '2026-W41'],
    ['2026-10-11', '2026-W41'],
    ['2026-10-12', '2026-W42'],
    ['2027-01-01', '2026-W53'],
  ])('isoWeekKey(%s) = %s', (key, week) => {
    expect(isoWeekKey(key)).toBe(week);
  });

  it('monthKey returns YYYY-MM', () => {
    expect(monthKey('2026-10-08')).toBe('2026-10');
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-10-08', 1)).toBe('2026-10-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @mflow/core test -- time`
Expected: FAIL, cannot resolve `../src/time`.

- [ ] **Step 3: Implement `time.ts`**

`packages/core/src/time.ts`:
```ts
/** Calendar day in the owner's local time, shifted so the day starts at the boundary hour. */
export type DayKey = string;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const toKey = (utcMs: number): DayKey => new Date(utcMs).toISOString().slice(0, 10);

export function dayKeyFor(atMs: number, utcOffsetMinutes: number, boundaryHour: number): DayKey {
  if (!Number.isFinite(atMs) || !Number.isFinite(utcOffsetMinutes)) {
    throw new RangeError('dayKeyFor needs finite inputs');
  }
  return toKey(atMs + utcOffsetMinutes * MS_PER_MINUTE - boundaryHour * MS_PER_HOUR);
}

export function parseDayKey(key: DayKey): number {
  const match = DAY_KEY_PATTERN.exec(key);
  if (!match) throw new RangeError(`invalid day key: ${key}`);
  const [, year, month, day] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (toKey(ms) !== key) throw new RangeError(`invalid day key: ${key}`);
  return ms;
}

export const weekdayOf = (key: DayKey): number => new Date(parseDayKey(key)).getUTCDay();

/** ISO-8601 week: weeks start Monday; week 1 contains the year's first Thursday. */
export function isoWeekKey(key: DayKey): string {
  const ms = parseDayKey(key);
  const daysSinceMonday = (weekdayOf(key) + 6) % DAYS_PER_WEEK;
  const thursdayMs = ms + (3 - daysSinceMonday) * MS_PER_DAY;
  const year = new Date(thursdayMs).getUTCFullYear();
  const dayOfYearIndex = (thursdayMs - Date.UTC(year, 0, 1)) / MS_PER_DAY;
  const week = Math.floor(dayOfYearIndex / DAYS_PER_WEEK) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export const monthKey = (key: DayKey): string => {
  parseDayKey(key);
  return key.slice(0, 7);
};

export const addDays = (key: DayKey, days: number): DayKey =>
  toKey(parseDayKey(key) + days * MS_PER_DAY);
```

Append to `packages/core/src/index.ts`:
```ts
export * from './time';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @mflow/core test -- time`
Expected: PASS (all `dayKeyFor`, `parseDayKey`, calendar tests).

- [ ] **Step 5: Write ADR 0003**

`docs/adr/0003-day-key-and-time-model.md`:
```markdown
# ADR 0003: Day keys with a 04:00 boundary and an explicit UTC offset

- Status: Accepted
- Date: 2026-10-08

## Context
Plans, caps and expiry are per day. The owner stays up past midnight and travels (Dushanbe ↔ Toronto).
The domain core must stay pure: no reading the clock or the system timezone.

## Decision
A day is identified by a `DayKey` (`YYYY-MM-DD`) computed as
`dayKeyFor(instantMs, utcOffsetMinutes, boundaryHour = 4)`. The device supplies its current
UTC offset with every event. Weekly limits use ISO weeks and monthly limits use calendar months, both derived
from the day key. Durations are measured with a monotonic clock on the device (not in core).

## Alternatives
- **IANA timezone names in core:** needs `Intl` timezone data, which is inconsistent across Hermes/Workers.
  An offset is enough to bucket an instant.
- **Midnight boundary:** late-night work would count toward the wrong day.

## Consequences
- Pure, deterministic day bucketing that's easy to test.
- On travel days the offset changes, so a day can be shorter or longer. That's acceptable and covered by tests.
```

- [ ] **Step 6: Commit**

```bash
git add packages/core docs/adr/0003-day-key-and-time-model.md
git commit -m "feat(core): add day-key time model with 04:00 boundary"
```

---

### Task 3: Rules + ledger (`rules.ts`, `ledger.ts`) + ADR 0004

**Files:**
- Create: `packages/core/src/rules.ts`, `packages/core/src/ledger.ts`, `packages/core/test/fixtures.ts`, `packages/core/test/ledger.test.ts`, `docs/adr/0004-event-sourced-time-ledger.md`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `DayKey` (Task 2).
- Produces:
  - `type Rules` and `DEFAULT_RULES` (fields listed in Step 3)
  - `LEDGER_EVENT_KINDS` (readonly tuple), `type LedgerEventKind`
  - `type LedgerEvent = Readonly<{ id: string; day: DayKey; at: number; kind: LedgerEventKind; seconds: number; refId?: string; reason?: string }>`
  - `type EventContext = Readonly<{ day: DayKey; at: number; newId: () => string }>`
  - `balance(events: readonly LedgerEvent[]): number`
  - `eventsForDay(events: readonly LedgerEvent[], day: DayKey): LedgerEvent[]`
  - `earnedSeconds(dayEvents: readonly LedgerEvent[]): number` (sum of base/task/bonus/math)
  - `sumKind(events: readonly LedgerEvent[], kind: LedgerEventKind): number`
  - `outstandingBorrowSeconds(events: readonly LedgerEvent[]): number`
  - `mergeEvents(existing: readonly LedgerEvent[], incoming: readonly LedgerEvent[]): { events: LedgerEvent[]; added: LedgerEvent[] }`
  - Test helpers in `test/fixtures.ts`: `ev(partial)`, `idGen(prefix)`, `ctx(overrides?)`

- [ ] **Step 1: Write the fixtures and failing tests**

`packages/core/test/fixtures.ts`:
```ts
import type { EventContext, LedgerEvent } from '../src/ledger';

let counter = 0;

export function ev(
  over: Partial<LedgerEvent> & Pick<LedgerEvent, 'kind' | 'seconds'>,
): LedgerEvent {
  counter += 1;
  return { id: `e-${counter}`, day: '2026-10-08', at: 0, ...over };
}

export function idGen(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

export function ctx(over: Partial<EventContext> = {}): EventContext {
  return { day: '2026-10-08', at: 1_000, newId: idGen('new'), ...over };
}
```

`packages/core/test/ledger.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  balance,
  earnedSeconds,
  eventsForDay,
  mergeEvents,
  outstandingBorrowSeconds,
  sumKind,
} from '../src/ledger';
import { DEFAULT_RULES } from '../src/rules';
import { ev } from './fixtures';

describe('balance', () => {
  it('is zero for no events', () => {
    expect(balance([])).toBe(0);
  });

  it('sums signed seconds', () => {
    const events = [
      ev({ kind: 'base_grant', seconds: 900 }),
      ev({ kind: 'usage_spend', seconds: -300 }),
      ev({ kind: 'task_reward', seconds: 1200 }),
    ];
    expect(balance(events)).toBe(1800);
  });
});

describe('eventsForDay / earnedSeconds / sumKind', () => {
  const events = [
    ev({ kind: 'base_grant', seconds: 900, day: '2026-10-07' }),
    ev({ kind: 'base_grant', seconds: 900 }),
    ev({ kind: 'math_reward', seconds: 180 }),
    ev({ kind: 'usage_spend', seconds: -60 }),
    ev({ kind: 'unlock_borrow', seconds: 600 }),
  ];

  it('filters by day', () => {
    expect(eventsForDay(events, '2026-10-08')).toHaveLength(4);
  });

  it('counts only earning kinds as earned', () => {
    expect(earnedSeconds(eventsForDay(events, '2026-10-08'))).toBe(1080);
  });

  it('sums one kind', () => {
    expect(sumKind(events, 'base_grant')).toBe(1800);
  });
});

describe('outstandingBorrowSeconds', () => {
  it('is borrowed minus repaid', () => {
    const events = [
      ev({ kind: 'unlock_borrow', seconds: 600 }),
      ev({ kind: 'borrow_repay', seconds: -200 }),
    ];
    expect(outstandingBorrowSeconds(events)).toBe(400);
  });

  it('never goes below zero', () => {
    const events = [
      ev({ kind: 'unlock_borrow', seconds: 600 }),
      ev({ kind: 'borrow_repay', seconds: -900 }),
    ];
    expect(outstandingBorrowSeconds(events)).toBe(0);
  });
});

describe('mergeEvents', () => {
  it('ignores events whose id already exists, including duplicates inside the batch', () => {
    const a = ev({ id: 'a', kind: 'base_grant', seconds: 900 });
    const b = ev({ id: 'b', kind: 'usage_spend', seconds: -60 });
    const existing = Object.freeze([a]);
    const incoming = Object.freeze([a, b, b]);

    const result = mergeEvents(existing, incoming);

    expect(result.events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(result.added.map((e) => e.id)).toEqual(['b']);
    expect(existing).toHaveLength(1);
  });
});

describe('DEFAULT_RULES', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_RULES)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @mflow/core test -- ledger`
Expected: FAIL, cannot resolve `../src/ledger`.

- [ ] **Step 3: Implement `rules.ts` and `ledger.ts`**

`packages/core/src/rules.ts`:
```ts
/** Every tunable number of the system. Amounts are integer seconds. */
export type Rules = Readonly<{
  dayBoundaryHour: number;
  nightlyReminderHour: number;
  baseSeconds: number;
  dailyCapSeconds: number;
  mathSecondsPerProblem: number;
  mathDailyCapSeconds: number;
  choiceRewardFactor: number;
  allDoneBonusSeconds: number;
  planMinTasks: number;
  planMaxTasks: number;
  unlockMinReasonLength: number;
  unlockWaitSeconds: number;
  unlockGrantSeconds: number;
  unlockMaxPerDay: number;
  badDaysPerWeek: number;
  unverifiedAwayPerMonth: number;
  judgeConfidenceThreshold: number;
  heartbeatSeconds: number;
}>;

const MINUTE = 60;

export const DEFAULT_RULES: Rules = Object.freeze({
  dayBoundaryHour: 4,
  nightlyReminderHour: 21,
  baseSeconds: 15 * MINUTE,
  dailyCapSeconds: 120 * MINUTE,
  mathSecondsPerProblem: 3 * MINUTE,
  mathDailyCapSeconds: 45 * MINUTE,
  choiceRewardFactor: 0.5,
  allDoneBonusSeconds: 15 * MINUTE,
  planMinTasks: 3,
  planMaxTasks: 5,
  unlockMinReasonLength: 20,
  unlockWaitSeconds: 10 * MINUTE,
  unlockGrantSeconds: 10 * MINUTE,
  unlockMaxPerDay: 2,
  badDaysPerWeek: 1,
  unverifiedAwayPerMonth: 2,
  judgeConfidenceThreshold: 0.75,
  heartbeatSeconds: 15 * MINUTE,
});
```

`packages/core/src/ledger.ts`:
```ts
import type { DayKey } from './time';

export const LEDGER_EVENT_KINDS = [
  'base_grant',
  'task_reward',
  'all_done_bonus',
  'math_reward',
  'usage_spend',
  'unlock_borrow',
  'borrow_repay',
  'expire',
  'correction',
] as const;

export type LedgerEventKind = (typeof LEDGER_EVENT_KINDS)[number];

/** Append-only. Never updated or deleted; corrections are new events. */
export type LedgerEvent = Readonly<{
  id: string;
  day: DayKey;
  at: number;
  kind: LedgerEventKind;
  seconds: number;
  refId?: string;
  reason?: string;
}>;

/** Everything a pure function needs to create events: no clock or RNG inside core. */
export type EventContext = Readonly<{ day: DayKey; at: number; newId: () => string }>;

const EARNING_KINDS: ReadonlySet<LedgerEventKind> = new Set([
  'base_grant',
  'task_reward',
  'all_done_bonus',
  'math_reward',
]);

const sum = (events: readonly LedgerEvent[]): number =>
  events.reduce((total, e) => total + e.seconds, 0);

export const balance = sum;

export const eventsForDay = (events: readonly LedgerEvent[], day: DayKey): LedgerEvent[] =>
  events.filter((e) => e.day === day);

export const earnedSeconds = (dayEvents: readonly LedgerEvent[]): number =>
  sum(dayEvents.filter((e) => EARNING_KINDS.has(e.kind)));

export const sumKind = (events: readonly LedgerEvent[], kind: LedgerEventKind): number =>
  sum(events.filter((e) => e.kind === kind));

/** Borrowed seconds not yet repaid. Repay events carry negative seconds. */
export const outstandingBorrowSeconds = (events: readonly LedgerEvent[]): number =>
  Math.max(0, sumKind(events, 'unlock_borrow') + sumKind(events, 'borrow_repay'));

/** Idempotent union by event id. Inputs are not mutated. */
export function mergeEvents(
  existing: readonly LedgerEvent[],
  incoming: readonly LedgerEvent[],
): { events: LedgerEvent[]; added: LedgerEvent[] } {
  const seen = new Set(existing.map((e) => e.id));
  const added = incoming.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  return { events: [...existing, ...added], added };
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './rules';
export * from './ledger';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @mflow/core test -- ledger`
Expected: PASS.

- [ ] **Step 5: Write ADR 0004**

`docs/adr/0004-event-sourced-time-ledger.md`:
```markdown
# ADR 0004: Event-sourced time ledger

- Status: Accepted
- Date: 2026-10-08

## Context
Phone time is earned (tasks, math, bonus), spent (blocked apps), borrowed (emergency unlock) and
expired, on an offline-capable phone and a server that must agree.

## Decision
Store every change as an append-only `LedgerEvent` with a client-generated unique id and integer
seconds (signed). Balance = sum of events. Merging = idempotent union by id. Corrections
are new `correction` events; nothing is updated or deleted.

## Alternatives
- **Mutable `balance` column:** concurrent writers lose updates, there's no audit trail, and offline merges are hard.
- **CRDT counters:** they solve merging, but give no per-change reasons for the coach and the nightly review.

## Consequences
- Every balance is explainable ("why 37 minutes?").
- Retries are safe.
- Reads sum events. Per-day volume is small (< 200 events), so no snapshots are needed in v1.
```

- [ ] **Step 6: Commit**

```bash
git add packages/core docs/adr/0004-event-sourced-time-ledger.md
git commit -m "feat(core): add rules and event-sourced time ledger"
```

---

### Task 4: Earning (`earning.ts`)

**Files:**
- Create: `packages/core/src/earning.ts`, `packages/core/test/earning.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Result`, `ok`, `err` (Task 1); `Rules` (Task 3); `LedgerEvent`, `EventContext`, `earnedSeconds`, `sumKind` (Task 3).
- Produces:
  - `type EarnRequest = { kind: 'base_grant' } | { kind: 'task_reward'; taskId: string; seconds: number } | { kind: 'all_done_bonus' } | { kind: 'math_reward'; attemptId: string; answerType: 'typed' | 'choice' }`
  - `type EarnState = Readonly<{ planLocked: boolean; outstandingBorrow: number }>`
  - `type EarnError = 'plan_not_locked' | 'already_granted' | 'invalid_amount'`
  - `earn(dayEvents: readonly LedgerEvent[], req: EarnRequest, ctx: EventContext, rules: Rules, state: EarnState): Result<LedgerEvent[], EarnError>`

Behavior: the reward is clipped to the remaining daily cap (and the math cap for math). Once a cap is reached, a 0-second event is still recorded, so completion and idempotency are tracked. Non-base rewards repay outstanding borrow first, using a negative `borrow_repay` event whose `refId` is the reward's id. The base grant never repays debt (a guaranteed floor for bad days).

- [ ] **Step 1: Write the failing tests**

`packages/core/test/earning.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { earn, type EarnState } from '../src/earning';
import { DEFAULT_RULES as R } from '../src/rules';
import { ctx, ev } from './fixtures';

const locked: EarnState = { planLocked: true, outstandingBorrow: 0 };
const unlocked: EarnState = { planLocked: false, outstandingBorrow: 0 };

describe('earn: base grant', () => {
  it('grants the base allowance once per day, even without a locked plan', () => {
    const r = earn([], { kind: 'base_grant' }, ctx(), R, unlocked);
    expect(r).toEqual({
      ok: true,
      value: [{ id: 'new-1', day: '2026-10-08', at: 1_000, kind: 'base_grant', seconds: 900 }],
    });
  });

  it('refuses a second base grant', () => {
    const day = [ev({ kind: 'base_grant', seconds: 900 })];
    expect(earn(day, { kind: 'base_grant' }, ctx(), R, locked)).toEqual({
      ok: false,
      error: 'already_granted',
    });
  });

  it('never uses the base grant to repay borrowed time', () => {
    const r = earn([], { kind: 'base_grant' }, ctx(), R, { planLocked: false, outstandingBorrow: 600 });
    expect(r.ok && r.value).toHaveLength(1);
  });
});

describe('earn: task reward', () => {
  it('requires a locked plan', () => {
    const r = earn([], { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, unlocked);
    expect(r).toEqual({ ok: false, error: 'plan_not_locked' });
  });

  it('pays the task value with the task id as refId', () => {
    const r = earn([], { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, locked);
    expect(r.ok && r.value[0]).toMatchObject({ kind: 'task_reward', seconds: 1200, refId: 't1' });
  });

  it('pays a task only once', () => {
    const day = [ev({ kind: 'task_reward', seconds: 1200, refId: 't1' })];
    const r = earn(day, { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, locked);
    expect(r).toEqual({ ok: false, error: 'already_granted' });
  });

  it.each([0, -5, 1.5, Number.NaN])('rejects invalid amount %s', (seconds) => {
    const r = earn([], { kind: 'task_reward', taskId: 't1', seconds }, ctx(), R, locked);
    expect(r).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('clips to what is left of the daily cap', () => {
    const day = [ev({ kind: 'task_reward', seconds: 7000, refId: 'big' })];
    const r = earn(day, { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, locked);
    expect(r.ok && r.value[0]?.seconds).toBe(200);
  });

  it('records a zero-second event once the cap is reached', () => {
    const day = [ev({ kind: 'task_reward', seconds: 7200, refId: 'big' })];
    const r = earn(day, { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, locked);
    expect(r.ok && r.value).toEqual([
      { id: 'new-1', day: '2026-10-08', at: 1_000, kind: 'task_reward', seconds: 0, refId: 't1' },
    ]);
  });
});

describe('earn: borrowed time', () => {
  it('repays outstanding borrow from the reward first', () => {
    const r = earn(
      [],
      { kind: 'task_reward', taskId: 't1', seconds: 1200 },
      ctx(),
      R,
      { planLocked: true, outstandingBorrow: 600 },
    );
    expect(r.ok && r.value).toEqual([
      { id: 'new-1', day: '2026-10-08', at: 1_000, kind: 'task_reward', seconds: 1200, refId: 't1' },
      { id: 'new-2', day: '2026-10-08', at: 1_000, kind: 'borrow_repay', seconds: -600, refId: 'new-1' },
    ]);
  });

  it('repays at most the reward amount', () => {
    const r = earn(
      [],
      { kind: 'task_reward', taskId: 't1', seconds: 300 },
      ctx(),
      R,
      { planLocked: true, outstandingBorrow: 600 },
    );
    expect(r.ok && r.value[1]?.seconds).toBe(-300);
  });
});

describe('earn: math reward', () => {
  it('pays full reward for typed answers and half for multiple choice', () => {
    const typed = earn([], { kind: 'math_reward', attemptId: 'a1', answerType: 'typed' }, ctx(), R, locked);
    const choice = earn([], { kind: 'math_reward', attemptId: 'a2', answerType: 'choice' }, ctx(), R, locked);
    expect(typed.ok && typed.value[0]?.seconds).toBe(180);
    expect(choice.ok && choice.value[0]?.seconds).toBe(90);
  });

  it('respects the math cap and the daily cap together', () => {
    const day = [
      ev({ kind: 'math_reward', seconds: 2650, refId: 'old' }),
      ev({ kind: 'task_reward', seconds: 4450, refId: 'big' }),
    ];
    const r = earn(day, { kind: 'math_reward', attemptId: 'a1', answerType: 'typed' }, ctx(), R, locked);
    expect(r.ok && r.value[0]?.seconds).toBe(50);
  });

  it('pays an attempt only once', () => {
    const day = [ev({ kind: 'math_reward', seconds: 180, refId: 'a1' })];
    const r = earn(day, { kind: 'math_reward', attemptId: 'a1', answerType: 'typed' }, ctx(), R, locked);
    expect(r).toEqual({ ok: false, error: 'already_granted' });
  });
});

describe('earn: all-done bonus', () => {
  it('pays once per day', () => {
    const first = earn([], { kind: 'all_done_bonus' }, ctx(), R, locked);
    expect(first.ok && first.value[0]?.seconds).toBe(900);
    const day = [ev({ kind: 'all_done_bonus', seconds: 900 })];
    expect(earn(day, { kind: 'all_done_bonus' }, ctx(), R, locked)).toEqual({
      ok: false,
      error: 'already_granted',
    });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @mflow/core test -- earning`
Expected: FAIL, cannot resolve `../src/earning`.

- [ ] **Step 3: Implement `earning.ts`**

`packages/core/src/earning.ts`:
```ts
import { earnedSeconds, sumKind, type EventContext, type LedgerEvent } from './ledger';
import { err, ok, type Result } from './result';
import type { Rules } from './rules';

export type EarnRequest =
  | { readonly kind: 'base_grant' }
  | { readonly kind: 'task_reward'; readonly taskId: string; readonly seconds: number }
  | { readonly kind: 'all_done_bonus' }
  | { readonly kind: 'math_reward'; readonly attemptId: string; readonly answerType: 'typed' | 'choice' };

export type EarnState = Readonly<{ planLocked: boolean; outstandingBorrow: number }>;

export type EarnError = 'plan_not_locked' | 'already_granted' | 'invalid_amount';

const refIdOf = (req: EarnRequest): string | undefined => {
  if (req.kind === 'task_reward') return req.taskId;
  if (req.kind === 'math_reward') return req.attemptId;
  return undefined;
};

const isPositiveInteger = (n: number): boolean => Number.isInteger(n) && n > 0;

function requestedSeconds(req: EarnRequest, rules: Rules): number | null {
  switch (req.kind) {
    case 'base_grant':
      return rules.baseSeconds;
    case 'all_done_bonus':
      return rules.allDoneBonusSeconds;
    case 'task_reward':
      return isPositiveInteger(req.seconds) ? req.seconds : null;
    case 'math_reward': {
      const factor = req.answerType === 'choice' ? rules.choiceRewardFactor : 1;
      return Math.round(rules.mathSecondsPerProblem * factor);
    }
  }
}

function remainingCap(dayEvents: readonly LedgerEvent[], req: EarnRequest, rules: Rules): number {
  const daily = Math.max(0, rules.dailyCapSeconds - earnedSeconds(dayEvents));
  if (req.kind !== 'math_reward') return daily;
  const math = Math.max(0, rules.mathDailyCapSeconds - sumKind(dayEvents, 'math_reward'));
  return Math.min(daily, math);
}

const alreadyGranted = (dayEvents: readonly LedgerEvent[], req: EarnRequest): boolean => {
  const refId = refIdOf(req);
  return dayEvents.some((e) => e.kind === req.kind && (refId === undefined || e.refId === refId));
};

export function earn(
  dayEvents: readonly LedgerEvent[],
  req: EarnRequest,
  ctx: EventContext,
  rules: Rules,
  state: EarnState,
): Result<LedgerEvent[], EarnError> {
  if (req.kind !== 'base_grant' && !state.planLocked) return err('plan_not_locked');
  if (alreadyGranted(dayEvents, req)) return err('already_granted');

  const requested = requestedSeconds(req, rules);
  if (requested === null) return err('invalid_amount');

  const refId = refIdOf(req);
  const reward: LedgerEvent = {
    id: ctx.newId(),
    day: ctx.day,
    at: ctx.at,
    kind: req.kind,
    seconds: Math.min(requested, remainingCap(dayEvents, req, rules)),
    ...(refId === undefined ? {} : { refId }),
  };

  // The base grant is a guaranteed floor, so it never pays debt.
  const repay = req.kind === 'base_grant' ? 0 : Math.min(reward.seconds, state.outstandingBorrow);
  if (repay === 0) return ok([reward]);

  const repayment: LedgerEvent = {
    id: ctx.newId(),
    day: ctx.day,
    at: ctx.at,
    kind: 'borrow_repay',
    seconds: -repay,
    refId: reward.id,
  };
  return ok([reward, repayment]);
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './earning';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @mflow/core test -- earning`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add capped, idempotent earning with borrow repayment"
```

---

### Task 5: Spending, expiry and emergency unlock (`spending.ts`)

**Files:**
- Create: `packages/core/src/spending.ts`, `packages/core/test/spending.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Result`, `ok`, `err`; `Rules`; `LedgerEvent`, `EventContext`, `balance`, `sumKind`.
- Produces:
  - `spend(seconds: number, ctx: EventContext): Result<LedgerEvent, 'invalid_amount'>` (a `usage_spend` event with negative seconds)
  - `expireDay(dayEvents: readonly LedgerEvent[], ctx: EventContext): LedgerEvent | null`
  - `type UnlockRequest = Readonly<{ reason: string; waitStartedAt: number }>`
  - `type UnlockError = 'reason_too_short' | 'daily_limit_reached' | 'wait_not_finished'`
  - `unlock(dayEvents: readonly LedgerEvent[], req: UnlockRequest, ctx: EventContext, rules: Rules): Result<LedgerEvent, UnlockError>`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/spending.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES as R } from '../src/rules';
import { expireDay, spend, unlock } from '../src/spending';
import { ctx, ev } from './fixtures';

const TEN_MIN_MS = 600_000;

describe('spend', () => {
  it('creates a negative usage_spend event', () => {
    expect(spend(120, ctx())).toEqual({
      ok: true,
      value: { id: 'new-1', day: '2026-10-08', at: 1_000, kind: 'usage_spend', seconds: -120 },
    });
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid amount %s', (seconds) => {
    expect(spend(seconds, ctx())).toEqual({ ok: false, error: 'invalid_amount' });
  });
});

describe('expireDay', () => {
  it('expires a positive leftover balance', () => {
    const day = [ev({ kind: 'base_grant', seconds: 900 }), ev({ kind: 'usage_spend', seconds: -600 })];
    expect(expireDay(day, ctx())).toMatchObject({ kind: 'expire', seconds: -300 });
  });

  it('returns null when nothing is left or the balance is negative', () => {
    expect(expireDay([], ctx())).toBeNull();
    expect(expireDay([ev({ kind: 'usage_spend', seconds: -60 })], ctx())).toBeNull();
  });
});

describe('unlock', () => {
  const now = 10_000_000;
  const good = { reason: '  need to reply to a group project  ', waitStartedAt: now - TEN_MIN_MS };

  it('grants borrowed time and stores the trimmed reason', () => {
    expect(unlock([], good, ctx({ at: now }), R)).toEqual({
      ok: true,
      value: {
        id: 'new-1',
        day: '2026-10-08',
        at: now,
        kind: 'unlock_borrow',
        seconds: 600,
        reason: 'need to reply to a group project',
      },
    });
  });

  it.each(['need it', '                    ', 'x'.repeat(19)])('rejects short reason %j', (reason) => {
    expect(unlock([], { ...good, reason }, ctx({ at: now }), R)).toEqual({
      ok: false,
      error: 'reason_too_short',
    });
  });

  it('rejects before the 10-minute wait is over', () => {
    const early = { ...good, waitStartedAt: now - TEN_MIN_MS + 1_000 };
    expect(unlock([], early, ctx({ at: now }), R)).toEqual({ ok: false, error: 'wait_not_finished' });
  });

  it('allows at most two unlocks per day', () => {
    const day = [
      ev({ kind: 'unlock_borrow', seconds: 600 }),
      ev({ kind: 'unlock_borrow', seconds: 600 }),
    ];
    expect(unlock(day, good, ctx({ at: now }), R)).toEqual({ ok: false, error: 'daily_limit_reached' });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @mflow/core test -- spending`
Expected: FAIL, cannot resolve `../src/spending`.

- [ ] **Step 3: Implement `spending.ts`**

`packages/core/src/spending.ts`:
```ts
import { balance, type EventContext, type LedgerEvent } from './ledger';
import { err, ok, type Result } from './result';
import type { Rules } from './rules';

const MS_PER_SECOND = 1_000;

export function spend(seconds: number, ctx: EventContext): Result<LedgerEvent, 'invalid_amount'> {
  if (!Number.isInteger(seconds) || seconds <= 0) return err('invalid_amount');
  return ok({ id: ctx.newId(), day: ctx.day, at: ctx.at, kind: 'usage_spend', seconds: -seconds });
}

/** Unused time does not roll over. Debt (negative balance) is not expired. */
export function expireDay(dayEvents: readonly LedgerEvent[], ctx: EventContext): LedgerEvent | null {
  const left = balance(dayEvents);
  if (left <= 0) return null;
  return { id: ctx.newId(), day: ctx.day, at: ctx.at, kind: 'expire', seconds: -left };
}

export type UnlockRequest = Readonly<{ reason: string; waitStartedAt: number }>;

export type UnlockError = 'reason_too_short' | 'daily_limit_reached' | 'wait_not_finished';

export function unlock(
  dayEvents: readonly LedgerEvent[],
  req: UnlockRequest,
  ctx: EventContext,
  rules: Rules,
): Result<LedgerEvent, UnlockError> {
  const reason = req.reason.trim();
  if (reason.length < rules.unlockMinReasonLength) return err('reason_too_short');

  const unlocksToday = dayEvents.filter((e) => e.kind === 'unlock_borrow').length;
  if (unlocksToday >= rules.unlockMaxPerDay) return err('daily_limit_reached');

  if (ctx.at - req.waitStartedAt < rules.unlockWaitSeconds * MS_PER_SECOND) {
    return err('wait_not_finished');
  }

  return ok({
    id: ctx.newId(),
    day: ctx.day,
    at: ctx.at,
    kind: 'unlock_borrow',
    seconds: rules.unlockGrantSeconds,
    reason,
  });
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './spending';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @mflow/core test -- spending`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add spending, daily expiry and friction-based emergency unlock"
```

---

### Task 6: Plan lifecycle (`plan.ts`)

**Files:**
- Create: `packages/core/src/plan.ts`, `packages/core/test/plan.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/test/fixtures.ts`

**Interfaces:**
- Consumes: `Result`, `ok`, `err`; `Rules`; `DayKey`.
- Produces:
  - `VERIFIER_KINDS = ['github', 'math', 'reading', 'usage'] as const`, `type VerifierKind`
  - `type TaskVersion = Readonly<{ title: string; criteria: string; seconds: number }>`
  - `type TaskSpec = Readonly<{ id: string; skillId: string; when: string; verifier: VerifierKind; full: TaskVersion; twoMinute: TaskVersion }>`
  - `type PlanStatus = 'draft' | 'locked'`
  - `type Plan = Readonly<{ day: DayKey; status: PlanStatus; tasks: readonly TaskSpec[]; lockedAt?: number }>`
  - `type PlanError = 'plan_locked' | 'too_few_tasks' | 'too_many_tasks' | 'duplicate_task_id'`
  - `createDraft(day: DayKey, tasks: readonly TaskSpec[]): Plan`
  - `editDraft(plan: Plan, tasks: readonly TaskSpec[]): Result<Plan, PlanError>`
  - `lockPlan(plan: Plan, at: number, rules: Rules): Result<Plan, PlanError>`
  - Test helper `task(id, skillId?)` in fixtures

- [ ] **Step 1: Add the fixture and write the failing tests**

Append to `packages/core/test/fixtures.ts`:
```ts
import type { TaskSpec } from '../src/plan';

export function task(id: string, skillId = 'swe'): TaskSpec {
  return {
    id,
    skillId,
    when: '20:00 at my desk',
    verifier: 'github',
    full: { title: `Task ${id}`, criteria: 'commits that finish it', seconds: 1200 },
    twoMinute: { title: `Tiny ${id}`, criteria: 'one commit', seconds: 300 },
  };
}
```
(Move the new `import type` line to the top of the file next to the existing import.)

`packages/core/test/plan.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createDraft, editDraft, lockPlan } from '../src/plan';
import { DEFAULT_RULES as R } from '../src/rules';
import { task } from './fixtures';

const three = [task('a'), task('b'), task('c')];

describe('plan lifecycle', () => {
  it('creates a draft', () => {
    expect(createDraft('2026-10-09', three)).toEqual({ day: '2026-10-09', status: 'draft', tasks: three });
  });

  it('edits a draft into a new object without touching the original', () => {
    const draft = createDraft('2026-10-09', three);
    const edited = editDraft(draft, [...three, task('d')]);
    expect(edited.ok && edited.value.tasks).toHaveLength(4);
    expect(draft.tasks).toHaveLength(3);
  });

  it('rejects duplicate task ids', () => {
    const draft = createDraft('2026-10-09', three);
    expect(editDraft(draft, [task('a'), task('a'), task('b')])).toEqual({
      ok: false,
      error: 'duplicate_task_id',
    });
  });

  it('locks a plan with 3 to 5 tasks', () => {
    const locked = lockPlan(createDraft('2026-10-09', three), 5_000, R);
    expect(locked).toEqual({
      ok: true,
      value: { day: '2026-10-09', status: 'locked', tasks: three, lockedAt: 5_000 },
    });
  });

  it('refuses to lock too few or too many tasks', () => {
    expect(lockPlan(createDraft('2026-10-09', [task('a'), task('b')]), 1, R)).toEqual({
      ok: false,
      error: 'too_few_tasks',
    });
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => task(id));
    expect(lockPlan(createDraft('2026-10-09', six), 1, R)).toEqual({ ok: false, error: 'too_many_tasks' });
  });

  it('refuses to lock a plan with duplicate task ids', () => {
    const dup = createDraft('2026-10-09', [task('a'), task('a'), task('b')]);
    expect(lockPlan(dup, 1, R)).toEqual({ ok: false, error: 'duplicate_task_id' });
  });

  it('makes a locked plan immutable', () => {
    const locked = lockPlan(createDraft('2026-10-09', three), 1, R);
    if (!locked.ok) throw new Error('setup failed');
    expect(editDraft(locked.value, three)).toEqual({ ok: false, error: 'plan_locked' });
    expect(lockPlan(locked.value, 2, R)).toEqual({ ok: false, error: 'plan_locked' });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @mflow/core test -- plan`
Expected: FAIL, cannot resolve `../src/plan`.

- [ ] **Step 3: Implement `plan.ts`**

`packages/core/src/plan.ts`:
```ts
import { err, ok, type Result } from './result';
import type { Rules } from './rules';
import type { DayKey } from './time';

export const VERIFIER_KINDS = ['github', 'math', 'reading', 'usage'] as const;
export type VerifierKind = (typeof VERIFIER_KINDS)[number];

export type TaskVersion = Readonly<{ title: string; criteria: string; seconds: number }>;

/** `when` is the implementation intention: time + anchor habit ("after Fajr, at my desk"). */
export type TaskSpec = Readonly<{
  id: string;
  skillId: string;
  when: string;
  verifier: VerifierKind;
  full: TaskVersion;
  twoMinute: TaskVersion;
}>;

export type PlanStatus = 'draft' | 'locked';

export type Plan = Readonly<{
  day: DayKey;
  status: PlanStatus;
  tasks: readonly TaskSpec[];
  lockedAt?: number;
}>;

export type PlanError = 'plan_locked' | 'too_few_tasks' | 'too_many_tasks' | 'duplicate_task_id';

const hasDuplicateIds = (tasks: readonly TaskSpec[]): boolean =>
  new Set(tasks.map((t) => t.id)).size !== tasks.length;

export const createDraft = (day: DayKey, tasks: readonly TaskSpec[]): Plan => ({
  day,
  status: 'draft',
  tasks,
});

export function editDraft(plan: Plan, tasks: readonly TaskSpec[]): Result<Plan, PlanError> {
  if (plan.status === 'locked') return err('plan_locked');
  if (hasDuplicateIds(tasks)) return err('duplicate_task_id');
  return ok({ ...plan, tasks });
}

export function lockPlan(plan: Plan, at: number, rules: Rules): Result<Plan, PlanError> {
  if (plan.status === 'locked') return err('plan_locked');
  if (hasDuplicateIds(plan.tasks)) return err('duplicate_task_id');
  if (plan.tasks.length < rules.planMinTasks) return err('too_few_tasks');
  if (plan.tasks.length > rules.planMaxTasks) return err('too_many_tasks');
  return ok({ ...plan, status: 'locked', lockedAt: at });
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './plan';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @mflow/core test -- plan`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add plan lifecycle with immutable lock"
```

---

### Task 7: Day types (`day-types.ts`)

**Files:**
- Create: `packages/core/src/day-types.ts`, `packages/core/test/day-types.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Result`, `ok`, `err`; `Rules`; `DayKey`, `isoWeekKey`, `monthKey`, `weekdayOf`; `Plan`, `TaskVersion`.
- Produces:
  - `type DayKind = 'normal' | 'bad' | 'away'`
  - `type AwayVerification = 'pending' | 'yes' | 'no' | 'unknown'`
  - `type DayRecord = Readonly<{ day: DayKey; kind: DayKind; away?: Readonly<{ place: string; keptTaskIds: readonly string[]; verified: AwayVerification }> }>`
  - `type DayTypeError = 'already_declared' | 'bad_day_limit_reached'`
  - `declareBadDay(history: readonly DayRecord[], day: DayKey, rules: Rules): Result<DayRecord, DayTypeError>`
  - `declareAway(history: readonly DayRecord[], day: DayKey, place: string, keptTaskIds: readonly string[]): Result<DayRecord, DayTypeError>`
  - `applyAwayVerification(history: readonly DayRecord[], record: DayRecord, verified: 'yes' | 'no' | 'unknown', rules: Rules): DayRecord`
  - `isRestDay(restWeekday: number | undefined, day: DayKey): boolean`
  - `type RequiredTask = Readonly<{ taskId: string; version: TaskVersion }>`
  - `requiredTasks(plan: Plan, record: DayRecord | undefined, restWeekdayBySkill: ReadonlyMap<string, number>): RequiredTask[]`

Notes: an away *window* spanning several days is expanded into one `DayRecord` per day by the API layer (P3). A non-away record passed to `applyAwayVerification` is returned unchanged. `'no'` cancels away mode (the day becomes normal). `'unknown'` keeps away mode only while fewer than `unverifiedAwayPerMonth` other days in the same month are `'unknown'`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/day-types.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  applyAwayVerification,
  declareAway,
  declareBadDay,
  isRestDay,
  requiredTasks,
  type DayRecord,
} from '../src/day-types';
import { createDraft } from '../src/plan';
import { DEFAULT_RULES as R } from '../src/rules';
import { task } from './fixtures';

const awayUnknown = (day: string): DayRecord => ({
  day,
  kind: 'away',
  away: { place: 'Dushanbe', keptTaskIds: [], verified: 'unknown' },
});

describe('declareBadDay', () => {
  it('allows one bad day per ISO week', () => {
    const first = declareBadDay([], '2026-10-08', R);
    expect(first).toEqual({ ok: true, value: { day: '2026-10-08', kind: 'bad' } });
    const history = first.ok ? [first.value] : [];
    expect(declareBadDay(history, '2026-10-10', R)).toEqual({ ok: false, error: 'bad_day_limit_reached' });
  });

  it('treats Sunday and the following Monday as different weeks', () => {
    const history: DayRecord[] = [{ day: '2026-10-11', kind: 'bad' }];
    expect(declareBadDay(history, '2026-10-12', R).ok).toBe(true);
  });

  it('refuses to redeclare a day that already has a type', () => {
    const history: DayRecord[] = [awayUnknown('2026-10-08')];
    expect(declareBadDay(history, '2026-10-08', R)).toEqual({ ok: false, error: 'already_declared' });
  });
});

describe('declareAway', () => {
  it('starts as pending verification and keeps the chosen tasks', () => {
    expect(declareAway([], '2026-10-10', 'Dushanbe', ['t1'])).toEqual({
      ok: true,
      value: {
        day: '2026-10-10',
        kind: 'away',
        away: { place: 'Dushanbe', keptTaskIds: ['t1'], verified: 'pending' },
      },
    });
  });

  it('refuses a day that already has a type', () => {
    const history: DayRecord[] = [{ day: '2026-10-10', kind: 'bad' }];
    expect(declareAway(history, '2026-10-10', 'Dushanbe', [])).toEqual({ ok: false, error: 'already_declared' });
  });
});

describe('applyAwayVerification', () => {
  const declared = declareAway([], '2026-10-10', 'Dushanbe', ['t1']);
  if (!declared.ok) throw new Error('setup failed');
  const record = declared.value;

  it('keeps away mode when verified', () => {
    expect(applyAwayVerification([], record, 'yes', R).away?.verified).toBe('yes');
  });

  it('cancels away mode when the owner is found at home', () => {
    expect(applyAwayVerification([], record, 'no', R)).toEqual({ day: '2026-10-10', kind: 'normal' });
  });

  it('allows up to two unverified away days per month', () => {
    const history = [awayUnknown('2026-10-02')];
    expect(applyAwayVerification(history, record, 'unknown', R).kind).toBe('away');
  });

  it('falls back to a normal day once the unverified allowance is used', () => {
    const history = [awayUnknown('2026-10-02'), awayUnknown('2026-10-05')];
    expect(applyAwayVerification(history, record, 'unknown', R)).toEqual({ day: '2026-10-10', kind: 'normal' });
  });

  it('leaves a record that is not an away day unchanged', () => {
    const bad: DayRecord = { day: '2026-10-10', kind: 'bad' };
    expect(applyAwayVerification([], bad, 'no', R)).toBe(bad);
  });

  it('does not count unverified days from other months', () => {
    const history = [awayUnknown('2026-09-20'), awayUnknown('2026-09-25')];
    expect(applyAwayVerification(history, record, 'unknown', R).kind).toBe('away');
  });
});

describe('isRestDay', () => {
  it('matches the configured weekday', () => {
    expect(isRestDay(5, '2026-10-09')).toBe(true);
    expect(isRestDay(5, '2026-10-08')).toBe(false);
    expect(isRestDay(undefined, '2026-10-09')).toBe(false);
  });
});

describe('requiredTasks', () => {
  const plan = createDraft('2026-10-09', [task('a', 'swe'), task('b', 'math'), task('c', 'reading')]);
  const rest = new Map([['swe', 5]]); // Friday rest for software engineering

  it('skips rest-day skills and uses full versions on a normal day', () => {
    const result = requiredTasks(plan, undefined, rest);
    expect(result.map((r) => r.taskId)).toEqual(['b', 'c']);
    expect(result[0]?.version.seconds).toBe(1200);
  });

  it('uses the 2-minute versions on a bad day', () => {
    const result = requiredTasks(plan, { day: '2026-10-09', kind: 'bad' }, new Map());
    expect(result.map((r) => r.version.title)).toEqual(['Tiny a', 'Tiny b', 'Tiny c']);
  });

  it.each(['pending', 'yes', 'unknown'] as const)('keeps only chosen tasks when away (%s)', (verified) => {
    const record: DayRecord = {
      day: '2026-10-09',
      kind: 'away',
      away: { place: 'Dushanbe', keptTaskIds: ['c'], verified },
    };
    expect(requiredTasks(plan, record, new Map()).map((r) => r.taskId)).toEqual(['c']);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @mflow/core test -- day-types`
Expected: FAIL, cannot resolve `../src/day-types`.

- [ ] **Step 3: Implement `day-types.ts`**

`packages/core/src/day-types.ts`:
```ts
import type { Plan, TaskVersion } from './plan';
import { err, ok, type Result } from './result';
import type { Rules } from './rules';
import { isoWeekKey, monthKey, weekdayOf, type DayKey } from './time';

export type DayKind = 'normal' | 'bad' | 'away';
export type AwayVerification = 'pending' | 'yes' | 'no' | 'unknown';

export type DayRecord = Readonly<{
  day: DayKey;
  kind: DayKind;
  away?: Readonly<{ place: string; keptTaskIds: readonly string[]; verified: AwayVerification }>;
}>;

export type DayTypeError = 'already_declared' | 'bad_day_limit_reached';

const isDeclared = (history: readonly DayRecord[], day: DayKey): boolean =>
  history.some((r) => r.day === day && r.kind !== 'normal');

export function declareBadDay(
  history: readonly DayRecord[],
  day: DayKey,
  rules: Rules,
): Result<DayRecord, DayTypeError> {
  if (isDeclared(history, day)) return err('already_declared');
  const week = isoWeekKey(day);
  const usedThisWeek = history.filter((r) => r.kind === 'bad' && isoWeekKey(r.day) === week).length;
  if (usedThisWeek >= rules.badDaysPerWeek) return err('bad_day_limit_reached');
  return ok({ day, kind: 'bad' });
}

export function declareAway(
  history: readonly DayRecord[],
  day: DayKey,
  place: string,
  keptTaskIds: readonly string[],
): Result<DayRecord, DayTypeError> {
  if (isDeclared(history, day)) return err('already_declared');
  return ok({ day, kind: 'away', away: { place, keptTaskIds, verified: 'pending' } });
}

export function applyAwayVerification(
  history: readonly DayRecord[],
  record: DayRecord,
  verified: 'yes' | 'no' | 'unknown',
  rules: Rules,
): DayRecord {
  if (record.kind !== 'away' || record.away === undefined) return record;
  const normal: DayRecord = { day: record.day, kind: 'normal' };
  if (verified === 'no') return normal;

  if (verified === 'unknown') {
    const month = monthKey(record.day);
    const unknownThisMonth = history.filter(
      (r) => r.day !== record.day && r.away?.verified === 'unknown' && monthKey(r.day) === month,
    ).length;
    if (unknownThisMonth >= rules.unverifiedAwayPerMonth) return normal;
  }

  return { ...record, away: { ...record.away, verified } };
}

export const isRestDay = (restWeekday: number | undefined, day: DayKey): boolean =>
  restWeekday !== undefined && weekdayOf(day) === restWeekday;

export type RequiredTask = Readonly<{ taskId: string; version: TaskVersion }>;

/** The tasks that must pass today, after rest days, bad-day shrinking and away exclusions. */
export function requiredTasks(
  plan: Plan,
  record: DayRecord | undefined,
  restWeekdayBySkill: ReadonlyMap<string, number>,
): RequiredTask[] {
  const kept = record?.kind === 'away' ? new Set(record.away?.keptTaskIds ?? []) : null;
  const isBad = record?.kind === 'bad';
  return plan.tasks
    .filter((t) => !isRestDay(restWeekdayBySkill.get(t.skillId), plan.day))
    .filter((t) => kept === null || kept.has(t.id))
    .map((t) => ({ taskId: t.id, version: isBad ? t.twoMinute : t.full }));
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './day-types';
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @mflow/core test -- day-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add rest, bad and away day types with limits"
```

---

### Task 8: Verdicts and the Verifier port (`verdict.ts`)

**Files:**
- Create: `packages/core/src/verdict.ts`, `packages/core/test/verdict.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Rules`; `TaskSpec`, `VerifierKind`; `RequiredTask`.
- Produces:
  - `type VerdictOutcome = 'pass' | 'fail' | 'pending'`
  - `type VerdictSource = 'code' | 'judge' | 'coach' | 'owner'`
  - `type Verdict = Readonly<{ taskId: string; evidenceIds: readonly string[]; outcome: VerdictOutcome; confidence: number; by: VerdictSource }>`
  - `type Decision = Readonly<{ pass: boolean; confidence: number }>`
  - `resolveDecision(taskId: string, evidenceIds: readonly string[], decision: Decision, by: VerdictSource, rules: Rules): Verdict`
  - `allPassed(required: readonly RequiredTask[], verdicts: readonly Verdict[]): boolean`
  - `interface Verifier<TEvidence> { readonly kind: VerifierKind; collect(sinceMs: number): Promise<readonly TEvidence[]>; judge(task: TaskSpec, evidence: readonly TEvidence[]): Promise<Verdict> }`

Rules: confidence below the threshold, NaN, or outside [0, 1] gives `pending` (never auto pass/fail). A task counts as passed once **any** of its verdicts is `pass` (a later rebase can't un-pass it). An empty required list is **not** "all passed" (no plan means no bonus).

- [ ] **Step 1: Write the failing tests**

`packages/core/test/verdict.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { TaskSpec } from '../src/plan';
import { DEFAULT_RULES as R } from '../src/rules';
import { allPassed, resolveDecision, type Verdict, type Verifier } from '../src/verdict';
import { task } from './fixtures';

const verdict = (taskId: string, outcome: Verdict['outcome']): Verdict => ({
  taskId,
  evidenceIds: ['ev1'],
  outcome,
  confidence: 0.9,
  by: 'judge',
});

describe('resolveDecision', () => {
  it('passes or fails when confident', () => {
    expect(resolveDecision('t1', ['ev1'], { pass: true, confidence: 0.9 }, 'judge', R).outcome).toBe('pass');
    expect(resolveDecision('t1', ['ev1'], { pass: false, confidence: 0.9 }, 'judge', R).outcome).toBe('fail');
  });

  it.each([0.74, Number.NaN, -0.1, 1.2])('marks confidence %s as pending', (confidence) => {
    expect(resolveDecision('t1', ['ev1'], { pass: true, confidence }, 'judge', R).outcome).toBe('pending');
  });

  it('keeps the evidence trail', () => {
    const v = resolveDecision('t1', ['ev1', 'ev2'], { pass: true, confidence: 1 }, 'code', R);
    expect(v).toEqual({ taskId: 't1', evidenceIds: ['ev1', 'ev2'], outcome: 'pass', confidence: 1, by: 'code' });
  });
});

describe('allPassed', () => {
  const required = [
    { taskId: 'a', version: task('a').full },
    { taskId: 'b', version: task('b').full },
  ];

  it('is false while any required task lacks a pass', () => {
    expect(allPassed(required, [verdict('a', 'pass'), verdict('b', 'pending')])).toBe(false);
  });

  it('is true once every required task has a pass, even if a later verdict failed', () => {
    const verdicts = [verdict('a', 'pass'), verdict('b', 'pass'), verdict('a', 'fail')];
    expect(allPassed(required, verdicts)).toBe(true);
  });

  it('is false when nothing is required', () => {
    expect(allPassed([], [verdict('a', 'pass')])).toBe(false);
  });
});

describe('Verifier port', () => {
  it('can be implemented by an adapter', async () => {
    const fake: Verifier<string> = {
      kind: 'reading',
      collect: async () => ['log-1'],
      judge: async (t: TaskSpec, evidence) =>
        resolveDecision(t.id, evidence, { pass: true, confidence: 0.8 }, 'judge', R),
    };
    const evidence = await fake.collect(0);
    expect((await fake.judge(task('r1'), evidence)).outcome).toBe('pass');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @mflow/core test -- verdict`
Expected: FAIL, cannot resolve `../src/verdict`.

- [ ] **Step 3: Implement `verdict.ts`**

`packages/core/src/verdict.ts`:
```ts
import type { RequiredTask } from './day-types';
import type { TaskSpec, VerifierKind } from './plan';
import type { Rules } from './rules';

export type VerdictOutcome = 'pass' | 'fail' | 'pending';
export type VerdictSource = 'code' | 'judge' | 'coach' | 'owner';

export type Verdict = Readonly<{
  taskId: string;
  evidenceIds: readonly string[];
  outcome: VerdictOutcome;
  confidence: number;
  by: VerdictSource;
}>;

export type Decision = Readonly<{ pass: boolean; confidence: number }>;

/** Port implemented by GitHub, Math, Reading and Usage adapters (and future evidence packs). */
export interface Verifier<TEvidence> {
  readonly kind: VerifierKind;
  collect(sinceMs: number): Promise<readonly TEvidence[]>;
  judge(task: TaskSpec, evidence: readonly TEvidence[]): Promise<Verdict>;
}

const isValidConfidence = (c: number): boolean => Number.isFinite(c) && c >= 0 && c <= 1;

/** Automate when confident; otherwise escalate. Never silently pass or fail. */
export function resolveDecision(
  taskId: string,
  evidenceIds: readonly string[],
  decision: Decision,
  by: VerdictSource,
  rules: Rules,
): Verdict {
  const confident =
    isValidConfidence(decision.confidence) && decision.confidence >= rules.judgeConfidenceThreshold;
  const outcome: VerdictOutcome = !confident ? 'pending' : decision.pass ? 'pass' : 'fail';
  return { taskId, evidenceIds, outcome, confidence: decision.confidence, by };
}

export function allPassed(required: readonly RequiredTask[], verdicts: readonly Verdict[]): boolean {
  if (required.length === 0) return false;
  const passed = new Set(verdicts.filter((v) => v.outcome === 'pass').map((v) => v.taskId));
  return required.every((r) => passed.has(r.taskId));
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './verdict';
```

- [ ] **Step 4: Run the whole core suite with coverage**

Run: `pnpm --filter @mflow/core coverage`
Expected: all tests PASS; coverage ≥ 90% on every metric (the run fails if not).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add verdict resolution with confidence threshold and Verifier port"
```

---

### Task 9: Edge contracts (`@mflow/contracts`)

**Files:**
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/vitest.config.ts`, `packages/contracts/src/schemas.ts`, `packages/contracts/src/index.ts`, `packages/contracts/test/schemas.test.ts`

**Interfaces:**
- Consumes: from `@mflow/core`: `LEDGER_EVENT_KINDS`, `VERIFIER_KINDS`, `parseDayKey`, types `LedgerEvent`, `Plan`, `TaskSpec`.
- Produces:
  - `DayKeySchema`, `LedgerEventSchema`, `LedgerEventBatchSchema` (1–500 events), `TaskVersionSchema`, `TaskSpecSchema`, `PlanSchema`, `ApiErrorSchema`
  - `envelope<T extends z.ZodType>(data: T)`: a discriminated union `{ ok: true, data, error: null } | { ok: false, data: null, error: ApiError }`
  - `MAX_EVENTS_PER_BATCH = 500`

- [ ] **Step 1: Create the package**

`packages/contracts/package.json`:
```json
{
  "name": "@mflow/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "coverage": "vitest run --coverage"
  }
}
```

```bash
mkdir -p packages/contracts/src packages/contracts/test
pnpm --filter @mflow/contracts add zod @mflow/core@workspace:*
pnpm --filter @mflow/contracts add -D typescript vitest @vitest/coverage-v8
```

`packages/contracts/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/contracts/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
```

- [ ] **Step 2: Write the failing tests**

`packages/contracts/test/schemas.test.ts`:
```ts
import type { LedgerEvent, Plan } from '@mflow/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DayKeySchema,
  envelope,
  LedgerEventBatchSchema,
  LedgerEventSchema,
  PlanSchema,
} from '../src/schemas';

const UUID7 = '0199c4a2-7b3e-7c4d-8e5f-0123456789ab';

const event = {
  id: UUID7,
  day: '2026-10-08',
  at: 1_791_500_000_000,
  kind: 'usage_spend',
  seconds: -120,
};

const taskSpec = {
  id: '0199c4a2-7b3e-7c4d-8e5f-0123456789ac',
  skillId: 'swe',
  when: '20:00 at my desk',
  verifier: 'github',
  full: { title: 'Finish parser errors', criteria: 'commits in parser/ add error handling', seconds: 1200 },
  twoMinute: { title: 'One parser commit', criteria: 'any commit in parser/', seconds: 300 },
};

describe('DayKeySchema', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(DayKeySchema.safeParse('2026-10-08').success).toBe(true);
    expect(DayKeySchema.safeParse('2026-02-30').success).toBe(false);
  });
});

describe('LedgerEventSchema', () => {
  it('parses a valid event into the domain type', () => {
    const parsed: LedgerEvent = LedgerEventSchema.parse(event);
    expect(parsed).toEqual(event);
  });

  it.each([
    ['unknown kind', { ...event, kind: 'free_money' }],
    ['fractional seconds', { ...event, seconds: 1.5 }],
    ['non-uuid id', { ...event, id: 'e-1' }],
    ['bad day', { ...event, day: '2026-13-01' }],
  ])('rejects %s', (_label, value) => {
    expect(LedgerEventSchema.safeParse(value).success).toBe(false);
  });
});

describe('LedgerEventBatchSchema', () => {
  it('rejects empty and oversized batches', () => {
    expect(LedgerEventBatchSchema.safeParse({ events: [] }).success).toBe(false);
    const big = { events: Array.from({ length: 501 }, () => event) };
    expect(LedgerEventBatchSchema.safeParse(big).success).toBe(false);
  });

  it('accepts a normal batch', () => {
    expect(LedgerEventBatchSchema.safeParse({ events: [event] }).success).toBe(true);
  });
});

describe('PlanSchema', () => {
  it('parses a plan into the domain type and exports a JSON schema for LLMs', () => {
    const plan: Plan = PlanSchema.parse({ day: '2026-10-09', status: 'draft', tasks: [taskSpec] });
    expect(plan.tasks).toHaveLength(1);
    expect(z.toJSONSchema(PlanSchema)).toMatchObject({ type: 'object' });
  });

  it('rejects a task worth more than the daily cap', () => {
    const greedy = { ...taskSpec, full: { ...taskSpec.full, seconds: 7201 } };
    expect(PlanSchema.safeParse({ day: '2026-10-09', status: 'draft', tasks: [greedy] }).success).toBe(false);
  });
});

describe('envelope', () => {
  const Response = envelope(z.object({ balance: z.number() }));

  it('accepts success and error shapes', () => {
    expect(Response.safeParse({ ok: true, data: { balance: 5 }, error: null }).success).toBe(true);
    expect(
      Response.safeParse({ ok: false, data: null, error: { code: 'not_found', message: 'No plan' } })
        .success,
    ).toBe(true);
  });

  it('rejects an error response that also carries data', () => {
    expect(
      Response.safeParse({ ok: false, data: { balance: 5 }, error: { code: 'x', message: 'y' } }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `pnpm --filter @mflow/contracts test`
Expected: FAIL, cannot resolve `../src/schemas`.

- [ ] **Step 4: Implement the schemas**

`packages/contracts/src/schemas.ts`:
```ts
import { LEDGER_EVENT_KINDS, parseDayKey, VERIFIER_KINDS } from '@mflow/core';
import { z } from 'zod';

export const MAX_EVENTS_PER_BATCH = 500;
const MAX_TASK_SECONDS = 7_200; // never more than the daily cap
const MAX_TASKS_IN_PLAN = 10; // drafts may exceed the lock limit while editing

const isValidDayKey = (value: string): boolean => {
  try {
    parseDayKey(value);
    return true;
  } catch {
    return false;
  }
};

export const DayKeySchema = z.string().refine(isValidDayKey, { message: 'invalid day key' });

export const LedgerEventSchema = z.object({
  id: z.uuid(),
  day: DayKeySchema,
  at: z.number().int().nonnegative(),
  kind: z.enum(LEDGER_EVENT_KINDS),
  seconds: z.number().int(),
  refId: z.string().min(1).max(128).optional(),
  reason: z.string().max(500).optional(),
});

export const LedgerEventBatchSchema = z.object({
  events: z.array(LedgerEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

export const TaskVersionSchema = z.object({
  title: z.string().min(1).max(120),
  criteria: z.string().min(1).max(500),
  seconds: z.number().int().positive().max(MAX_TASK_SECONDS),
});

export const TaskSpecSchema = z.object({
  id: z.uuid(),
  skillId: z.string().min(1).max(64),
  when: z.string().min(1).max(120),
  verifier: z.enum(VERIFIER_KINDS),
  full: TaskVersionSchema,
  twoMinute: TaskVersionSchema,
});

export const PlanSchema = z.object({
  day: DayKeySchema,
  status: z.enum(['draft', 'locked']),
  tasks: z.array(TaskSpecSchema).max(MAX_TASKS_IN_PLAN),
  lockedAt: z.number().int().nonnegative().optional(),
});

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
});

/** Every API response: success carries data, failure carries an error, never both. */
export function envelope<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data, error: z.null() }),
    z.object({ ok: z.literal(false), data: z.null(), error: ApiErrorSchema }),
  ]);
}
```

`packages/contracts/src/index.ts`:
```ts
export * from './schemas';
```

- [ ] **Step 5: Run the tests, coverage and typecheck**

Run: `pnpm --filter @mflow/contracts coverage && pnpm typecheck`
Expected: all PASS; coverage ≥ 80%. The typecheck proves the parsed values are assignable to the `LedgerEvent` and `Plan` domain types.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts pnpm-lock.yaml
git commit -m "feat(contracts): add zod edge schemas mapped to core domain types"
```

---

### Task 10: Full verification

**Files:**
- Modify: `README.md` (status line only, if needed)

- [ ] **Step 1: Run the full CI sequence locally**

```bash
pnpm install --frozen-lockfile
pnpm format:check && pnpm lint && pnpm typecheck && pnpm coverage
```
Expected: every command exits 0; core ≥ 90% and contracts ≥ 80% coverage.

- [ ] **Step 2: Confirm the boundaries hold**

```bash
grep -rnE "from '(zod|node:|@cloudflare|react)" packages/core/src && echo "VIOLATION" || echo "core is pure"
grep -rn "Date.now\|Math.random\|crypto" packages/core/src && echo "VIOLATION" || echo "no hidden I/O"
git log --format='%an <%ae>%n%b' | grep -i "co-authored\|claude" && echo "VIOLATION" || echo "authorship clean"
git status --short learning/ ; git check-ignore learning/ && echo "learning/ ignored"
```
Expected: `core is pure`, `no hidden I/O`, `authorship clean`, `learning/ ignored`.

- [ ] **Step 3: Commit any formatting fixes**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: finalize phase 1 foundation"
```

- [ ] **Step 4: Write the private learning note (not committed)**

Create `learning/01-phase1-foundation.md` covering: what each file in `packages/core` does and why it's pure; how `Result` differs from exceptions; how the ISO-week math works; why the ledger stores seconds; how `earn` clips at caps and repays borrow (walk through the "repays outstanding borrow" test); why `allPassed` treats "any pass" as passed; what `z.toJSONSchema` will be used for in P3; and 5 self-check questions. Confirm with `git status` that it does not appear.
