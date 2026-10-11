# mflow P3b: AI router, roadmap onboarding and plan proposals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `packages/ai`, a provider-agnostic `talk`/`judge` router. It has Gemini and Jev adapters, structured output with one repair retry, provider fallback and a daily budget guard. The API then stores the owner's roadmap (identities, skills, milestones) and proposes the night-before plan with `POST /v1/plans/:day/propose`. The AI proposes, and a deterministic template takes over whenever the AI is unavailable or wrong.

**Architecture:**

- `packages/ai` is pure TypeScript with injected `fetch`, a usage counter and the day, and no Workers APIs. Each provider adapter validates its HTTP output with zod (the edge), and `createAi` composes providers in order.
- `apps/api` builds the router per request from Worker secrets (`aiFromEnv`), counts usage in D1 (`ai_usage`), and keeps the proposal logic in `src/planning/propose.ts`: a pure template plus the AI path.
- Tests never call the network. Adapters are tested against recorded response shapes copied from the official docs.

**Tech Stack:** TypeScript 6, zod 4 (`z.toJSONSchema` for provider schemas), Vitest 5, the Gemini `generateContent` REST API, the TypeSafe Jev REST API (`POST /v1/systemone`), Hono and D1 (from P3a).

**Spec:** `docs/superpowers/specs/2026-10-08-mflow-v1-design.md` (§2.3, §6.2, §8, §9.1–9.2, §11, §12, §13.1 apply).

**Scope (P3 re-split, ruled here):** proposals need the roadmap, so the identities/skills/milestones part of onboarding moves from P3c into P3b. P3c keeps the GitHub link and verifier, reading judging, coach chat and memory, `GET /math/bank` and cron.

## Facts this plan relies on (checked 2026-10-11)

- **Gemini** `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
  - Header: `x-goog-api-key`.
  - Body: `{ systemInstruction: { parts: [{ text }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema } }`.
  - Response: `candidates[0].content.parts[].text`.
  - Google now recommends the new Interactions API, but `generateContent` "remains fully supported" and, unlike Interactions, stores nothing server-side, which fits data minimization.
  - Current model ids include `gemini-3.5-flash-lite` and `gemini-3.6-flash`. Free-tier quotas are shown per project in AI Studio and reset at midnight Pacific.
- **Jev** (TypeSafe) `POST https://api.typesafe.ai/v1/systemone`.
  - Headers: `Authorization: Bearer <key>`.
  - Body: `{ model: 'jev-latest', state, questions }`.
  - Response: `{ model, answers, usage }`. Answers by type:
    - `noul`: `{ type, noul }`
    - `choice`: `{ type, choice, confidence, probabilities }`
    - `score`: `{ type, score, confidence, legend, probabilities }`
  - Score criteria are a list of at least 2 entries.
  - Jev is also on Workers AI (`typesafe/jev`), but as a third-party model paid through AI Gateway credits, so neither route is free. Without a `JEV_API_KEY`, `judge` uses Gemini imitating Jev's answer shape (spec §8).

## Global Constraints

- Bun for installs and scripts (`bun x`, never `bunx`/`npx`/pnpm). TypeScript `^6`, Vitest `^5.0.3`, ESM, strict.
- `packages/ai` imports `@mflow/core` (for `Result`) and `zod` only. No Workers or Node APIs. `fetch` is injected as `FetchLike`.
- Never throw out of a provider or the router. Every failure is a `Result` error: `'unavailable' | 'rate_limited' | 'unauthorized' | 'invalid_output'` from providers, and `'ai_unavailable'` from the router.
- Structured output: zod schema → JSON Schema (`z.toJSONSchema`, `$schema` removed) → provider. The output is validated with the same zod schema. On failure, **one** repair retry on the same provider, then the next provider (spec §8).
- Budget guard: daily request counters per provider (in D1 for the API). A provider at its limit is skipped. `flourish` calls stop at 80% of the limit; `essential` calls (proposals, verification) can use 100%.
- All AI unavailable → the plan is the deterministic template. Verdicts are never auto-passed or failed (spec §13.1).
- Data minimization: prompts contain only identities (title, why, deadline), skills (id, name, rubric, verifier) and open milestones. Never location, ledger, chat or device data. The AI layer logs nothing.
- Secrets `GEMINI_API_KEY` and `JEV_API_KEY` are optional Worker secrets, never in the repo. `.dev.vars.example` lists them empty.
- Coverage: `packages/ai` ≥ 90 (lines, branches, functions, statements); `apps/api` keeps 90/85/90/90.
- Commits use the conventional format under the owner's identity. **No `Co-Authored-By` or AI attribution.** `learning/` is never committed.

## Review Focus

1. **A provider answers 200 with prose, fenced JSON or JSON that breaks the schema.** Expected: fences are tolerated, one repair retry, then the next provider, then the template. Never a 500, and never an invalid task in a plan. Pinned in Tasks 4 and 7.
2. **The AI returns tasks for a skill that isn't active that day (rest day or invented id), or titles over the length limits.** Expected: those tasks are dropped, or the schema rejects them. If nothing valid remains, the template is used. Pinned in Task 7.
3. **The daily budget is exhausted for every provider.** Expected: the router reports `ai_unavailable` without calling any provider, and the proposal falls back to the template. `flourish` stops earlier than `essential`. Pinned in Tasks 4 and 7.
4. **The Jev or Gemini judge answers with a choice that isn't an option, a score outside the scale, or a missing question.** Expected: `invalid_output`, then the next provider. Pinned in Tasks 1, 2 and 3.
5. **The roadmap references an unknown identity or skill, or repeats an id.** Expected: 400, nothing written. Replacing the roadmap is all-or-nothing. Pinned in Task 6.

---

## File Structure

```
packages/ai/
├─ package.json  tsconfig.json  vitest.config.ts
├─ src/
│  ├─ index.ts          public exports
│  ├─ types.ts          FetchLike, ProviderError, TalkRequest/TalkProvider, Question/Answer, JudgeProvider
│  ├─ http.ts           postJson: fetch → Result (status mapping, JSON parsing)
│  ├─ answers.ts        parseAnswers: validate Jev-shaped answers against the questions
│  ├─ jev.ts            jevJudge
│  ├─ gemini.ts         geminiTalk, geminiJudge (Jev shape imitated from probabilities)
│  └─ router.ts         createAi: talkText, talkJson (repair + fallback), judge, budget guard
└─ test/
   ├─ fakes.ts  answers.test.ts  jev.test.ts  gemini.test.ts  router.test.ts
packages/contracts/src/onboarding.ts   RoadmapSchema, ProposeResponseSchema (+ test/onboarding.test.ts)
apps/api/
├─ migrations/0002_roadmap_ai_usage.sql
├─ src/ai.ts                           aiFromEnv, timeoutFetch, model ids and limits
├─ src/adapters/d1/roadmap.ts  ai-usage.ts
├─ src/planning/propose.ts             activeSkills, templateTasks, proposalPrompt, aiTasks
├─ src/routes/onboarding.ts  propose.ts
└─ test/onboarding.test.ts  ai-wiring.test.ts  propose.test.ts
docs/adr/0007-ai-router.md
```

---

### Task 1: `packages/ai` scaffold, types, `postJson` and `parseAnswers`

**Files:**

- Create: `packages/ai/package.json`, `packages/ai/tsconfig.json`, `packages/ai/vitest.config.ts`, `packages/ai/src/index.ts`, `packages/ai/src/types.ts`, `packages/ai/src/http.ts`, `packages/ai/src/answers.ts`, `packages/ai/test/fakes.ts`, `packages/ai/test/answers.test.ts`

**Interfaces:**

- Produces: the types `FetchLike`, `ProviderError`, `TalkRequest`, `TalkProvider`, `NoulQuestion`, `ChoiceQuestion`, `ScoreQuestion`, `Question`, `Questions`, `NoulAnswer`, `ChoiceAnswer`, `ScoreAnswer`, `Answer`, `Answers`, `JudgeState`, `JudgeProvider`.
- Produces: `postJson(fetch, url, headers, body): Promise<Result<unknown, ProviderError>>` and `parseAnswers(raw, questions): Result<Answers, 'invalid_output'>`.
- Produces (tests): `fakeFetch(responses)`, which returns `{ fetch, calls }`, and `jsonResponse(status, body)`.

- [ ] **Step 1: Write the package files**

`packages/ai/package.json`:

```json
{
  "name": "@mflow/ai",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@mflow/core": "workspace:*",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^5.0.3",
    "typescript": "^6",
    "vitest": "^5.0.3"
  }
}
```

`packages/ai/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/ai/vitest.config.ts`:

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

`packages/ai/src/types.ts`:

```ts
import type { Result } from '@mflow/core';

/** The slice of `fetch` the adapters use, injected so tests and runtimes supply their own. */
export type FetchLike = (
  url: string,
  init: Readonly<{ method: 'POST'; headers: Readonly<Record<string, string>>; body: string }>,
) => Promise<Readonly<{ status: number; text(): Promise<string> }>>;

/** Why one provider call failed. The router reacts by trying the next provider. */
export type ProviderError = 'unavailable' | 'rate_limited' | 'unauthorized' | 'invalid_output';

export type TalkRequest = Readonly<{
  system: string;
  prompt: string;
  /** When present, the provider must answer with JSON matching this JSON Schema. */
  jsonSchema?: Readonly<Record<string, unknown>>;
}>;

export interface TalkProvider {
  readonly name: string;
  talk(req: TalkRequest): Promise<Result<string, ProviderError>>;
}

/** Jev's three question types (TypeSafe `systemOne`). */
export type NoulQuestion = Readonly<{
  type: 'noul';
  instructions: string;
  criteria?: Readonly<{ true: string; false: string }>;
}>;
export type ChoiceQuestion = Readonly<{
  type: 'choice';
  instructions: string;
  criteria: Readonly<Record<string, string>>;
}>;
export type ScoreQuestion = Readonly<{
  type: 'score';
  instructions: string;
  /** Ordered levels, lowest first; at least two. */
  criteria: readonly string[];
}>;
export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type Questions = Readonly<Record<string, Question>>;

/** `noul` is the probability of "yes"; it has no separate confidence. */
export type NoulAnswer = Readonly<{ type: 'noul'; noul: number }>;
export type ChoiceAnswer = Readonly<{
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Readonly<Record<string, number>>;
}>;
export type ScoreAnswer = Readonly<{
  type: 'score';
  score: number;
  confidence: number;
  probabilities: Readonly<Record<string, number>>;
}>;
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;
export type Answers = Readonly<Record<string, Answer>>;

export type JudgeState = string | Readonly<Record<string, unknown>>;

export interface JudgeProvider {
  readonly name: string;
  judge(state: JudgeState, questions: Questions): Promise<Result<Answers, ProviderError>>;
}
```

`packages/ai/src/index.ts`:

```ts
export * from './types';
export * from './http';
export * from './answers';
```

`packages/ai/test/fakes.ts`:

```ts
import type { FetchLike } from '../src/types';

export type FakeResponse = Readonly<{ status: number; body: string }> | 'network_error';
export type Call = Readonly<{ url: string; headers: Record<string, string>; body: unknown }>;

export const jsonResponse = (status: number, body: unknown): FakeResponse => ({
  status,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

/** Answers each call with the next response (the last one repeats) and records every request. */
export function fakeFetch(responses: readonly FakeResponse[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: { ...init.headers }, body: JSON.parse(init.body) as unknown });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next === undefined || next === 'network_error') throw new Error('network down');
    return { status: next.status, text: async () => next.body };
  };
  return { fetch, calls };
}
```

- [ ] **Step 2: Install**

Run: `bun install`
Expected: installs; `@mflow/ai` joins the workspace.

- [ ] **Step 3: Write the failing test**

`packages/ai/test/answers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseAnswers } from '../src/answers';
import { postJson } from '../src/http';
import type { Questions } from '../src/types';
import { fakeFetch, jsonResponse } from './fakes';

const questions: Questions = {
  urgent: { type: 'noul', instructions: 'Is it urgent?' },
  team: { type: 'choice', instructions: 'Which team?', criteria: { billing: 'b', technical: 't' } },
  mood: {
    type: 'score',
    instructions: 'How angry?',
    criteria: ['Calm', 'Frustrated', 'Very angry'],
  },
};

// Shapes copied from the Jev docs (Cloudflare model page, jev-1.13.0).
const valid = {
  urgent: { type: 'noul', noul: 0.95 },
  team: {
    type: 'choice',
    choice: 'billing',
    confidence: 0.8,
    probabilities: { billing: 0.87, technical: 0.13 },
  },
  mood: {
    type: 'score',
    score: 1.04,
    confidence: 0.94,
    legend: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
    probabilities: { '0': 0, '1': 0.96, '2': 0.04 },
  },
};

describe('parseAnswers', () => {
  it('accepts answers that fit their questions and drops extra fields', () => {
    const result = parseAnswers(valid, questions);
    expect(result.ok && result.value.mood).toEqual({
      type: 'score',
      score: 1.04,
      confidence: 0.94,
      probabilities: { '0': 0, '1': 0.96, '2': 0.04 },
    });
  });

  it.each([
    ['a missing question', { ...valid, urgent: undefined }],
    ['a choice that is not an option', { ...valid, team: { ...valid.team, choice: 'sales' } }],
    ['a score outside the scale', { ...valid, mood: { ...valid.mood, score: 2.5 } }],
    [
      'a wrong answer type',
      { ...valid, urgent: { type: 'choice', choice: 'x', confidence: 1, probabilities: {} } },
    ],
    ['a probability above 1', { ...valid, urgent: { type: 'noul', noul: 1.2 } }],
    ['not an object', 'yes'],
  ])('rejects %s', (_label, raw) => {
    expect(parseAnswers(raw, questions)).toEqual({ ok: false, error: 'invalid_output' });
  });
});

describe('postJson', () => {
  const call = (responses: Parameters<typeof fakeFetch>[0]) => {
    const fake = fakeFetch(responses);
    return { fake, result: postJson(fake.fetch, 'https://x.test/v1', { auth: 'k' }, { a: 1 }) };
  };

  it('posts JSON with the given headers and parses the reply', async () => {
    const { fake, result } = call([jsonResponse(200, { b: 2 })]);
    expect(await result).toEqual({ ok: true, value: { b: 2 } });
    expect(fake.calls[0]).toEqual({
      url: 'https://x.test/v1',
      headers: { 'content-type': 'application/json', auth: 'k' },
      body: { a: 1 },
    });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [404, 'unavailable'],
  ] as const)('maps HTTP %i to %s', async (status, error) => {
    expect(await call([jsonResponse(status, {})]).result).toEqual({ ok: false, error });
  });

  it('maps a network failure to unavailable and a non-JSON body to invalid_output', async () => {
    expect(await call(['network_error']).result).toEqual({ ok: false, error: 'unavailable' });
    expect(await call([{ status: 200, body: '<html>' }]).result).toEqual({
      ok: false,
      error: 'invalid_output',
    });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `bun run --cwd packages/ai test`
Expected: FAIL. `../src/answers` and `../src/http` can't be resolved.

- [ ] **Step 5: Implement**

`packages/ai/src/http.ts`:

```ts
import { err, ok, type Result } from '@mflow/core';
import type { FetchLike, ProviderError } from './types';

/** POST a JSON body and parse a JSON reply. Never throws: failures become `ProviderError`s. */
export async function postJson(
  fetch: FetchLike,
  url: string,
  headers: Readonly<Record<string, string>>,
  body: unknown,
): Promise<Result<unknown, ProviderError>> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    return err('unavailable');
  }
  if (res.status === 401 || res.status === 403) return err('unauthorized');
  if (res.status === 429) return err('rate_limited');
  if (res.status < 200 || res.status >= 300) return err('unavailable');
  try {
    return ok(JSON.parse(await res.text()) as unknown);
  } catch {
    return err('invalid_output');
  }
}
```

`packages/ai/src/answers.ts`:

```ts
import { err, ok, type Result } from '@mflow/core';
import { z } from 'zod';
import type { Answer, Answers, Question, Questions } from './types';

const Probability = z.number().min(0).max(1);

const AnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: Probability }),
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    confidence: Probability,
    probabilities: z.record(z.string(), Probability),
  }),
  z.object({
    type: z.literal('score'),
    score: z.number(),
    confidence: Probability,
    probabilities: z.record(z.string(), Probability),
  }),
]);

const AnswersSchema = z.record(z.string(), AnswerSchema);

function fits(answer: Answer, question: Question): boolean {
  if (answer.type === 'noul') return question.type === 'noul';
  if (answer.type === 'choice') {
    return question.type === 'choice' && Object.hasOwn(question.criteria, answer.choice);
  }
  return (
    question.type === 'score' && answer.score >= 0 && answer.score <= question.criteria.length - 1
  );
}

/** Jev-shaped answers, checked against the questions: every question answered, every answer legal. */
export function parseAnswers(
  raw: unknown,
  questions: Questions,
): Result<Answers, 'invalid_output'> {
  const parsed = AnswersSchema.safeParse(raw);
  if (!parsed.success) return err('invalid_output');
  const answers: Record<string, Answer> = {};
  for (const [key, question] of Object.entries(questions)) {
    const answer = parsed.data[key];
    if (answer === undefined || !fits(answer, question)) return err('invalid_output');
    answers[key] = answer;
  }
  return ok(answers);
}
```

Add `export * from './answers';` and `export * from './http';` to `src/index.ts` (they are already listed).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run --cwd packages/ai test && bun run --cwd packages/ai typecheck && bun run lint`
Expected: PASS; typecheck and lint are clean.

- [ ] **Step 7: Commit**

```bash
bun x prettier --write packages/ai
git add packages/ai bun.lock
git commit -m "feat(ai): provider types, JSON transport and Jev answer validation"
```

---

### Task 2: Jev judge adapter

**Files:**

- Create: `packages/ai/src/jev.ts`, `packages/ai/test/jev.test.ts`
- Modify: `packages/ai/src/index.ts`

**Interfaces:**

- Consumes: `postJson`, `parseAnswers` (Task 1).
- Produces: `JEV_URL = 'https://api.typesafe.ai/v1/systemone'`, `JEV_DEFAULT_MODEL = 'jev-latest'`, and `jevJudge(opts: { apiKey: string; fetch: FetchLike; model?: string }): JudgeProvider` (name `'jev'`).

- [ ] **Step 1: Write the failing test**

`packages/ai/test/jev.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { JEV_URL, jevJudge } from '../src/jev';
import type { Questions } from '../src/types';
import { fakeFetch, jsonResponse } from './fakes';

const questions: Questions = {
  is_urgent: {
    type: 'noul',
    instructions: 'Does this convey urgency?',
    criteria: { true: 'Explicitly time-sensitive', false: 'No urgency expressed' },
  },
  department: {
    type: 'choice',
    instructions: 'Which team should handle this?',
    criteria: { billing: 'Payments', technical: 'Bugs', sales: 'Pricing' },
  },
};

// Response recorded from the Jev docs (Cloudflare model page, jev-1.13.0).
const recorded = {
  model: 'jev-1.13.0',
  answers: {
    is_urgent: { type: 'noul', noul: 0.95 },
    department: {
      type: 'choice',
      choice: 'billing',
      confidence: 0.8,
      probabilities: { billing: 0.87, sales: 0, technical: 0.13 },
    },
  },
  usage: { input_tokens: 426, output_tokens: 73 },
};

describe('jevJudge', () => {
  it('sends state and questions to systemOne with a bearer key and returns the answers', async () => {
    const { fetch, calls } = fakeFetch([jsonResponse(200, recorded)]);
    const result = await jevJudge({ apiKey: 'jev-key', fetch }).judge('Payouts failing', questions);

    expect(result).toEqual({ ok: true, value: recorded.answers });
    expect(calls[0]).toEqual({
      url: JEV_URL,
      headers: { 'content-type': 'application/json', authorization: 'Bearer jev-key' },
      body: { model: 'jev-latest', state: 'Payouts failing', questions },
    });
  });

  it('reports a response without valid answers as invalid output', async () => {
    const { fetch } = fakeFetch([jsonResponse(200, { model: 'jev-1.13.0' })]);
    expect(await jevJudge({ apiKey: 'k', fetch }).judge('s', questions)).toEqual({
      ok: false,
      error: 'invalid_output',
    });
  });

  it('passes transport errors through', async () => {
    const { fetch } = fakeFetch([jsonResponse(401, { error: 'bad key' })]);
    expect(await jevJudge({ apiKey: 'k', fetch }).judge('s', questions)).toEqual({
      ok: false,
      error: 'unauthorized',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd packages/ai test -- test/jev.test.ts`
Expected: FAIL. `../src/jev` can't be resolved.

- [ ] **Step 3: Implement**

`packages/ai/src/jev.ts`:

```ts
import { err, type Result } from '@mflow/core';
import { z } from 'zod';
import { parseAnswers } from './answers';
import { postJson } from './http';
import type { Answers, FetchLike, JudgeProvider, ProviderError } from './types';

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_DEFAULT_MODEL = 'jev-latest';

const JevResponseSchema = z.object({ answers: z.unknown() });

/** TypeSafe's Jev: typed, calibrated decisions. Paid per input token; used only to judge. */
export function jevJudge(opts: {
  apiKey: string;
  fetch: FetchLike;
  model?: string;
}): JudgeProvider {
  return {
    name: 'jev',
    async judge(state, questions): Promise<Result<Answers, ProviderError>> {
      const res = await postJson(
        opts.fetch,
        JEV_URL,
        { authorization: `Bearer ${opts.apiKey}` },
        { model: opts.model ?? JEV_DEFAULT_MODEL, state, questions },
      );
      if (!res.ok) return res;
      const body = JevResponseSchema.safeParse(res.value);
      return body.success ? parseAnswers(body.data.answers, questions) : err('invalid_output');
    },
  };
}
```

Add `export * from './jev';` to `src/index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd packages/ai test && bun run --cwd packages/ai typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write packages/ai
git add packages/ai
git commit -m "feat(ai): Jev judge adapter for TypeSafe systemOne"
```

---

### Task 3: Gemini talk adapter and the Gemini judge (Jev shape)

**Files:**

- Create: `packages/ai/src/gemini.ts`, `packages/ai/test/gemini.test.ts`
- Modify: `packages/ai/src/index.ts`

**Interfaces:**

- Consumes: `postJson`, `parseAnswers` (Task 1).
- Produces: `GEMINI_BASE_URL`, `geminiTalk(opts: { apiKey: string; model: string; fetch: FetchLike }): TalkProvider` (name `gemini:<model>`), and `geminiJudge(talk: TalkProvider): JudgeProvider`. The judge has the **same name** as its talk provider, so both share one budget counter.
- Rule (Gemini judge): Gemini returns probabilities. `noul` = P(yes). Choice and score probabilities are normalized to sum to 1. `choice` is the most likely option, `score` = Σ level × p, and `confidence` = the largest probability. A sum of 0 is `invalid_output`.

- [ ] **Step 1: Write the failing test**

`packages/ai/test/gemini.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GEMINI_BASE_URL, geminiJudge, geminiTalk } from '../src/gemini';
import type { Questions } from '../src/types';
import { fakeFetch, jsonResponse } from './fakes';

/** generateContent response shape (Gemini API docs). */
const reply = (...texts: string[]) =>
  jsonResponse(200, {
    candidates: [
      {
        content: { parts: texts.map((text) => ({ text })), role: 'model' },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 12, totalTokenCount: 16 },
  });

const talkWith = (responses: Parameters<typeof fakeFetch>[0]) => {
  const fake = fakeFetch(responses);
  return {
    fake,
    talk: geminiTalk({ apiKey: 'g-key', model: 'gemini-3.5-flash-lite', fetch: fake.fetch }),
  };
};

describe('geminiTalk', () => {
  it('sends the system instruction and prompt, and joins the text parts', async () => {
    const { fake, talk } = talkWith([reply('Hello', ' there')]);

    const result = await talk.talk({ system: 'Be brief.', prompt: 'Hi' });

    expect(result).toEqual({ ok: true, value: 'Hello there' });
    expect(talk.name).toBe('gemini:gemini-3.5-flash-lite');
    expect(fake.calls[0]).toEqual({
      url: `${GEMINI_BASE_URL}/gemini-3.5-flash-lite:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': 'g-key' },
      body: {
        systemInstruction: { parts: [{ text: 'Be brief.' }] },
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      },
    });
  });

  it('asks for JSON when a schema is given', async () => {
    const { fake, talk } = talkWith([reply('{}')]);
    const jsonSchema = { type: 'object', properties: {} };
    await talk.talk({ system: 's', prompt: 'p', jsonSchema });
    expect(fake.calls[0]?.body).toMatchObject({
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: jsonSchema },
    });
  });

  it.each([
    ['no candidates (blocked)', jsonResponse(200, { promptFeedback: { blockReason: 'SAFETY' } })],
    ['empty text', reply('  ')],
    ['an unexpected shape', jsonResponse(200, { candidates: 'nope' })],
  ])('reports %s as invalid output', async (_label, response) => {
    const { talk } = talkWith([response]);
    expect(await talk.talk({ system: 's', prompt: 'p' })).toEqual({
      ok: false,
      error: 'invalid_output',
    });
  });

  it('passes transport errors through', async () => {
    const { talk } = talkWith([jsonResponse(429, {})]);
    expect(await talk.talk({ system: 's', prompt: 'p' })).toEqual({
      ok: false,
      error: 'rate_limited',
    });
  });
});

describe('geminiJudge', () => {
  const questions: Questions = {
    done: { type: 'noul', instructions: 'Did the commits finish the task?' },
    size: {
      type: 'choice',
      instructions: 'How big is the change?',
      criteria: { small: 's', large: 'l' },
    },
    quality: {
      type: 'score',
      instructions: 'How good is the summary?',
      criteria: ['Poor', 'Fair', 'Good'],
    },
  };

  it('turns Gemini probabilities into Jev-shaped answers', async () => {
    const raw = {
      done: { yes: 0.9 },
      size: { small: 3, large: 1 },
      quality: { '0': 0, '1': 0.5, '2': 0.5 },
    };
    const { fake, talk } = talkWith([reply(JSON.stringify(raw))]);

    const result = await geminiJudge(talk).judge({ diff: '+ fix' }, questions);

    expect(result).toEqual({
      ok: true,
      value: {
        done: { type: 'noul', noul: 0.9 },
        size: {
          type: 'choice',
          choice: 'small',
          confidence: 0.75,
          probabilities: { small: 0.75, large: 0.25 },
        },
        quality: {
          type: 'score',
          score: 1.5,
          confidence: 0.5,
          probabilities: { '0': 0, '1': 0.5, '2': 0.5 },
        },
      },
    });
    expect(geminiJudge(talk).name).toBe(talk.name);
    const sent = JSON.stringify(fake.calls[0]?.body);
    expect(sent).toContain('Did the commits finish the task?');
    expect(sent).toContain('responseJsonSchema');
  });

  it.each([
    [
      'all-zero probabilities',
      { done: { yes: 0.5 }, size: { small: 0, large: 0 }, quality: { '0': 1, '1': 0, '2': 0 } },
    ],
    ['a missing question', { done: { yes: 0.5 }, size: { small: 1, large: 0 } }],
    ['not JSON', 'definitely yes'],
  ])('reports %s as invalid output', async (_label, raw) => {
    const { talk } = talkWith([reply(typeof raw === 'string' ? raw : JSON.stringify(raw))]);
    expect(await geminiJudge(talk).judge('s', questions)).toEqual({
      ok: false,
      error: 'invalid_output',
    });
  });

  it('passes the talk error through', async () => {
    const { talk } = talkWith(['network_error']);
    expect(await geminiJudge(talk).judge('s', questions)).toEqual({
      ok: false,
      error: 'unavailable',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd packages/ai test -- test/gemini.test.ts`
Expected: FAIL. `../src/gemini` can't be resolved.

- [ ] **Step 3: Implement**

`packages/ai/src/gemini.ts`:

```ts
import { err, ok, type Result } from '@mflow/core';
import { z } from 'zod';
import { parseAnswers } from './answers';
import { postJson } from './http';
import type {
  Answer,
  Answers,
  FetchLike,
  JudgeProvider,
  ProviderError,
  Question,
  Questions,
  TalkProvider,
} from './types';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const GenerateContentSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ text: z.string().optional() })).optional() })
          .optional(),
      }),
    )
    .optional(),
});

/** Gemini `generateContent` (stateless: nothing is stored server-side). */
export function geminiTalk(opts: {
  apiKey: string;
  model: string;
  fetch: FetchLike;
}): TalkProvider {
  return {
    name: `gemini:${opts.model}`,
    async talk(req) {
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        ...(req.jsonSchema === undefined
          ? {}
          : {
              generationConfig: {
                responseMimeType: 'application/json',
                responseJsonSchema: req.jsonSchema,
              },
            }),
      };
      const res = await postJson(
        opts.fetch,
        `${GEMINI_BASE_URL}/${opts.model}:generateContent`,
        { 'x-goog-api-key': opts.apiKey },
        body,
      );
      if (!res.ok) return res;
      const parsed = GenerateContentSchema.safeParse(res.value);
      const parts = parsed.success ? (parsed.data.candidates?.[0]?.content?.parts ?? []) : [];
      const text = parts.map((p) => p.text ?? '').join('');
      return text.trim() === '' ? err('invalid_output') : ok(text);
    },
  };
}

const JUDGE_SYSTEM = [
  'You are a careful evaluator. Use only the given state; do not assume facts that are not in it.',
  'For every question, give probabilities that honestly reflect how sure you are.',
  'Answer with JSON only, matching the schema.',
].join(' ');

const levelsOf = (q: Question): string[] =>
  q.type === 'choice'
    ? Object.keys(q.criteria)
    : q.type === 'score'
      ? q.criteria.map((_, i) => String(i))
      : [];

const probabilityObject = (keys: readonly string[]) => ({
  type: 'object',
  properties: Object.fromEntries(keys.map((k) => [k, { type: 'number', minimum: 0, maximum: 1 }])),
  required: [...keys],
});

function judgeSchema(questions: Questions): Record<string, unknown> {
  const properties = Object.fromEntries(
    Object.entries(questions).map(([key, q]) => [
      key,
      q.type === 'noul' ? probabilityObject(['yes']) : probabilityObject(levelsOf(q)),
    ]),
  );
  return { type: 'object', properties, required: Object.keys(questions) };
}

function describeQuestion(key: string, q: Question): string {
  const lines = [`- ${key} (${q.type}): ${q.instructions}`];
  if (q.type === 'noul' && q.criteria !== undefined) {
    lines.push(`  yes: ${q.criteria.true}`, `  no: ${q.criteria.false}`);
  }
  if (q.type === 'choice') {
    lines.push(...Object.entries(q.criteria).map(([label, text]) => `  ${label}: ${text}`));
  }
  if (q.type === 'score') lines.push(...q.criteria.map((text, i) => `  ${i}: ${text}`));
  const hint =
    q.type === 'noul'
      ? 'Give "yes": the probability that the answer is yes.'
      : 'Give a probability for every option.';
  return [...lines, `  ${hint}`].join('\n');
}

const RawSchema = z.record(z.string(), z.record(z.string(), z.number().min(0).max(1)));

function toAnswer(q: Question, raw: Readonly<Record<string, number>> | undefined): Answer | null {
  if (raw === undefined) return null;
  if (q.type === 'noul') return raw.yes === undefined ? null : { type: 'noul', noul: raw.yes };
  const levels = levelsOf(q);
  const total = levels.reduce((sum, k) => sum + (raw[k] ?? 0), 0);
  if (total <= 0) return null;
  const probabilities = Object.fromEntries(levels.map((k) => [k, (raw[k] ?? 0) / total]));
  const best = levels.reduce((a, b) => ((probabilities[b] ?? 0) > (probabilities[a] ?? 0) ? b : a));
  const confidence = probabilities[best] ?? 0;
  if (q.type === 'choice') return { type: 'choice', choice: best, confidence, probabilities };
  const score = levels.reduce((sum, k, i) => sum + i * (probabilities[k] ?? 0), 0);
  return { type: 'score', score, confidence, probabilities };
}

/**
 * The fallback judge: Gemini asked for probabilities, reshaped into Jev's answers. Its confidence
 * is self-reported, not calibrated, so the judge eval set (spec §14) gates auto-pass.
 */
export function geminiJudge(talk: TalkProvider): JudgeProvider {
  return {
    name: talk.name,
    async judge(state, questions): Promise<Result<Answers, ProviderError>> {
      const prompt = [
        'State:',
        typeof state === 'string' ? state : JSON.stringify(state, null, 2),
        '',
        'Questions:',
        ...Object.entries(questions).map(([key, q]) => describeQuestion(key, q)),
      ].join('\n');
      const res = await talk.talk({
        system: JUDGE_SYSTEM,
        prompt,
        jsonSchema: judgeSchema(questions),
      });
      if (!res.ok) return res;
      let raw: unknown;
      try {
        raw = JSON.parse(res.value);
      } catch {
        return err('invalid_output');
      }
      const parsed = RawSchema.safeParse(raw);
      if (!parsed.success) return err('invalid_output');
      const answers: Record<string, Answer> = {};
      for (const [key, q] of Object.entries(questions)) {
        const answer = toAnswer(q, parsed.data[key]);
        if (answer === null) return err('invalid_output');
        answers[key] = answer;
      }
      return parseAnswers(answers, questions);
    },
  };
}
```

Add `export * from './gemini';` to `src/index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd packages/ai test && bun run --cwd packages/ai typecheck && bun run lint`
Expected: PASS; typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write packages/ai
git add packages/ai
git commit -m "feat(ai): Gemini talk adapter and a Jev-shaped Gemini judge"
```

---

### Task 4: The router: structured output, repair, fallback, budget guard

**Files:**

- Create: `packages/ai/src/router.ts`, `packages/ai/test/router.test.ts`
- Modify: `packages/ai/src/index.ts`

**Interfaces:**

- Consumes: `TalkProvider`, `JudgeProvider`, `Questions`, `Answers`, `JudgeState` (Task 1).
- Produces:
  - `Importance = 'essential' | 'flourish'`
  - `UsageCounter { used(provider: string, day: string): Promise<number>; add(provider: string, day: string): Promise<void> }`
  - `Limited<P> = { provider: P; dailyLimit: number }`
  - `AiConfig = { talk: readonly Limited<TalkProvider>[]; judge: readonly Limited<JudgeProvider>[]; usage: UsageCounter; day: () => string }`
  - `FLOURISH_SHARE = 0.8`, `AiError = 'ai_unavailable'`
  - `Ai`, with:
    - `talkText({ system, prompt, importance }): Promise<Result<string, AiError>>`
    - `talkJson<T>({ system, prompt, schema: z.ZodType<T>, importance }): Promise<Result<T, AiError>>`
    - `judge(state, questions): Promise<Result<Answers, AiError>>`
  - `createAi(config): Ai`, `memoryUsage(): UsageCounter` (in-memory, for tests and local tools), `jsonSchemaOf(schema)`.
- Rules:
  - Every provider HTTP call (including the repair) costs one unit.
  - A provider is skipped when `used ≥ limit`, or, for `flourish`, when `used ≥ floor(limit × 0.8)`.
  - `judge` is always essential.
  - JSON may arrive wrapped in a ```json fence; the fence is removed before parsing.

- [ ] **Step 1: Write the failing test**

`packages/ai/test/router.test.ts`:

````ts
import { err, ok, type Result } from '@mflow/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAi, jsonSchemaOf, memoryUsage, type Limited } from '../src/router';
import type { Answers, JudgeProvider, ProviderError, Questions, TalkProvider } from '../src/types';

const DAY = '2026-10-11';

function scriptedTalk(name: string, replies: Result<string, ProviderError>[]) {
  const prompts: string[] = [];
  const provider: TalkProvider = {
    name,
    async talk(req) {
      prompts.push(req.prompt);
      return replies[Math.min(prompts.length - 1, replies.length - 1)] ?? err('unavailable');
    },
  };
  return { provider, prompts };
}

const limited = <P>(provider: P, dailyLimit = 10): Limited<P> => ({ provider, dailyLimit });
const Plan = z.object({ tasks: z.array(z.string()).min(1) });

describe('talkJson', () => {
  it('returns parsed, schema-checked JSON (fences tolerated) and counts the call', async () => {
    const usage = memoryUsage();
    const a = scriptedTalk('a', [ok('```json\n{"tasks":["ship"]}\n```')]);
    const ai = createAi({ talk: [limited(a.provider)], judge: [], usage, day: () => DAY });

    expect(
      await ai.talkJson({ system: 's', prompt: 'p', schema: Plan, importance: 'essential' }),
    ).toEqual({
      ok: true,
      value: { tasks: ['ship'] },
    });
    expect(await usage.used('a', DAY)).toBe(1);
  });

  it('repairs once on the same provider, naming what was wrong', async () => {
    const a = scriptedTalk('a', [ok('{"tasks":[]}'), ok('{"tasks":["read"]}')]);
    const ai = createAi({
      talk: [limited(a.provider)],
      judge: [],
      usage: memoryUsage(),
      day: () => DAY,
    });

    const result = await ai.talkJson({
      system: 's',
      prompt: 'plan',
      schema: Plan,
      importance: 'essential',
    });

    expect(result).toEqual({ ok: true, value: { tasks: ['read'] } });
    expect(a.prompts).toHaveLength(2);
    expect(a.prompts[1]).toContain('plan');
    expect(a.prompts[1]).toContain('tasks');
  });

  it('moves to the next provider after a failed repair or an error, then gives up', async () => {
    const a = scriptedTalk('a', [ok('prose'), ok('still prose')]);
    const b = scriptedTalk('b', [err('rate_limited')]);
    const c = scriptedTalk('c', [ok('{"tasks":["x"]}')]);
    const ai = createAi({
      talk: [limited(a.provider), limited(b.provider), limited(c.provider)],
      judge: [],
      usage: memoryUsage(),
      day: () => DAY,
    });

    expect(
      (await ai.talkJson({ system: 's', prompt: 'p', schema: Plan, importance: 'essential' })).ok,
    ).toBe(true);
    expect([a.prompts.length, b.prompts.length, c.prompts.length]).toEqual([2, 1, 1]);

    const none = createAi({
      talk: [limited(a.provider)],
      judge: [],
      usage: memoryUsage(),
      day: () => DAY,
    });
    expect(
      await none.talkJson({ system: 's', prompt: 'p', schema: Plan, importance: 'essential' }),
    ).toEqual({
      ok: false,
      error: 'ai_unavailable',
    });
  });

  it('sends the zod schema as JSON Schema without the $schema key', () => {
    expect(jsonSchemaOf(Plan)).toEqual({
      type: 'object',
      properties: { tasks: { type: 'array', items: { type: 'string' }, minItems: 1 } },
      required: ['tasks'],
      additionalProperties: false,
    });
  });
});

describe('budget guard', () => {
  it('skips a provider at its daily limit without calling it', async () => {
    const usage = memoryUsage();
    for (let i = 0; i < 10; i++) await usage.add('a', DAY);
    const a = scriptedTalk('a', [ok('hi')]);
    const ai = createAi({ talk: [limited(a.provider, 10)], judge: [], usage, day: () => DAY });

    expect(await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).toEqual({
      ok: false,
      error: 'ai_unavailable',
    });
    expect(a.prompts).toHaveLength(0);
  });

  it('cuts flourish at 80% of the limit but keeps essential calls going', async () => {
    const usage = memoryUsage();
    for (let i = 0; i < 8; i++) await usage.add('a', DAY);
    const a = scriptedTalk('a', [ok('hi')]);
    const ai = createAi({ talk: [limited(a.provider, 10)], judge: [], usage, day: () => DAY });

    expect((await ai.talkText({ system: 's', prompt: 'p', importance: 'flourish' })).ok).toBe(
      false,
    );
    expect(await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).toEqual({
      ok: true,
      value: 'hi',
    });
  });

  it('counts per day', async () => {
    const usage = memoryUsage();
    for (let i = 0; i < 10; i++) await usage.add('a', '2026-10-10');
    const a = scriptedTalk('a', [ok('hi')]);
    const ai = createAi({ talk: [limited(a.provider, 10)], judge: [], usage, day: () => DAY });
    expect((await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).ok).toBe(
      true,
    );
  });
});

describe('judge', () => {
  const questions: Questions = { done: { type: 'noul', instructions: 'Done?' } };
  const answers: Answers = { done: { type: 'noul', noul: 0.9 } };
  const judgeOf = (name: string, result: Result<Answers, ProviderError>) => {
    let calls = 0;
    const provider: JudgeProvider = {
      name,
      async judge() {
        calls += 1;
        return result;
      },
    };
    return { provider, calls: () => calls };
  };

  it('falls back to the next judge and reports ai_unavailable when all fail', async () => {
    const jev = judgeOf('jev', err('unauthorized'));
    const gemini = judgeOf('gemini', ok(answers));
    const ai = createAi({
      talk: [],
      judge: [limited(jev.provider), limited(gemini.provider)],
      usage: memoryUsage(),
      day: () => DAY,
    });

    expect(await ai.judge('state', questions)).toEqual({ ok: true, value: answers });

    const broken = createAi({
      talk: [],
      judge: [limited(jev.provider)],
      usage: memoryUsage(),
      day: () => DAY,
    });
    expect(await broken.judge('state', questions)).toEqual({ ok: false, error: 'ai_unavailable' });
  });

  it('judging is essential: it may use the whole limit', async () => {
    const usage = memoryUsage();
    for (let i = 0; i < 9; i++) await usage.add('gemini', DAY);
    const gemini = judgeOf('gemini', ok(answers));
    const ai = createAi({ talk: [], judge: [limited(gemini.provider, 10)], usage, day: () => DAY });
    expect((await ai.judge('state', questions)).ok).toBe(true);
  });
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd packages/ai test -- test/router.test.ts`
Expected: FAIL. `../src/router` can't be resolved.

- [ ] **Step 3: Implement**

`packages/ai/src/router.ts`:

````ts
import { err, ok, type Result } from '@mflow/core';
import { z } from 'zod';
import type {
  Answers,
  JudgeProvider,
  JudgeState,
  Questions,
  TalkProvider,
  TalkRequest,
} from './types';

export type Importance = 'essential' | 'flourish';
export type AiError = 'ai_unavailable';

/** Daily request counts per provider: D1 in the API, memory in tests. */
export interface UsageCounter {
  used(provider: string, day: string): Promise<number>;
  add(provider: string, day: string): Promise<void>;
}

export type Limited<P> = Readonly<{ provider: P; dailyLimit: number }>;

export type AiConfig = Readonly<{
  talk: readonly Limited<TalkProvider>[];
  judge: readonly Limited<JudgeProvider>[];
  usage: UsageCounter;
  /** The budget day (UTC date) for the counters. */
  day: () => string;
}>;

/** Past this share of a provider's daily limit, only essential calls (plans, verification) go through. */
export const FLOURISH_SHARE = 0.8;

export interface Ai {
  talkText(
    req: Readonly<{ system: string; prompt: string; importance: Importance }>,
  ): Promise<Result<string, AiError>>;
  talkJson<T>(
    req: Readonly<{ system: string; prompt: string; schema: z.ZodType<T>; importance: Importance }>,
  ): Promise<Result<T, AiError>>;
  judge(state: JudgeState, questions: Questions): Promise<Result<Answers, AiError>>;
}

export function memoryUsage(): UsageCounter {
  const counts = new Map<string, number>();
  const key = (provider: string, day: string) => `${day}|${provider}`;
  return {
    async used(provider, day) {
      return counts.get(key(provider, day)) ?? 0;
    },
    async add(provider, day) {
      counts.set(key(provider, day), (counts.get(key(provider, day)) ?? 0) + 1);
    },
  };
}

/** The zod schema as plain JSON Schema for a provider (the `$schema` URI removed). */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(z.toJSONSchema(schema) as Record<string, unknown>).filter(
      ([k]) => k !== '$schema',
    ),
  );
}

const unfence = (text: string): string =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

/** Parses and validates; the error names paths and rules only, so it is safe to show the model. */
function parseJson<T>(text: string, schema: z.ZodType<T>): Result<T, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(unfence(text));
  } catch {
    return err('the reply was not valid JSON');
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  return err(
    parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
  );
}

const REPAIR_NOTE = 'Your previous reply did not match the required JSON schema. Problems: ';

export function createAi(config: AiConfig): Ai {
  async function admit(name: string, limit: number, importance: Importance): Promise<boolean> {
    const day = config.day();
    const cap = importance === 'flourish' ? Math.floor(limit * FLOURISH_SHARE) : limit;
    if ((await config.usage.used(name, day)) >= cap) return false;
    await config.usage.add(name, day);
    return true;
  }

  async function call(entry: Limited<TalkProvider>, importance: Importance, req: TalkRequest) {
    if (!(await admit(entry.provider.name, entry.dailyLimit, importance))) return null;
    return entry.provider.talk(req);
  }

  return {
    async talkText({ system, prompt, importance }) {
      for (const entry of config.talk) {
        const res = await call(entry, importance, { system, prompt });
        if (res?.ok) return ok(res.value);
      }
      return err('ai_unavailable');
    },

    async talkJson({ system, prompt, schema, importance }) {
      const jsonSchema = jsonSchemaOf(schema);
      for (const entry of config.talk) {
        const first = await call(entry, importance, { system, prompt, jsonSchema });
        if (!first?.ok) continue;
        const parsed = parseJson(first.value, schema);
        if (parsed.ok) return parsed;
        const repairPrompt = `${prompt}\n\n${REPAIR_NOTE}${parsed.error}. Reply again with JSON only.`;
        const second = await call(entry, importance, { system, prompt: repairPrompt, jsonSchema });
        if (!second?.ok) continue;
        const repaired = parseJson(second.value, schema);
        if (repaired.ok) return repaired;
      }
      return err('ai_unavailable');
    },

    async judge(state, questions) {
      for (const entry of config.judge) {
        if (!(await admit(entry.provider.name, entry.dailyLimit, 'essential'))) continue;
        const res = await entry.provider.judge(state, questions);
        if (res.ok) return ok(res.value);
      }
      return err('ai_unavailable');
    },
  };
}
````

Add `export * from './router';` to `src/index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd packages/ai test && bun run --cwd packages/ai typecheck && bun run lint`
Expected: PASS. If `jsonSchemaOf(Plan)` prints a slightly different but equivalent shape (zod's exact `z.toJSONSchema` output), update that one expectation to the printed value, keeping the `$schema`-free assertion, and record a ruling.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write packages/ai
git add packages/ai
git commit -m "feat(ai): router with structured output, one repair, fallback and budget guard"
```

---

### Task 5: Roadmap contracts and storage (`PUT`/`GET /v1/onboarding/roadmap`)

**Files:**

- Create: `packages/contracts/src/onboarding.ts`, `packages/contracts/test/onboarding.test.ts`, `apps/api/migrations/0002_roadmap_ai_usage.sql`, `apps/api/src/adapters/d1/roadmap.ts`, `apps/api/src/routes/onboarding.ts`, `apps/api/test/onboarding.test.ts`
- Modify: `packages/contracts/src/index.ts`, `apps/api/src/ports.ts`, `apps/api/src/adapters/d1/index.ts`, `apps/api/src/app.ts`

**Interfaces:**

- Consumes: `DayKeySchema`, `PlanSchema` (contracts); `VERIFIER_KINDS` (core).
- Produces: `IdentitySchema`, `SkillSchema`, `MilestoneSchema`, `RoadmapSchema`, `ProposeResponseSchema` and the types `Roadmap`, `Skill`, `Milestone` (contracts).
  - Identities: 1–3.
  - Skills: ≤ 12, each with a `verifier` and an optional `restWeekday` 0–6.
  - Milestones: ≤ 100, each with `done: boolean`.
  - References and ids are checked.
- Produces: `RoadmapRepo { get(): Promise<Roadmap>; replace(roadmap: Roadmap, at: number): Promise<void> }` (replace is one transaction); `Repos.roadmap`.
- Routes: `GET /v1/onboarding/roadmap` → `Roadmap` (empty lists before onboarding); `PUT /v1/onboarding/roadmap` → `Roadmap`.

- [ ] **Step 1: Write the failing contracts test**

`packages/contracts/test/onboarding.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RoadmapSchema } from '../src';

const ids = {
  swe: '01920000-0000-7000-8000-00000000000a',
  debug: '01920000-0000-7000-8000-00000000000b',
  m1: '01920000-0000-7000-8000-00000000000c',
};
const roadmap = {
  identities: [{ id: ids.swe, title: 'Senior software engineer', why: 'Build things that last' }],
  skills: [
    {
      id: ids.debug,
      identityId: ids.swe,
      name: 'Debugging',
      rubric: 'Root cause found and tested',
      verifier: 'github',
      restWeekday: 5,
    },
  ],
  milestones: [
    { id: ids.m1, skillId: ids.debug, title: 'Fix 3 real bugs with tests', done: false },
  ],
};

describe('RoadmapSchema', () => {
  it('accepts a consistent roadmap', () => {
    expect(RoadmapSchema.parse(roadmap)).toEqual(roadmap);
  });

  it.each([
    ['no identity', { ...roadmap, identities: [] }],
    [
      'a skill of an unknown identity',
      { ...roadmap, skills: [{ ...roadmap.skills[0], identityId: ids.m1 }] },
    ],
    [
      'a milestone of an unknown skill',
      { ...roadmap, milestones: [{ ...roadmap.milestones[0], skillId: ids.swe }] },
    ],
    ['a repeated id', { ...roadmap, milestones: [{ ...roadmap.milestones[0], id: ids.debug }] }],
    ['a rest weekday of 7', { ...roadmap, skills: [{ ...roadmap.skills[0], restWeekday: 7 }] }],
    ['an unknown verifier', { ...roadmap, skills: [{ ...roadmap.skills[0], verifier: 'camera' }] }],
  ])('rejects %s', (_label, value) => {
    expect(RoadmapSchema.safeParse(value).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd packages/contracts test -- test/onboarding.test.ts`
Expected: FAIL. `RoadmapSchema` isn't exported.

- [ ] **Step 3: Implement the contracts**

`packages/contracts/src/onboarding.ts`:

```ts
import { VERIFIER_KINDS } from '@mflow/core';
import { z } from 'zod';
import { DayKeySchema, PlanSchema } from './schemas';

export const IdentitySchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(80),
  why: z.string().trim().min(1).max(500),
  deadline: DayKeySchema.optional(),
});

export const SkillSchema = z.object({
  id: z.uuid(),
  identityId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  rubric: z.string().trim().min(1).max(500),
  /** How this skill's tasks are checked by default. */
  verifier: z.enum(VERIFIER_KINDS),
  /** 0 = Sunday … 6 = Saturday: no tasks for this skill that day. */
  restWeekday: z.number().int().min(0).max(6).optional(),
});

export const MilestoneSchema = z.object({
  id: z.uuid(),
  skillId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  targetDate: DayKeySchema.optional(),
  done: z.boolean(),
});

export const RoadmapSchema = z
  .object({
    identities: z.array(IdentitySchema).min(1).max(3),
    skills: z.array(SkillSchema).max(12),
    milestones: z.array(MilestoneSchema).max(100),
  })
  .superRefine((r, ctx) => {
    const identityIds = new Set(r.identities.map((i) => i.id));
    const skillIds = new Set(r.skills.map((s) => s.id));
    const all = [...r.identities, ...r.skills, ...r.milestones].map((x) => x.id);
    if (new Set(all).size !== all.length)
      ctx.addIssue({ code: 'custom', message: 'ids must be unique' });
    r.skills.forEach((s, i) => {
      if (!identityIds.has(s.identityId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'unknown identity',
          path: ['skills', i, 'identityId'],
        });
      }
    });
    r.milestones.forEach((m, i) => {
      if (!skillIds.has(m.skillId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'unknown skill',
          path: ['milestones', i, 'skillId'],
        });
      }
    });
  });

export const ProposeResponseSchema = z.object({
  plan: PlanSchema,
  source: z.enum(['ai', 'template']),
});

export type Roadmap = z.infer<typeof RoadmapSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
```

Add `export * from './onboarding';` to `packages/contracts/src/index.ts`.

Run: `bun run --cwd packages/contracts test && bun run --cwd packages/contracts typecheck`
Expected: PASS.

- [ ] **Step 4: Write the failing API test and the migration**

`apps/api/migrations/0002_roadmap_ai_usage.sql`:

```sql
-- P3b: the owner's roadmap (onboarding) and daily AI request counters.

CREATE TABLE identities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  why TEXT NOT NULL,
  deadline TEXT,
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL REFERENCES identities (id),
  name TEXT NOT NULL,
  rubric TEXT NOT NULL,
  verifier TEXT NOT NULL CHECK (verifier IN ('github', 'math', 'reading', 'usage')),
  rest_weekday INTEGER CHECK (rest_weekday BETWEEN 0 AND 6),
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills (id),
  title TEXT NOT NULL,
  target_date TEXT,
  done INTEGER NOT NULL CHECK (done IN (0, 1)),
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE ai_usage (
  provider TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (provider, day)
);
```

Append to `apps/api/test/helpers.ts` (`uuidv7` is already imported there):

```ts
/** A small roadmap: one identity, Debugging (GitHub) and Math (rests on Saturday). */
export const sampleRoadmap = () => {
  const swe = uuidv7();
  const debug = uuidv7();
  const math = uuidv7();
  return {
    identities: [
      {
        id: swe,
        title: 'Senior software engineer',
        why: 'Build things that last',
        deadline: '2028-01-01',
      },
    ],
    skills: [
      {
        id: debug,
        identityId: swe,
        name: 'Debugging',
        rubric: 'Root cause found and tested',
        verifier: 'github',
      },
      {
        id: math,
        identityId: swe,
        name: 'Math',
        rubric: '10 problems at 70% or better',
        verifier: 'math',
        restWeekday: 6,
      },
    ],
    milestones: [
      { id: uuidv7(), skillId: debug, title: 'Fix 3 real bugs with tests', done: true },
      {
        id: uuidv7(),
        skillId: debug,
        title: 'Write a debugging checklist',
        done: false,
        targetDate: '2026-11-01',
      },
      { id: uuidv7(), skillId: math, title: 'Finish L0 fractions', done: false },
    ],
  };
};
```

`apps/api/test/onboarding.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { call, makeApp, pairDevice, sampleRoadmap } from './helpers';

describe('onboarding roadmap', () => {
  it('starts empty, then stores and returns the roadmap in order', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const empty = await call(app, 'GET', '/v1/onboarding/roadmap', { token });
    const roadmap = sampleRoadmap();

    const put = await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: roadmap });
    const got = await call(app, 'GET', '/v1/onboarding/roadmap', { token });

    expect(empty.body.data).toEqual({ identities: [], skills: [], milestones: [] });
    expect(put.body.data).toEqual(roadmap);
    expect(got.body.data).toEqual(roadmap);
  });

  it('replaces the whole roadmap: nothing of the old one remains', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: sampleRoadmap() });
    const next = sampleRoadmap();

    await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: next });

    expect((await call(app, 'GET', '/v1/onboarding/roadmap', { token })).body.data).toEqual(next);
    const skills = await env.DB.prepare('SELECT count(*) AS n FROM skills').first<{ n: number }>();
    expect(skills?.n).toBe(2);
  });

  it('rejects an inconsistent roadmap and keeps the stored one', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const stored = sampleRoadmap();
    await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: stored });
    const broken = sampleRoadmap();
    const skill = broken.skills[0];
    if (skill !== undefined) skill.identityId = uuidv7();

    const reply = await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: broken });

    expect(reply.status).toBe(400);
    expect((await call(app, 'GET', '/v1/onboarding/roadmap', { token })).body.data).toEqual(stored);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/onboarding.test.ts`
Expected: FAIL. `/v1/onboarding/roadmap` isn't a route yet (404 envelopes).

- [ ] **Step 6: Implement the repo and the routes**

Append to `apps/api/src/ports.ts` (merge the import into the contracts type import), and add `roadmap: RoadmapRepo;` to `Repos`:

```ts
import type { Roadmap } from '@mflow/contracts';

export interface RoadmapRepo {
  /** The stored roadmap, or empty lists before onboarding. */
  get(): Promise<Roadmap>;
  /** Replaces identities, skills and milestones in one transaction. */
  replace(roadmap: Roadmap, at: number): Promise<void>;
}
```

`apps/api/src/adapters/d1/roadmap.ts`:

```ts
import type { Roadmap } from '@mflow/contracts';
import type { RoadmapRepo } from '../../ports';

type IdentityRow = { id: string; title: string; why: string; deadline: string | null };
type SkillRow = {
  id: string;
  identity_id: string;
  name: string;
  rubric: string;
  verifier: Roadmap['skills'][number]['verifier'];
  rest_weekday: number | null;
};
type MilestoneRow = {
  id: string;
  skill_id: string;
  title: string;
  target_date: string | null;
  done: number;
};

export const d1Roadmap = (db: D1Database): RoadmapRepo => ({
  async get() {
    const [identities, skills, milestones] = await db.batch([
      db.prepare('SELECT id, title, why, deadline FROM identities ORDER BY position'),
      db.prepare(
        'SELECT id, identity_id, name, rubric, verifier, rest_weekday FROM skills ORDER BY position',
      ),
      db.prepare('SELECT id, skill_id, title, target_date, done FROM milestones ORDER BY position'),
    ]);
    return {
      identities: ((identities?.results ?? []) as IdentityRow[]).map((r) => ({
        id: r.id,
        title: r.title,
        why: r.why,
        ...(r.deadline === null ? {} : { deadline: r.deadline }),
      })),
      skills: ((skills?.results ?? []) as SkillRow[]).map((r) => ({
        id: r.id,
        identityId: r.identity_id,
        name: r.name,
        rubric: r.rubric,
        verifier: r.verifier,
        ...(r.rest_weekday === null ? {} : { restWeekday: r.rest_weekday }),
      })),
      milestones: ((milestones?.results ?? []) as MilestoneRow[]).map((r) => ({
        id: r.id,
        skillId: r.skill_id,
        title: r.title,
        ...(r.target_date === null ? {} : { targetDate: r.target_date }),
        done: r.done === 1,
      })),
    };
  },

  async replace(roadmap, at) {
    // Children first on delete, parents first on insert; `key` is the array index (the order).
    await db.batch([
      db.prepare('DELETE FROM milestones'),
      db.prepare('DELETE FROM skills'),
      db.prepare('DELETE FROM identities'),
      db
        .prepare(
          `INSERT INTO identities (id, title, why, deadline, position, updated_at)
           SELECT value->>'id', value->>'title', value->>'why', value->>'deadline', key, ?2
           FROM json_each(?1)`,
        )
        .bind(JSON.stringify(roadmap.identities), at),
      db
        .prepare(
          `INSERT INTO skills (id, identity_id, name, rubric, verifier, rest_weekday, position, updated_at)
           SELECT value->>'id', value->>'identityId', value->>'name', value->>'rubric',
                  value->>'verifier', value->>'restWeekday', key, ?2
           FROM json_each(?1)`,
        )
        .bind(JSON.stringify(roadmap.skills), at),
      db
        .prepare(
          `INSERT INTO milestones (id, skill_id, title, target_date, done, position, updated_at)
           SELECT value->>'id', value->>'skillId', value->>'title', value->>'targetDate',
                  value->>'done', key, ?2
           FROM json_each(?1)`,
        )
        .bind(JSON.stringify(roadmap.milestones), at),
    ]);
  },
});
```

Add `roadmap: d1Roadmap(db)` to `d1Repos` (with its import).

`apps/api/src/routes/onboarding.ts`:

```ts
import { RoadmapSchema } from '@mflow/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { ok } from '../http/envelope';
import { valid } from '../http/validate';

export const onboardingRoutes = new Hono<AppEnv>()
  .get('/onboarding/roadmap', async (c) => ok(c, await c.var.deps.repos.roadmap.get()))
  .put('/onboarding/roadmap', valid('json', RoadmapSchema), async (c) => {
    const { deps } = c.var;
    const roadmap = c.req.valid('json');
    await deps.repos.roadmap.replace(roadmap, deps.now());
    return ok(c, roadmap);
  });
```

In `apps/api/src/app.ts`, import `onboardingRoutes` and add `authed.route('/', onboardingRoutes);`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run --cwd apps/api typecheck && bun run lint`
Expected: all API tests pass; typecheck and lint are clean.

- [ ] **Step 8: Commit**

```bash
bun x prettier --write packages/contracts apps/api
git add packages/contracts apps/api
git commit -m "feat(api): store the owner's roadmap of identities, skills and milestones"
```

---

### Task 6: Wire the router into the API (`aiFromEnv`, D1 usage counter)

**Files:**

- Create: `apps/api/src/ai.ts`, `apps/api/src/adapters/d1/ai-usage.ts`, `apps/api/test/ai-wiring.test.ts`
- Modify: `apps/api/package.json` (depend on `@mflow/ai`), `apps/api/src/env.ts`, `apps/api/src/ports.ts`, `apps/api/src/adapters/d1/index.ts`, `apps/api/src/app.ts`, `apps/api/.dev.vars.example`, `apps/api/test/helpers.ts`

**Interfaces:**

- Consumes: `createAi`, `geminiTalk`, `geminiJudge`, `jevJudge`, `Ai`, `FetchLike`, `UsageCounter` (Tasks 1–4).
- Produces:
  - `GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash']`
  - `GEMINI_DAILY_LIMIT = 500`, `JEV_DAILY_LIMIT = 200`, `AI_TIMEOUT_MS = 20_000`
  - `timeoutFetch: FetchLike`
  - `aiFromEnv(env, usage, fetch, now): Ai`
- Produces: `Repos.aiUsage: UsageCounter`; `Deps.ai: Ai`; `Bindings` gains `GEMINI_API_KEY?` and `JEV_API_KEY?`; `AppOptions` gains `fetch?: FetchLike`.
- Provider order:
  - talk: Gemini Flash-Lite, then Gemini Flash
  - judge: Jev (only with a key), then the Gemini judge on Flash-Lite
  - No keys → no providers → `ai_unavailable`.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/test/helpers.ts`:

```ts
/** A generateContent reply carrying `text`, as Gemini sends it. */
export const geminiReply = (text: string) => ({
  status: 200,
  text: async () =>
    JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
    }),
});
```

`apps/api/test/ai-wiring.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { aiFromEnv, GEMINI_MODELS } from '../src/ai';
import { d1AiUsage } from '../src/adapters/d1/ai-usage';
import type { FetchLike } from '@mflow/ai';
import { geminiReply, T0 } from './helpers';

const recording = (reply: (url: string) => ReturnType<typeof geminiReply>) => {
  const urls: string[] = [];
  const fetch: FetchLike = async (url) => {
    urls.push(url);
    return reply(url);
  };
  return { fetch, urls };
};

describe('aiFromEnv', () => {
  it('has no providers without keys', async () => {
    const { fetch, urls } = recording(() => geminiReply('hi'));
    const ai = aiFromEnv({ ...env, GEMINI_API_KEY: undefined }, d1AiUsage(env.DB), fetch, () => T0);
    expect(await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).toEqual({
      ok: false,
      error: 'ai_unavailable',
    });
    expect(urls).toEqual([]);
  });

  it('talks to Gemini Flash-Lite first and counts the call in D1 by UTC day', async () => {
    const { fetch, urls } = recording(() => geminiReply('hello'));
    const usage = d1AiUsage(env.DB);
    const ai = aiFromEnv({ ...env, GEMINI_API_KEY: 'g-key' }, usage, fetch, () => T0);

    expect(await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).toEqual({
      ok: true,
      value: 'hello',
    });
    expect(urls[0]).toContain(`${GEMINI_MODELS[0]}:generateContent`);
    expect(await usage.used(`gemini:${GEMINI_MODELS[0]}`, '2026-10-09')).toBe(1);
  });

  it('falls back to Gemini Flash when Flash-Lite fails', async () => {
    const { fetch, urls } = recording((url) =>
      url.includes(GEMINI_MODELS[0])
        ? { status: 503, text: async () => '{}' }
        : geminiReply('from flash'),
    );
    const ai = aiFromEnv({ ...env, GEMINI_API_KEY: 'g-key' }, d1AiUsage(env.DB), fetch, () => T0);

    expect(await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).toEqual({
      ok: true,
      value: 'from flash',
    });
    expect(urls).toHaveLength(2);
  });

  it('judges with Jev first when its key is set', async () => {
    const { fetch, urls } = recording(() => ({
      status: 200,
      text: async () =>
        JSON.stringify({ model: 'jev-1.13.0', answers: { done: { type: 'noul', noul: 0.9 } } }),
    }));
    const ai = aiFromEnv(
      { ...env, GEMINI_API_KEY: 'g-key', JEV_API_KEY: 'j-key' },
      d1AiUsage(env.DB),
      fetch,
      () => T0,
    );

    const result = await ai.judge('state', { done: { type: 'noul', instructions: 'Done?' } });

    expect(result).toEqual({ ok: true, value: { done: { type: 'noul', noul: 0.9 } } });
    expect(urls).toEqual(['https://api.typesafe.ai/v1/systemone']);
  });

  it('the D1 counter adds up per provider and day', async () => {
    const usage = d1AiUsage(env.DB);
    await usage.add('a', '2026-10-09');
    await usage.add('a', '2026-10-09');
    await usage.add('a', '2026-10-10');
    expect([
      await usage.used('a', '2026-10-09'),
      await usage.used('a', '2026-10-10'),
      await usage.used('b', '2026-10-09'),
    ]).toEqual([2, 1, 0]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun install && bun run --cwd apps/api test -- test/ai-wiring.test.ts`
Expected: FAIL. `../src/ai` can't be resolved. (First add `"@mflow/ai": "workspace:*"` to the `dependencies` in `apps/api/package.json`, then run `bun install`.)

- [ ] **Step 3: Implement**

`apps/api/src/adapters/d1/ai-usage.ts`:

```ts
import type { UsageCounter } from '@mflow/ai';

export const d1AiUsage = (db: D1Database): UsageCounter => ({
  async used(provider, day) {
    const row = await db
      .prepare('SELECT count FROM ai_usage WHERE provider = ?1 AND day = ?2')
      .bind(provider, day)
      .first<{ count: number }>();
    return row?.count ?? 0;
  },
  async add(provider, day) {
    await db
      .prepare(
        `INSERT INTO ai_usage (provider, day, count) VALUES (?1, ?2, 1)
         ON CONFLICT (provider, day) DO UPDATE SET count = count + 1`,
      )
      .bind(provider, day)
      .run();
  },
});
```

Add to `apps/api/src/ports.ts` (type import from `@mflow/ai`), and add `aiUsage: UsageCounter;` to `Repos`:

```ts
import type { UsageCounter } from '@mflow/ai';
```

Add `aiUsage: d1AiUsage(db)` to `d1Repos`.

`apps/api/src/ai.ts`:

```ts
import {
  createAi,
  geminiJudge,
  geminiTalk,
  jevJudge,
  type Ai,
  type FetchLike,
  type UsageCounter,
} from '@mflow/ai';
import type { Bindings } from './env';

/** Talk order: the cheapest free model first. Free-tier quotas are per project (see AI Studio). */
export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'] as const;
/** Kept well under the free tier, and counted per UTC day (Google resets at midnight Pacific). */
export const GEMINI_DAILY_LIMIT = 500;
/** Jev is paid per input token; this caps the worst case at a few cents a day. */
export const JEV_DAILY_LIMIT = 200;
export const AI_TIMEOUT_MS = 20_000;

/** Global fetch with a timeout. Waiting on the network does not use Worker CPU time. */
export const timeoutFetch: FetchLike = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

export function aiFromEnv(
  env: Bindings,
  usage: UsageCounter,
  fetchImpl: FetchLike,
  now: () => number,
): Ai {
  const geminiKey = env.GEMINI_API_KEY;
  const talk =
    geminiKey === undefined || geminiKey === ''
      ? []
      : GEMINI_MODELS.map((model) => ({
          provider: geminiTalk({ apiKey: geminiKey, model, fetch: fetchImpl }),
          dailyLimit: GEMINI_DAILY_LIMIT,
        }));
  const jevKey = env.JEV_API_KEY;
  const lite = talk[0];
  const judge = [
    ...(jevKey === undefined || jevKey === ''
      ? []
      : [
          { provider: jevJudge({ apiKey: jevKey, fetch: fetchImpl }), dailyLimit: JEV_DAILY_LIMIT },
        ]),
    ...(lite === undefined
      ? []
      : [{ provider: geminiJudge(lite.provider), dailyLimit: GEMINI_DAILY_LIMIT }]),
  ];
  return createAi({ talk, judge, usage, day: () => new Date(now()).toISOString().slice(0, 10) });
}
```

In `apps/api/src/env.ts`: change `Bindings` to `Env & { SETUP_CODE?: string; GEMINI_API_KEY?: string; JEV_API_KEY?: string }`, add `import type { Ai } from '@mflow/ai';`, and add `ai: Ai;` to `Deps`.

In `apps/api/src/app.ts`:

- Import `aiFromEnv`, `timeoutFetch` from `./ai` and `type FetchLike` from `@mflow/ai`.
- Add `fetch?: FetchLike;` to `AppOptions`.
- Replace the deps middleware body with:

```ts
const limit =
  options.limiter ?? (async (key: string) => (await c.env.RATE_LIMITER.limit({ key })).success);
const repos = d1Repos(c.env.DB);
const ai = aiFromEnv(c.env, repos.aiUsage, options.fetch ?? timeoutFetch, now);
c.set('deps', { now, newId, repos, limit, ai });
await next();
```

Append to `apps/api/.dev.vars.example`:

```
# Optional AI keys. Without them, plans come from the deterministic template.
# Gemini (free tier): https://aistudio.google.com/apikey
GEMINI_API_KEY=
# Jev (paid, judge only): https://typesafe.ai
JEV_API_KEY=
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run --cwd apps/api typecheck && bun run lint`
Expected: all API tests pass; typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api bun.lock
git commit -m "feat(api): build the AI router from Worker secrets with D1 usage counters"
```

---

### Task 7: Plan proposals (`POST /v1/plans/:day/propose`)

**Files:**

- Create: `apps/api/src/planning/propose.ts`, `apps/api/src/routes/propose.ts`, `apps/api/test/propose.test.ts`
- Modify: `apps/api/src/http/envelope.ts` (add `nothing_to_plan`), `apps/api/src/app.ts`

**Interfaces:**

- Consumes: `Ai` (Task 4); `Roadmap` (Task 5); `isRestDay`, `weekdayOf`, `createDraft`, `editDraft`, `DEFAULT_RULES`, `TaskSpec`, `DayKey` (core); `deviceToday`, `isWithinDays` (P3a); `Deps.ai` (Task 6).
- Produces:
  - `PROPOSAL_TASK_SECONDS = 1800`, `TWO_MINUTE_SECONDS = 120`
  - `activeSkills(roadmap, day)`
  - `templateTasks(roadmap, day, newId): TaskSpec[]`
  - `proposalSchema(skillIds): { parse, guide }`
  - `proposalPrompt(roadmap, day): { system, prompt }`
  - `aiTasks(ai, roadmap, day, newId): Promise<TaskSpec[] | null>`
- Produces (router): `talkJson` accepts an optional `guide?: z.ZodType`: the JSON Schema sent to the provider; `schema` still parses.
- Route: `POST /v1/plans/:day/propose` → 200 `{ plan, source: 'ai' | 'template' }`. It needs today or tomorrow (else 422) and a plan that isn't locked (else 409). It needs at least one active skill that day (else 422 `nothing_to_plan`). It replaces the draft's tasks.
- Rules:
  - Template: one task per active skill (up to `planMaxTasks`), titled by the skill's first open milestone, or "Practice <skill>" when none is open.
  - AI: the guide schema lists the active skill ids; parsing accepts any id, then tasks for other skills are dropped; nothing valid left → template.
  - `minutes` must be between 5 and 120.

- [ ] **Step 1: Write the failing tests**

First the router gains an optional `guide` schema: a stricter schema sent to the provider, while the
main `schema` parses. Append to the `talkJson` describe block in `packages/ai/test/router.test.ts`:

```ts
it('sends the guide schema to the provider but parses with the main schema', async () => {
  const sent: unknown[] = [];
  const provider: TalkProvider = {
    name: 'a',
    async talk(req) {
      sent.push(req.jsonSchema);
      return ok('{"tasks":["anything"]}');
    },
  };
  const ai = createAi({
    talk: [limited(provider)],
    judge: [],
    usage: memoryUsage(),
    day: () => DAY,
  });
  const guide = z.object({ tasks: z.array(z.enum(['ship'])).min(1) });

  const result = await ai.talkJson({
    system: 's',
    prompt: 'p',
    schema: Plan,
    guide,
    importance: 'essential',
  });

  expect(result).toEqual({ ok: true, value: { tasks: ['anything'] } });
  expect(JSON.stringify(sent[0])).toContain('ship');
});
```

Then `apps/api/test/propose.test.ts`:

```ts
import type { FetchLike } from '@mflow/ai';
import type { Plan } from '@mflow/core';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  call,
  geminiReply,
  makeApp,
  pairDevice,
  sampleRoadmap,
  taskSpec,
  type App,
} from './helpers';

type Proposal = { plan: Plan; source: 'ai' | 'template' };
const withKey = { GEMINI_API_KEY: 'g-key' };

async function setup(fetch?: FetchLike) {
  const app = makeApp(undefined, fetch === undefined ? {} : { fetch });
  const { token } = await pairDevice(app);
  const roadmap = sampleRoadmap();
  await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: roadmap });
  return { app, token, roadmap };
}

const propose = (app: App, token: string, day: string, keyed = false) =>
  call<Proposal>(app, 'POST', `/v1/plans/${day}/propose`, {
    token,
    ...(keyed ? { env: withKey } : {}),
  });

describe('POST /v1/plans/:day/propose', () => {
  it('without AI keys, proposes the template: one task per active skill, next open milestone', async () => {
    const { app, token, roadmap } = await setup();

    const reply = await propose(app, token, '2026-10-09'); // Friday: both skills active

    expect(reply.body.data.source).toBe('template');
    expect(reply.body.data.plan.status).toBe('draft');
    expect(
      reply.body.data.plan.tasks.map((t) => [t.skillId, t.full.title, t.verifier, t.full.seconds]),
    ).toEqual([
      [roadmap.skills[0]?.id, 'Write a debugging checklist', 'github', 1800],
      [roadmap.skills[1]?.id, 'Finish L0 fractions', 'math', 1800],
    ]);
    const stored = await call<Plan>(app, 'GET', '/v1/plans/2026-10-09', { token });
    expect(stored.body.data).toEqual(reply.body.data.plan);
  });

  it('leaves out skills resting that day', async () => {
    const { app, token, roadmap } = await setup();
    const reply = await propose(app, token, '2026-10-10'); // Saturday: math rests
    expect(reply.body.data.plan.tasks.map((t) => t.skillId)).toEqual([roadmap.skills[0]?.id]);
  });

  it('uses the AI proposal, keeping only tasks for active skills, and counts the call', async () => {
    const calls: unknown[] = [];
    let skillIds: string[] = [];
    const fetch: FetchLike = async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return geminiReply(
        JSON.stringify({
          tasks: [
            {
              skillId: skillIds[0],
              title: 'Reproduce the login bug with a failing test',
              criteria: 'A commit adding the failing test',
              minutes: 45,
              when: '20:00 after dinner, at my desk',
              twoMinuteTitle: 'Open the bug ticket',
              twoMinuteCriteria: 'A commit touching the test file',
            },
            {
              skillId: skillIds[1],
              title: 'Rest-day math',
              criteria: 'x',
              minutes: 30,
              when: 'never',
              twoMinuteTitle: 'x',
              twoMinuteCriteria: 'x',
            },
          ],
        }),
      );
    };
    const { app, token, roadmap } = await setup(fetch);
    skillIds = [roadmap.skills[0]?.id ?? '', roadmap.skills[1]?.id ?? ''];

    const reply = await propose(app, token, '2026-10-10', true);

    expect(reply.body.data.source).toBe('ai');
    expect(reply.body.data.plan.tasks).toEqual([
      {
        id: expect.any(String),
        skillId: skillIds[0],
        when: '20:00 after dinner, at my desk',
        verifier: 'github',
        full: {
          title: 'Reproduce the login bug with a failing test',
          criteria: 'A commit adding the failing test',
          seconds: 2700,
        },
        twoMinute: {
          title: 'Open the bug ticket',
          criteria: 'A commit touching the test file',
          seconds: 120,
        },
      },
    ]);
    const sent = JSON.stringify(calls[0]);
    expect(sent).toContain('Senior software engineer');
    expect(sent).not.toContain('Finish L0 fractions'); // the resting skill's milestones are not sent
    const usage = await env.DB.prepare('SELECT count FROM ai_usage').first<{ count: number }>();
    expect(usage?.count).toBe(1);
  });

  it('falls back to the template when every AI reply is invalid', async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      return geminiReply('Here is your plan: work hard!');
    };
    const { app, token } = await setup(fetch);

    const reply = await propose(app, token, '2026-10-09', true);

    expect(reply.body.data.source).toBe('template');
    expect(calls).toBe(4); // two models × (first try + one repair)
  });

  it('refuses a locked plan, an out-of-range day, and a roadmap with nothing to plan', async () => {
    const { app, token } = await setup();
    const tasks = [taskSpec(), taskSpec(), taskSpec()];
    await call(app, 'PUT', '/v1/plans/2026-10-09', { token, body: { tasks } });
    await call(app, 'POST', '/v1/plans/2026-10-09/lock', { token });

    const locked = await propose(app, token, '2026-10-09');
    const far = await propose(app, token, '2026-10-12');

    const fresh = makeApp();
    const other = await pairDevice(fresh);
    const empty = await propose(fresh, other.token, '2026-10-09');

    expect([locked.status, locked.body.error?.code]).toEqual([409, 'plan_locked']);
    expect(far.status).toBe(422);
    expect([empty.status, empty.body.error?.code]).toEqual([422, 'nothing_to_plan']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd packages/ai test -- test/router.test.ts; bun run --cwd apps/api test -- test/propose.test.ts`
Expected: FAIL. The router test fails because `guide` isn't used (the JSON Schema lacks `ship`); the propose tests fail because `/v1/plans/:day/propose` isn't a route (404 envelopes).

- [ ] **Step 3: Implement**

In `packages/ai/src/router.ts`, add `guide?: z.ZodType;` to the `talkJson` request type, destructure `guide` in `talkJson`, and change `const jsonSchema = jsonSchemaOf(schema);` to `const jsonSchema = jsonSchemaOf(guide ?? schema);`.

Add to `ERRORS` in `apps/api/src/http/envelope.ts`, after `day_out_of_range`:

```ts
  nothing_to_plan: [422, 'No skill is active on that day. Set up the roadmap first.'],
```

`apps/api/src/planning/propose.ts`:

```ts
import type { Ai } from '@mflow/ai';
import type { Roadmap } from '@mflow/contracts';
import { DEFAULT_RULES, isRestDay, weekdayOf, type DayKey, type TaskSpec } from '@mflow/core';
import { z } from 'zod';

export const PROPOSAL_TASK_SECONDS = 30 * 60;
export const TWO_MINUTE_SECONDS = 2 * 60;
const TITLE_MAX = 120;
const MILESTONES_PER_SKILL = 3;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Skill = Roadmap['skills'][number];

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

export const activeSkills = (roadmap: Roadmap, day: DayKey): Skill[] =>
  roadmap.skills.filter((s) => !isRestDay(s.restWeekday, day));

const openMilestones = (roadmap: Roadmap, skillId: string) =>
  roadmap.milestones.filter((m) => m.skillId === skillId && !m.done);

/** The deterministic plan: used when the AI is unavailable or its answer is unusable (spec §13.1). */
export function templateTasks(roadmap: Roadmap, day: DayKey, newId: () => string): TaskSpec[] {
  return activeSkills(roadmap, day)
    .slice(0, DEFAULT_RULES.planMaxTasks)
    .map((skill) => {
      const title = clip(
        openMilestones(roadmap, skill.id)[0]?.title ?? `Practice ${skill.name}`,
        TITLE_MAX,
      );
      return {
        id: newId(),
        skillId: skill.id,
        when: 'Choose a time and an anchor habit',
        verifier: skill.verifier,
        full: { title, criteria: skill.rubric, seconds: PROPOSAL_TASK_SECONDS },
        twoMinute: {
          title: clip(`Two minutes: ${title}`, TITLE_MAX),
          criteria: 'Start it for two minutes',
          seconds: TWO_MINUTE_SECONDS,
        },
      };
    });
}

const proposedTask = (skillId: z.ZodType<string>) =>
  z.object({
    skillId,
    title: z.string().trim().min(1).max(TITLE_MAX),
    criteria: z.string().trim().min(1).max(500),
    minutes: z.number().int().min(5).max(120),
    when: z.string().trim().min(1).max(120),
    twoMinuteTitle: z.string().trim().min(1).max(TITLE_MAX),
    twoMinuteCriteria: z.string().trim().min(1).max(500),
  });

/**
 * Parsing accepts any skill id, so one stray task (an invented or resting skill) is dropped later
 * instead of throwing away a good proposal. The guide sent to the model lists the allowed ids.
 */
export const proposalSchema = (skillIds: readonly [string, ...string[]]) => ({
  parse: z.object({
    tasks: z.array(proposedTask(z.string())).min(1).max(DEFAULT_RULES.planMaxTasks),
  }),
  guide: z.object({
    tasks: z
      .array(proposedTask(z.enum(skillIds)))
      .min(1)
      .max(DEFAULT_RULES.planMaxTasks),
  }),
});

const VERIFIER_HINTS =
  'github = commits or pull requests; math = solved practice problems in the app; ' +
  'reading = a reading log with a short summary; usage = staying under a phone-time limit.';

/** Only what planning needs: identities, active skills, their next open milestones. No location, ledger or chat. */
export function proposalPrompt(roadmap: Roadmap, day: DayKey): { system: string; prompt: string } {
  const active = activeSkills(roadmap, day);
  const becoming = roadmap.identities.map((i) => i.title).join(', ');
  const system = [
    `You are the owner of this plan, a few years from now, after you already became: ${becoming}.`,
    'You plan one day for your past self. Be specific, evidence-based and short. No generic motivation.',
    `Propose ${DEFAULT_RULES.planMinTasks} to ${DEFAULT_RULES.planMaxTasks} tasks, only for the skills given.`,
    `Every task must be checkable by its skill's verifier: ${VERIFIER_HINTS}`,
    'Each task also has a two-minute version for a bad day. "when" is a time plus an anchor habit.',
  ].join('\n');
  const context = {
    day,
    weekday: WEEKDAYS[weekdayOf(day)],
    identities: roadmap.identities.map((i) => ({
      title: i.title,
      why: i.why,
      ...(i.deadline === undefined ? {} : { deadline: i.deadline }),
    })),
    skills: active.map((s) => ({
      id: s.id,
      name: s.name,
      rubric: s.rubric,
      verifier: s.verifier,
      nextMilestones: openMilestones(roadmap, s.id)
        .slice(0, MILESTONES_PER_SKILL)
        .map((m) => ({
          title: m.title,
          ...(m.targetDate === undefined ? {} : { targetDate: m.targetDate }),
        })),
    })),
  };
  return { system, prompt: `Plan this day:\n${JSON.stringify(context, null, 2)}` };
}

/** The AI's proposal as tasks, or null when the AI is unavailable or nothing usable came back. */
export async function aiTasks(
  ai: Ai,
  roadmap: Roadmap,
  day: DayKey,
  newId: () => string,
): Promise<TaskSpec[] | null> {
  const active = activeSkills(roadmap, day);
  const [first, ...rest] = active.map((s) => s.id);
  if (first === undefined) return null;
  const { system, prompt } = proposalPrompt(roadmap, day);
  const schemas = proposalSchema([first, ...rest]);
  const result = await ai.talkJson({
    system,
    prompt,
    schema: schemas.parse,
    guide: schemas.guide,
    importance: 'essential',
  });
  if (!result.ok) return null;
  const byId = new Map(active.map((s) => [s.id, s]));
  const tasks = result.value.tasks.flatMap((t): TaskSpec[] => {
    const skill = byId.get(t.skillId);
    if (skill === undefined) return [];
    return [
      {
        id: newId(),
        skillId: skill.id,
        when: t.when,
        verifier: skill.verifier,
        full: { title: t.title, criteria: t.criteria, seconds: t.minutes * 60 },
        twoMinute: {
          title: t.twoMinuteTitle,
          criteria: t.twoMinuteCriteria,
          seconds: TWO_MINUTE_SECONDS,
        },
      },
    ];
  });
  return tasks.length === 0 ? null : tasks;
}
```

`apps/api/src/routes/propose.ts`:

```ts
import { DayKeySchema } from '@mflow/contracts';
import { createDraft, editDraft } from '@mflow/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { deviceToday, isWithinDays } from '../http/day';
import { fail, ok } from '../http/envelope';
import { valid } from '../http/validate';
import { activeSkills, aiTasks, templateTasks } from '../planning/propose';

const DayParam = z.object({ day: DayKeySchema });

export const proposeRoutes = new Hono<AppEnv>().post(
  '/plans/:day/propose',
  valid('param', DayParam),
  async (c) => {
    const { deps, device } = c.var;
    const { day } = c.req.valid('param');
    const now = deps.now();
    if (!isWithinDays(day, deviceToday(device, now), 0, 1)) return fail(c, 'day_out_of_range');

    const existing = await deps.repos.plans.get(day);
    if (existing?.status === 'locked') return fail(c, 'plan_locked');
    const roadmap = await deps.repos.roadmap.get();
    if (activeSkills(roadmap, day).length === 0) return fail(c, 'nothing_to_plan');

    const fromAi = await aiTasks(deps.ai, roadmap, day, deps.newId);
    const tasks = fromAi ?? templateTasks(roadmap, day, deps.newId);
    const draft = editDraft(existing ?? createDraft(day, []), tasks);
    if (!draft.ok) return fail(c, draft.error);
    if (!(await deps.repos.plans.save(draft.value, now))) return fail(c, 'plan_locked');
    return ok(c, { plan: draft.value, source: fromAi === null ? 'template' : 'ai' });
  },
);
```

In `apps/api/src/app.ts`, import `proposeRoutes` and add `authed.route('/', proposeRoutes);`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd packages/ai test && bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: everything passes; typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write packages/ai apps/api
git add packages/ai apps/api
git commit -m "feat(api): propose the night-before plan with AI and a deterministic fallback"
```

---

### Task 8: ADR 0007, README and the full gate

**Files:**

- Create: `docs/adr/0007-ai-router.md`
- Modify: `README.md` (AI section)

- [ ] **Step 1: Write ADR 0007**

`docs/adr/0007-ai-router.md`:

```markdown
# 0007. AI router: Gemini to talk, Jev to judge, templates when neither answers

- Status: accepted
- Date: 2026-10-11

## Context

mflow needs generated text (coach, plans, reviews, word problems) and typed judgments (did these
commits finish the task? is this reading summary substantial?). It must cost $0/month, never block
the daily loop when an AI is down, and never let an AI decide arithmetic.

## Decision

- **`packages/ai`** is a pure TypeScript router with injected `fetch`, usage counter and day. Providers
  are adapters behind two interfaces (`TalkProvider`, `JudgeProvider`); switching is configuration.
- **talk:** Gemini `generateContent` (free tier), Flash-Lite then Flash. `generateContent` is
  stateless (the newer Interactions API stores interactions server-side by default).
- **judge:** Jev (TypeSafe `POST /v1/systemone`) when `JEV_API_KEY` is set (paid, $0.042 per million
  input tokens), then Gemini asked for probabilities and reshaped into Jev's answers. Gemini's
  confidence is self-reported, not calibrated, so auto-pass waits for the judge eval set (spec §14).
- **Structured output:** zod → JSON Schema → provider, then the same zod validates. One repair retry
  on the same provider, then the next. An optional `guide` schema can be stricter than the parser, so
  one stray item (for example a task for a resting skill) is dropped instead of discarding the answer.
- **Budget guard:** request counters per provider per UTC day in D1 (`ai_usage`). Limits sit well
  below the free tier because Google resets at midnight Pacific. `flourish` stops at 80%.
- **Fallbacks:** if every provider fails, plans come from a deterministic template (next open milestone
  per active skill), and verdicts stay `pending`. Nothing is silently passed or failed.
- **Data minimization:** planning prompts carry identities, active skills and their next milestones
  only. Never location, ledger, chat or device data. The AI layer logs nothing.

## Consequences

- Without any key the app still works: plans are templates, judging is unavailable.
- Jev on Workers AI (`typesafe/jev`) is a third-party model billed through AI Gateway credits, so it
  is not a free route either; the direct API keeps the adapter portable to Node.
- Google may change free-tier quotas per model; limits are constants in `apps/api/src/ai.ts`.
- "Sign in with ChatGPT" (plan usage) was considered: it needs a Plus/Pro subscription and is aimed
  at locally run apps, so it could only ever be an optional phone-side talk provider.
```

- [ ] **Step 2: Add the README section**

Append to `README.md`:

````markdown
## AI (`packages/ai`)

`talk()` (Gemini, free tier) and `judge()` (Jev when a key is set, else Gemini) behind one router with
structured output, one repair retry, provider fallback and a daily budget. See `docs/adr/0007-ai-router.md`.
Without keys, plans come from a deterministic template.

```bash
bun x wrangler secret put GEMINI_API_KEY --cwd apps/api   # optional, free: https://aistudio.google.com/apikey
bun x wrangler secret put JEV_API_KEY --cwd apps/api      # optional, paid
```
````

- [ ] **Step 3: Run the full gate**

Run: `bun run format:check && bun run lint && bun run typecheck && bun run coverage`
Expected: all clean. Coverage thresholds are met in every package (`packages/ai` ≥ 90 on every metric).

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0007-ai-router.md README.md
git commit -m "docs: ADR 0007 for the AI router and README AI section"
```
