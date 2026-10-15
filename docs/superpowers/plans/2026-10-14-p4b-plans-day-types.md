# Future Flow P4b: plans, day types and owner checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the phone, the owner can:

- plan today or tomorrow: propose, edit, add, remove, save and lock
- declare a bad day or an away window
- have away days checked against a home location that never leaves the phone
- decide tasks the judge left pending

This plan also closes the P4a review's deferred minors.

**Architecture:** Same ports as P4a (`Api`, `LocalStore`, `SecretStore`), plus a `Locator` port over expo-location.

- Plan editing is pure functions over `TaskSpec[]` (`plan-draft.ts`). The Plan screen keeps local edits until Save or Lock. Planning is online-only, because the server owns plans and locking.
- The away check computes distance on the device (`away.ts`) and sends only `{ day, verified, distanceKm rounded to 10 }`.
- Navigation stays a Stack. Tabs arrive once Math and Coach exist.

**Tech Stack:** Expo SDK 57, expo-router (Stack, `useFocusEffect`), expo-location (coarse only), React Native `Alert` for confirmations, Jest + RNTL 13.3 + `renderRouter`, Maestro on the CI emulator.

**Spec:** `docs/superpowers/specs/2026-10-08-futureflow-v1-design.md` — §5, §6.1 (plan size 3–5), §6.2 (edit and lock; only `base_grant` until locked), §6.3 (pending verdicts are never silently decided), §6.4 (day types, away verification on device, coordinates never leave the phone), §11 (routes), §13.3 (privacy). ADR 0011 (phone design), ADR 0008 (verification, `JUDGE_AUTO_DECIDE`).

## Global Constraints

- Bun only (`bun x`, never npx/bunx/pnpm). `npx expo install X` in a skill means `bun x expo install X`.
- No AI attribution in commits or PRs.
- **Coordinates never leave the phone.** The home location lives only in SecureStore. Requests carry only `day`, `verified` and an optional `distanceKm` (an integer multiple of 10, at most 20000). Logs never contain coordinates, places, plan text or setup codes.
- Android location permission is **coarse only**: `ACCESS_FINE_LOCATION` and `ACCESS_BACKGROUND_LOCATION` are blocked in `app.config.ts`.
- Task minutes are 5–120. Plans lock with 3–5 tasks (`DEFAULT_RULES.planMinTasks` / `planMaxTasks`). Text limits follow `TaskSpecSchema`: title ≤ 120, criteria ≤ 500, when ≤ 120.
- Every confirmation that changes money-like state (lock a plan, declare a bad day, mark a task passed) uses a two-button `Alert`. Cancel does nothing.
- Every busy flag is reset in `finally`.
- Local machine: never run Gradle or an emulator. A local `expo export` uses `NODE_OPTIONS=--max-old-space-size=640 --max-workers 1`.
- Tests live in `apps/mobile/test/**`. The mobile coverage gate is 80%.

## Review Focus

1. **Lock pressed with unsaved edits.** Lock saves first, then locks. If the save fails, nothing locks and the edits stay on screen. Pinned by the Task 5 test "lock saves unsaved edits first, and a failed save locks nothing".
2. **Away check while the owner is actually home.** A distance under 25 km sends `verified: 'no'` (the server cancels away), and the request body holds no coordinates. Pinned by the Task 7 tests "home sends no" and "the request carries no coordinates".
3. **Location permission refused, or no fix.** Sends `unknown`, at most once an hour per day, and never crashes Today. Pinned by Task 7 "refused permission sends unknown, once per hour".
4. **Owner marks a pending task passed by accident.** A confirmation explains it pays time. Cancel sends nothing. Pinned by Task 8 "cancel sends nothing".
5. **Switching day with unsaved edits.** Switching is blocked until the owner saves or discards. Pinned by Task 5 "unsaved edits block switching day until discarded".

---

## File structure (new or changed)

```
apps/mobile/
├── app.config.ts                   # + expo-location plugin, blocked fine/background location, extra.allowCleartext
├── e2e/
│   ├── seed-roadmap.sql            # one identity, three skills, milestones
│   └── flows/pair-and-today.yaml   # + plan, lock, bad day
├── src/
│   ├── app/{plan.tsx,away.tsx}     # routes
│   ├── lib/
│   │   ├── api/client.ts           # + plans, day types, verdicts, roadmap
│   │   ├── away.ts                 # distance, verdict, checkAway
│   │   ├── config.ts               # parseApiUrl(raw, { allowHttp })
│   │   ├── ledger.ts               # + dayTotals (earned by work, allowance)
│   │   ├── location.ts             # Locator port + expo-location adapter
│   │   ├── plan-draft.ts           # pure draft editing and validation
│   │   ├── store/{sqlite-store,types}.ts  # + serial writes, away windows, check times
│   │   └── sync.ts                 # + idle(), pull stall guard
│   └── screens/
│       ├── away.tsx
│       ├── plan/{index.tsx,task-editor.tsx,use-plan.ts}
│       └── today/{index.tsx,task-row.tsx,use-today.ts}
└── test/*.test.ts(x)
```

---

### Task 1: P4a robustness follow-ups

**Files:**

- Modify: `src/lib/store/sqlite-store.ts`, `src/lib/sync.ts`, `src/lib/config.ts`, `src/lib/services.ts`, `src/lib/pairing.ts`, `src/lib/app.tsx`, `src/screens/pair.tsx`, `src/screens/diagnostics.tsx`, `src/screens/today/use-today.ts`, `src/screens/today/index.tsx`, `app.config.ts`, `.github/workflows/android-e2e.yml`
- Test: `test/store.test.ts`, `test/sync.test.ts`, `test/config.test.ts`, `test/pairing.test.ts`, `test/screens.test.tsx`

**Interfaces:**

- Produces:
  - `parseApiUrl(raw: string | undefined, options: { allowHttp: boolean }): string`
  - `Syncer.idle(): Promise<void>`
  - the store serializes its writes
  - `syncOnce` stops as `invalid_response` when a full page doesn't advance the cursor

- [ ] **Step 1: Write the failing tests**

`test/store.test.ts`, add:

```ts
test('concurrent writes never nest transactions', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(1), ledgerEvent(2)]);
  await Promise.all([
    store.applyPage([ledgerEvent(3)], 1, true),
    store.clearServerCopy(),
    store.bury([ledgerEvent(2).id], 'future_timestamp', NOW),
    store.settle([ledgerEvent(1).id], []),
  ]);
  expect(await store.counts()).toEqual({ pending: 0, dead: 1 });
});
```

`test/sync.test.ts`, add:

```ts
test('a full page that does not move the cursor stops the pull', async () => {
  const { deps, calls } = await setup({
    pull: () => ({ ok: true, data: { events: many(500), next: 0 } }),
  });
  expect((await syncOnce(deps)).status).toBe('invalid_response');
  expect(calls.pull).toEqual([0]);
});

test('idle waits for a running sync and resolves at once otherwise', async () => {
  const { deps } = await setup();
  const syncer = createSyncer(deps);
  await syncer.idle();
  let done = false;
  void syncer.sync().then(() => {
    done = true;
  });
  await syncer.idle();
  expect(done).toBe(true);
});
```

`test/config.test.ts`: change both `test.each` callers to pass `{ allowHttp: true }`, then add:

```ts
test('plain http is refused when the build cannot use it, even for local hosts', () => {
  expect(() => parseApiUrl('http://10.0.2.2:8787', { allowHttp: false })).toThrow('must use https');
  expect(parseApiUrl('https://api.example.com', { allowHttp: false })).toBe(
    'https://api.example.com',
  );
});
```

`test/pairing.test.ts`: the short-code message becomes `'The setup code is 16 to 128 characters.'`. Add a case `['long code', { code: 'x'.repeat(129), deviceName: 'P' }, 'The setup code is 16 to 128 characters.']` to the `test.each` table.

`test/screens.test.tsx`, add:

```ts
test('a storage failure while pairing shows an error and frees the button', async () => {
  const services = await testServices({
    pair: async () => ({ ok: true, data: { deviceId: PAIRED.device_id } }),
  });
  const broken: AppServices = {
    ...services,
    secrets: {
      ...services.secrets,
      set: async () => {
        throw new Error('keystore');
      },
    },
  };
  mount(ready(broken));
  fireEvent.changeText(await screen.findByTestId('setup-code'), 'setup-code-0123456789');
  fireEvent.press(screen.getByTestId('pair-button'));
  expect(
    await screen.findByText('Could not save the pairing on this phone. Try again.'),
  ).toBeTruthy();
  expect(screen.getByTestId('pair-button')).toBeEnabled();
});

test('an answer the app does not understand says to update the app', async () => {
  const services = await testServices(
    { today: async () => ({ ok: false, error: { kind: 'invalid_response' } }) },
    PAIRED,
  );
  mount(ready(services));
  expect(await screen.findByText(/Update the app/)).toBeTruthy();
});

test('Diagnostics frees its button when loading fails after a sync', async () => {
  const services = await testServices({}, PAIRED);
  let calls = 0;
  const flaky: AppServices = {
    ...services,
    store: {
      ...services.store,
      counts: async () => {
        calls++;
        if (calls > 1) throw new Error('disk');
        return services.store.counts();
      },
    },
  };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mount(ready(flaky), '/diagnostics');
  fireEvent.press(await screen.findByTestId('sync-now'));
  await waitFor(() => expect(screen.getByTestId('sync-now')).toBeEnabled());
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/store.test.ts test/sync.test.ts test/config.test.ts test/pairing.test.ts test/screens.test.tsx`
Expected: the new tests FAIL. The concurrent-writes test fails with "cannot start a transaction within a transaction"; `idle` is not a function; the pull is called 20 times; the http test passes no option; the messages differ; the pair button stays disabled.

- [ ] **Step 3: Implement**

`src/lib/store/sqlite-store.ts`: add a write queue and route every write through it.

```ts
/** expo-sqlite transactions are not exclusive, so writes take turns instead of nesting. */
function createQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
```

Inside `sqliteStore`, add `const write = createQueue();`. Wrap the bodies of `enqueue`, `settle`, `bury`, `applyPage`, `saveToday`, `saveSync` and `clearServerCopy` in `return write(async () => { … })`. Wrap any later write method the same way.

`src/lib/sync.ts`:

- In `pull`, read `const since = await deps.store.cursor()` before the request.
- After a full page, `if (!complete && result.data.next <= since) return { stop: 'invalid_response', pulled };` (place it after `applyPage`).
- Add `idle` to `Syncer`:

```ts
export type Syncer = Readonly<{ sync(): Promise<SyncReport>; idle(): Promise<void> }>;
// in createSyncer:
    idle: () => (running === null ? Promise.resolve() : running.then(() => undefined, () => undefined)),
```

`src/lib/config.ts`: `parseApiUrl(raw, { allowHttp })`. Plain `http` is allowed only when `allowHttp` is true and the host is local. The message is unchanged.

`app.config.ts`: add `extra: { allowCleartext: isE2E }`.
`src/lib/services.ts`:

```ts
import Constants from 'expo-constants';
// …
const allowHttp = __DEV__ || Constants.expoConfig?.extra?.allowCleartext === true;
const apiUrl = parseApiUrl(process.env.EXPO_PUBLIC_API_URL, { allowHttp });
```

`src/lib/pairing.ts`: `shortCode` becomes `` `The setup code is ${MIN_CODE} to ${MAX_CODE} characters.` `` (rename the key to `codeLength`).

`src/lib/app.tsx`: `forget` awaits `services.syncer.idle()` before `forgetPairing`.

`src/screens/pair.tsx`: wrap the submit body in `try { … } catch { setError('Could not save the pairing on this phone. Try again.'); } finally { setBusy(false); }`, calling `setPaired` only on success.

`src/screens/diagnostics.tsx`:

```ts
const syncNow = async () => {
  setBusy(true);
  try {
    await services.syncer.sync();
    await load();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'diagnostics_failed',
        name: error instanceof Error ? error.name : 'unknown',
      }),
    );
  } finally {
    setBusy(false);
  }
};
```

`src/screens/today/use-today.ts`, `refresh`: `try { await services.syncer.sync(); } catch { log } try { await reload(); } catch { log reload_failed } finally { if (live.current) setView(… syncing: false, tried: true) }`.

`src/screens/today/index.tsx`:

- `staleNotice` returns `'This app is out of date for the server. Update the app. Showing what was saved at HH:MM.'` for `invalid_response`.
- The no-data screen shows `'Update the app, then try again.'` when `lastSync?.status === 'invalid_response'`, and otherwise `'Check the connection, then try again.'`.

`.github/workflows/android-e2e.yml`, Install Maestro step:

```yaml
- name: Install Maestro (pinned)
  env:
    MAESTRO_VERSION: '<version from the last run log: grep "maestro" for the installed version>'
  run: curl -fsSL https://get.maestro.mobile.dev | bash
```

Read the version from the last e2e run's log (`gh run view <id> --log | grep -i 'maestro.*[0-9]\+\.[0-9]\+\.[0-9]\+'`) and write it in. Don't guess.

- [ ] **Step 4: Run them to verify they pass, then the mobile suite**

Run: `cd apps/mobile && bun x jest`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile .github/workflows/android-e2e.yml
git commit -m "fix: serialize store writes, stop stalled pulls, and free busy buttons on errors"
```

---

### Task 2: Today shows earned-by-work separately and refreshes on focus

**Files:**

- Modify: `src/lib/ledger.ts`, `src/screens/today/use-today.ts`, `src/screens/today/index.tsx`
- Test: `test/ledger.test.ts`, `test/screens.test.tsx`

**Interfaces:**

- Produces: `dayTotals(confirmed, pending, day): { earned: number; allowance: number }`. `earned` sums `task_reward`, `all_done_bonus` and `math_reward`. `allowance` sums `base_grant`. Both use `mergeEvents`, so nothing counts twice.
- `TodayView` gains `earnedSeconds` and `allowanceSeconds`.

- [ ] **Step 1: Write the failing tests**

`test/ledger.test.ts`, add:

```ts
import { dayTotals, projectBalance } from '@/lib/ledger';

test('a base grant written by both phone and server counts once', () => {
  const server = ledgerEvent(1, { kind: 'base_grant', seconds: 900 });
  const phone = ledgerEvent(2, { kind: 'base_grant', seconds: 900 });
  expect(projectBalance([server], [phone])).toBe(900);
});

test('a repayment whose reward was dropped as a duplicate is dropped too', () => {
  const reward = ledgerEvent(1, { kind: 'task_reward', seconds: 600, refId: 'task-1' });
  const again = ledgerEvent(2, { kind: 'task_reward', seconds: 600, refId: 'task-1' });
  const repay = ledgerEvent(3, { kind: 'borrow_repay', seconds: -300, refId: again.id });
  expect(projectBalance([reward], [again, repay])).toBe(600);
});

test('dayTotals splits work from the free allowance for one day', () => {
  const events = [
    ledgerEvent(1, { kind: 'base_grant', seconds: 900 }),
    ledgerEvent(2, { kind: 'task_reward', seconds: 1800, refId: 't1' }),
    ledgerEvent(3, { kind: 'all_done_bonus', seconds: 900 }),
    ledgerEvent(4, { kind: 'math_reward', seconds: 180, refId: 'a1' }),
    ledgerEvent(5), // a spend
    ledgerEvent(6, { kind: 'task_reward', seconds: 600, refId: 't9', day: '2026-10-13' }),
  ];
  expect(dayTotals(events.slice(0, 3), events.slice(3), '2026-10-14')).toEqual({
    earned: 1800 + 900 + 180,
    allowance: 900,
  });
});
```

`test/screens.test.tsx`: the existing "Today shows the balance…" test changes. Use `applyPage([ledgerEvent(1, { kind: 'base_grant', seconds: 3960 })], 1, true)`. It now expects `'Earned today 0 min'` and `'Daily allowance 1 h 06 min'` instead of `'Earned today 25 min'`. Add:

```ts
test('coming back to Today from another screen syncs again', async () => {
  let syncs = 0;
  const services = await testServices(
    {
      today: async () => {
        syncs++;
        return { ok: true, data: sampleToday() };
      },
    },
    PAIRED,
  );
  mount(ready(services));
  expect(await screen.findByText('Fractions practice')).toBeTruthy();
  fireEvent.press(screen.getByTestId('diagnostics-link'));
  expect(await screen.findByText('Waiting to send')).toBeTruthy();
  act(() => testRouter.back());
  await waitFor(() => expect(syncs).toBe(2));
});
```

(Import `testRouter` from `expo-router/testing-library`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/ledger.test.ts test/screens.test.tsx`
Expected: FAIL. `dayTotals` is not exported, the labels differ, and `syncs` stays 1. The two duplicate tests may already pass because `mergeEvents` covers them; they pin that behavior.

- [ ] **Step 3: Implement**

`src/lib/ledger.ts`:

```ts
import { balance, mergeEvents, sumKind, type LedgerEvent } from '@futureflow/core';

const WORK_KINDS = ['task_reward', 'all_done_bonus', 'math_reward'] as const;

export const projectBalance = (
  confirmed: readonly LedgerEvent[],
  pending: readonly LedgerEvent[],
): number => balance(mergeEvents(confirmed, pending).events);

/** What a day paid for work, apart from the free daily allowance (the server's "earned" counts both). */
export function dayTotals(
  confirmed: readonly LedgerEvent[],
  pending: readonly LedgerEvent[],
  day: string,
): { earned: number; allowance: number } {
  const events = mergeEvents(confirmed, pending).events.filter((e) => e.day === day);
  return {
    earned: WORK_KINDS.reduce((total, kind) => total + sumKind(events, kind), 0),
    allowance: sumKind(events, 'base_grant'),
  };
}
```

`use-today.ts`:

- `reload` computes `dayTotals(confirmed, pending, saved?.today.day ?? '')` into `earnedSeconds` and `allowanceSeconds`.
- Replace the mount `useEffect` that calls `reload().then(refresh)` with `useFocusEffect(useCallback(() => { void reload().then(refresh); }, [reload, refresh]))` from `expo-router`.
- Keep the AppState listener in its own `useEffect`, and keep the `live` ref cleanup in a mount-only `useEffect`.

`today/index.tsx`: under the balance, render `Earned today {formatDuration(earnedSeconds)}` and `Daily allowance {formatDuration(allowanceSeconds)}`.

- [ ] **Step 4: Run them to verify they pass, then the mobile suite**

Run: `cd apps/mobile && bun x jest`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat: show earned-by-work apart from the daily allowance, and refresh Today on focus"
```

---

### Task 3: API client for plans, day types, verdicts and the roadmap

**Files:**

- Modify: `src/lib/api/client.ts`, `test/support/fakes.ts` (default fakes for the new methods)
- Test: `test/api-client.test.ts`

**Interfaces:**

- Consumes: contracts `PlanSchema`, `ProposeResponseSchema`, `DayRecordSchema`, `VerdictSchema`, `RoadmapSchema`; core `TaskSpec`.
- Produces (new `Api` methods; all return `ApiResult`):

  ```ts
  getPlan(day: string): Promise<ApiResult<Plan | null>>        // 404 not_found → { ok: true, data: null }
  savePlan(day: string, tasks: readonly TaskSpec[]): Promise<ApiResult<Plan>>   // PUT /v1/plans/:day
  proposePlan(day: string): Promise<ApiResult<{ plan: Plan; source: 'ai' | 'template' }>>
  lockPlan(day: string): Promise<ApiResult<Plan>>              // POST /v1/plans/:day/lock
  declareBadDay(day: string): Promise<ApiResult<DayRecord>>    // POST /v1/day-type { day, kind: 'bad' }
  declareAway(body: AwayRequest): Promise<ApiResult<{ id: string; days: DayRecord[] }>>
  sendAwayVerdict(id: string, body: AwayVerdictRequest): Promise<ApiResult<DayRecord>>
  decideVerdict(taskId: string, body: { day: string; outcome: 'pass' | 'fail' }): Promise<ApiResult<Verdict>>
  getRoadmap(): Promise<ApiResult<Roadmap | null>>
  ```

  Exported types: `Plan`, `DayRecord`, `Verdict`, `AwayRequest`, `AwayVerdictRequest`, `Roadmap`, `ProposeResult`.

- [ ] **Step 1: Write the failing tests**

Add to `test/api-client.test.ts`:

```ts
const plan = sampleToday().plan!;
const record = { day: '2026-10-14', kind: 'bad' as const };

test.each([
  [
    'savePlan',
    (a: Api) => a.savePlan('2026-10-15', plan.tasks),
    'PUT',
    '/v1/plans/2026-10-15',
    { tasks: plan.tasks },
    plan,
  ],
  [
    'proposePlan',
    (a: Api) => a.proposePlan('2026-10-15'),
    'POST',
    '/v1/plans/2026-10-15/propose',
    undefined,
    { plan, source: 'template' },
  ],
  [
    'lockPlan',
    (a: Api) => a.lockPlan('2026-10-15'),
    'POST',
    '/v1/plans/2026-10-15/lock',
    undefined,
    plan,
  ],
  [
    'declareBadDay',
    (a: Api) => a.declareBadDay('2026-10-14'),
    'POST',
    '/v1/day-type',
    { day: '2026-10-14', kind: 'bad' },
    record,
  ],
  [
    'declareAway',
    (a: Api) =>
      a.declareAway({
        id: PAIRED_ID,
        from: '2026-10-15',
        to: '2026-10-16',
        place: 'Montreal',
        keptTaskIds: [],
      }),
    'POST',
    '/v1/away',
    { id: PAIRED_ID, from: '2026-10-15', to: '2026-10-16', place: 'Montreal', keptTaskIds: [] },
    { id: PAIRED_ID, days: [record] },
  ],
  [
    'sendAwayVerdict',
    (a: Api) =>
      a.sendAwayVerdict(PAIRED_ID, { day: '2026-10-15', verified: 'yes', distanceKm: 540 }),
    'POST',
    `/v1/away/${PAIRED_ID}/verdict`,
    { day: '2026-10-15', verified: 'yes', distanceKm: 540 },
    record,
  ],
  [
    'decideVerdict',
    (a: Api) => a.decideVerdict('t1', { day: '2026-10-14', outcome: 'pass' }),
    'POST',
    '/v1/verdicts/t1',
    { day: '2026-10-14', outcome: 'pass' },
    {
      day: '2026-10-14',
      taskId: 't1',
      outcome: 'pass',
      confidence: 1,
      by: 'owner',
      evidenceIds: [],
    },
  ],
] as const)('%s calls %s %s', async (_name, call, method, path, body, data) => {
  const { api, calls } = setup(async () => jsonResponse(200, okBody(data)));
  expect(await call(api)).toEqual({ ok: true, data });
  expect(calls[0]?.init.method).toBe(method);
  expect(calls[0]?.url).toBe(`https://api.test${path}`);
  expect(
    calls[0]?.init.body === undefined ? undefined : JSON.parse(String(calls[0]?.init.body)),
  ).toEqual(body);
});

test('getPlan answers null for a day without a plan', async () => {
  const { api } = setup(async () => jsonResponse(404, errBody('not_found', 'Not found.')));
  expect(await api.getPlan('2026-10-15')).toEqual({ ok: true, data: null });
});

test('getPlan returns the plan, and getRoadmap may be empty', async () => {
  const withPlan = setup(async () => jsonResponse(200, okBody(plan)));
  expect(await withPlan.api.getPlan('2026-10-14')).toEqual({ ok: true, data: plan });
  const empty = setup(async () => jsonResponse(200, okBody(null)));
  expect(await empty.api.getRoadmap()).toEqual({ ok: true, data: null });
});
```

`PAIRED_ID = '01920000-0000-7000-8000-0000000000d1'` at the top. Import `type Api`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/api-client.test.ts`
Expected: FAIL, because `savePlan` is not a function.

- [ ] **Step 3: Implement**

In `client.ts`:

- Add `'PUT'` to `Call.method`.
- Add schemas: `const AwayResponseSchema = z.object({ id: z.uuid(), days: z.array(DayRecordSchema) });`. This needs a value import of `z` from `zod`, so change `import type { z }` to `import { z }`.
- Add the methods. `getPlan` maps a `rejected` result with code `not_found` to `{ ok: true, data: null }`.
- Export the types: `Plan`, `DayRecord`, `Verdict`, `AwayRequest`, `AwayVerdictRequest`, `Roadmap`, `ProposeResult`, each `z.infer` of the contract schema.

```ts
    getPlan: async (day: string): Promise<ApiResult<Plan | null>> => {
      const result = await request(deps, PlanSchema, { method: 'GET', path: `/v1/plans/${day}` });
      if (!result.ok && result.error.kind === 'rejected' && result.error.code === 'not_found') {
        return { ok: true, data: null };
      }
      return result;
    },
    savePlan: (day: string, tasks: readonly TaskSpec[]) =>
      request(deps, PlanSchema, { method: 'PUT', path: `/v1/plans/${day}`, body: { tasks } }),
    proposePlan: (day: string) =>
      request(deps, ProposeResponseSchema, { method: 'POST', path: `/v1/plans/${day}/propose` }),
    lockPlan: (day: string) =>
      request(deps, PlanSchema, { method: 'POST', path: `/v1/plans/${day}/lock` }),
    declareBadDay: (day: string) =>
      request(deps, DayRecordSchema, { method: 'POST', path: '/v1/day-type', body: { day, kind: 'bad' } }),
    declareAway: (body: AwayRequest) =>
      request(deps, AwayResponseSchema, { method: 'POST', path: '/v1/away', body }),
    sendAwayVerdict: (id: string, body: AwayVerdictRequest) =>
      request(deps, DayRecordSchema, { method: 'POST', path: `/v1/away/${id}/verdict`, body }),
    decideVerdict: (taskId: string, body: { day: string; outcome: 'pass' | 'fail' }) =>
      request(deps, VerdictSchema, { method: 'POST', path: `/v1/verdicts/${taskId}`, body }),
    getRoadmap: () =>
      request(deps, RoadmapSchema.nullable(), { method: 'GET', path: '/v1/onboarding/roadmap' }),
```

POSTs without a body send no `content-type`. The API accepts that for these routes.

`test/support/fakes.ts` `testServices`: give every new method a default fake. `getPlan`, `getRoadmap` → `{ ok: true, data: null }`. The writes → `{ ok: false, error: { kind: 'network' } }`.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/mobile && bun x jest test/api-client.test.ts && bun x tsc -p tsconfig.json`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat: add plan, day-type, verdict and roadmap calls to the app's API client"
```

---

### Task 4: Pure plan-draft editing and validation

**Files:**

- Create: `src/lib/plan-draft.ts`
- Test: `test/plan-draft.test.ts`

**Interfaces:**

- Consumes: core `TaskSpec`, `DEFAULT_RULES`; contracts `Skill` type.
- Produces:

  ```ts
  MIN_MINUTES = 5; MAX_MINUTES = 120
  type TaskEdit = Partial<{ title: string; criteria: string; when: string; minutes: number; smallTitle: string }>
  editTask(tasks: readonly TaskSpec[], id: string, edit: TaskEdit): TaskSpec[]
  removeTask(tasks: readonly TaskSpec[], id: string): TaskSpec[]
  newTask(skill: Pick<Skill, 'id' | 'verifier'>, id: string): TaskSpec
  type DraftProblem = { taskId: string | null; message: string }
  taskProblems(tasks): DraftProblem[]      // per task: blocks Save
  lockProblems(tasks): DraftProblem[]      // taskProblems + plan size: blocks Lock
  minutesOf(task: TaskSpec): number
  ```

- [ ] **Step 1: Write the failing tests**

`test/plan-draft.test.ts`:

```ts
import {
  editTask,
  lockProblems,
  minutesOf,
  newTask,
  removeTask,
  taskProblems,
} from '@/lib/plan-draft';
import { sampleToday } from './support/fakes';

const tasks = sampleToday().plan!.tasks;
const [first, second] = tasks as [(typeof tasks)[number], (typeof tasks)[number]];
const skill = { id: '01920000-0000-7000-8000-00000000b001', verifier: 'reading' as const };

test('editTask changes one task immutably and converts minutes to seconds', () => {
  const edited = editTask(tasks, first.id, { title: 'Decimals', minutes: 45, when: 'after lunch' });
  expect(edited[0]).toMatchObject({
    when: 'after lunch',
    full: { title: 'Decimals', seconds: 2700 },
  });
  expect(edited[1]).toBe(second);
  expect(tasks[0]!.full.title).toBe('Fractions practice');
  expect(minutesOf(edited[0]!)).toBe(45);
});

test('the smallest version keeps its own criteria unless it mirrored the title', () => {
  const blank = newTask(skill, 'id-new');
  const named = editTask([blank], 'id-new', { smallTitle: 'Read one page' })[0]!;
  expect(named.twoMinute).toEqual({
    title: 'Read one page',
    criteria: 'Read one page',
    seconds: 120,
  });
  const kept = editTask(tasks, first.id, { smallTitle: 'Two problems' })[0]!;
  expect(kept.twoMinute.criteria).toBe('Solve one problem');
});

test('a new task uses the skill and its verifier and starts empty', () => {
  expect(newTask(skill, 'id-new')).toEqual({
    id: 'id-new',
    skillId: skill.id,
    verifier: 'reading',
    when: '',
    full: { title: '', criteria: '', seconds: 1800 },
    twoMinute: { title: '', criteria: '', seconds: 120 },
  });
});

test('removeTask drops one task', () => {
  expect(removeTask(tasks, first.id)).toEqual([second]);
});

test('taskProblems name each empty or out-of-range field', () => {
  const bad = editTask([newTask(skill, 'n1')], 'n1', { minutes: 3 });
  expect(taskProblems(bad).map((p) => p.message)).toEqual([
    'Give the task a title.',
    'Say how you will know it is done.',
    'Say when you will do it.',
    'Minutes must be 5 to 120.',
    'Give the 2-minute version a title.',
  ]);
  expect(taskProblems(tasks)).toEqual([]);
});

test('lockProblems add the 3-to-5 task rule', () => {
  expect(lockProblems(tasks)).toEqual([
    { taskId: null, message: 'A plan needs 3 to 5 tasks to lock.' },
  ]);
  const three = [...tasks, { ...first, id: 'x3' }];
  expect(lockProblems(three)).toEqual([]);
});

test('minutes are clamped to whole numbers', () => {
  expect(minutesOf(editTask(tasks, first.id, { minutes: 12.6 })[0]!)).toBe(13);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/plan-draft.test.ts`
Expected: FAIL with `Cannot find module '@/lib/plan-draft'`.

- [ ] **Step 3: Implement**

`src/lib/plan-draft.ts`:

```ts
import { DEFAULT_RULES, type TaskSpec } from '@futureflow/core';
import type { Skill } from '@futureflow/contracts';

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 120;
const DEFAULT_MINUTES = 30;
const SMALL_SECONDS = 120;

export type TaskEdit = Partial<{
  title: string;
  criteria: string;
  when: string;
  minutes: number;
  smallTitle: string;
}>;

export type DraftProblem = Readonly<{ taskId: string | null; message: string }>;

export const minutesOf = (task: TaskSpec): number => Math.round(task.full.seconds / 60);

function applyEdit(task: TaskSpec, edit: TaskEdit): TaskSpec {
  const small = task.twoMinute;
  const mirrored = small.criteria === '' || small.criteria === small.title;
  return {
    ...task,
    when: edit.when ?? task.when,
    full: {
      title: edit.title ?? task.full.title,
      criteria: edit.criteria ?? task.full.criteria,
      seconds: edit.minutes === undefined ? task.full.seconds : Math.round(edit.minutes) * 60,
    },
    twoMinute:
      edit.smallTitle === undefined
        ? small
        : {
            ...small,
            title: edit.smallTitle,
            criteria: mirrored ? edit.smallTitle : small.criteria,
          },
  };
}

export const editTask = (tasks: readonly TaskSpec[], id: string, edit: TaskEdit): TaskSpec[] =>
  tasks.map((t) => (t.id === id ? applyEdit(t, edit) : t));

export const removeTask = (tasks: readonly TaskSpec[], id: string): TaskSpec[] =>
  tasks.filter((t) => t.id !== id);

export const newTask = (skill: Pick<Skill, 'id' | 'verifier'>, id: string): TaskSpec => ({
  id,
  skillId: skill.id,
  verifier: skill.verifier,
  when: '',
  full: { title: '', criteria: '', seconds: DEFAULT_MINUTES * 60 },
  twoMinute: { title: '', criteria: '', seconds: SMALL_SECONDS },
});

const blank = (text: string) => text.trim() === '';

/** Problems that would make the server refuse the draft (TaskSpecSchema). */
export function taskProblems(tasks: readonly TaskSpec[]): DraftProblem[] {
  return tasks.flatMap((t) => {
    const minutes = minutesOf(t);
    const checks: [boolean, string][] = [
      [blank(t.full.title), 'Give the task a title.'],
      [blank(t.full.criteria), 'Say how you will know it is done.'],
      [blank(t.when), 'Say when you will do it.'],
      [
        minutes < MIN_MINUTES || minutes > MAX_MINUTES,
        `Minutes must be ${MIN_MINUTES} to ${MAX_MINUTES}.`,
      ],
      [blank(t.twoMinute.title), 'Give the 2-minute version a title.'],
    ];
    return checks.filter(([failed]) => failed).map(([, message]) => ({ taskId: t.id, message }));
  });
}

export function lockProblems(tasks: readonly TaskSpec[]): DraftProblem[] {
  const { planMinTasks: min, planMaxTasks: max } = DEFAULT_RULES;
  const size: DraftProblem[] =
    tasks.length < min || tasks.length > max
      ? [{ taskId: null, message: `A plan needs ${min} to ${max} tasks to lock.` }]
      : [];
  return [...taskProblems(tasks), ...size];
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/mobile && bun x jest test/plan-draft.test.ts`
Expected: PASS 7/7.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/plan-draft.ts apps/mobile/test/plan-draft.test.ts
git commit -m "feat: add pure plan-draft editing and validation for the phone"
```

---

### Task 5: Plan screen (today or tomorrow: propose, edit, add, save, lock)

**Files:**

- Create: `src/screens/plan/use-plan.ts`, `src/screens/plan/task-editor.tsx`, `src/screens/plan/index.tsx`, `src/app/plan.tsx`
- Modify: `src/screens/root-stack.tsx` (add `plan` and `away` screens to the paired group), `src/screens/today/index.tsx` (a "Plan" button), `test/screens.test.tsx` (mount `plan`)
- Test: `test/plan-screen.test.tsx`

**Interfaces:**

- Consumes: Task 3's API methods, Task 4's draft functions, core `addDays`.
- Produces: route `/plan` and screen `PlanScreen`. The day comes from the saved snapshot's `today.day`. Tomorrow is `addDays(day, 1)`.
- testIDs: `plan-today`, `plan-tomorrow`, `propose`, `save-plan`, `lock-plan`, `discard`, `add-task`, `task-<index>` (card), `title-<index>`, `minutes-<index>`, `remove-<index>`.
- Copy:
  - "Plan today" / "Plan tomorrow"
  - "No plan yet" + Propose; "Suggested by your coach" vs "From your roadmap"
  - "Locked at HH:MM"
  - "Planning needs a connection."
  - "Add skills to your roadmap first."
  - "Unsaved changes" + Discard

- [ ] **Step 1: Write the failing tests**

`test/plan-screen.test.tsx`:

```tsx
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import type { Api, Plan } from '@/lib/api/client';
import { AppProvider, type AppServices } from '@/lib/app';
import { PlanScreen } from '@/screens/plan';
import { RootStack } from '@/screens/root-stack';
import { TodayScreen } from '@/screens/today';
import { PAIRED, sampleToday, testServices } from './support/fakes';

const TOMORROW = '2026-10-15';
const proposed: Plan = {
  ...sampleToday().plan!,
  day: TOMORROW,
  status: 'draft',
  lockedAt: undefined,
};
const threeTasks: Plan = {
  ...proposed,
  tasks: [...proposed.tasks, { ...proposed.tasks[0]!, id: '01920000-0000-7000-8000-00000000a003' }],
};

async function openPlan(api: Partial<Api>) {
  const services = await testServices(api, PAIRED);
  await services.syncer.sync(); // saved snapshot: today is 2026-10-14
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      index: TodayScreen,
      plan: PlanScreen,
    },
    { initialUrl: '/plan' },
  );
  return services;
}

/** Presses the named button of the latest Alert. */
const answerAlert = (label: string) => {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  act(() => buttons.find((b) => b.text === label)?.onPress?.());
};

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

test('shows tomorrow empty and proposes a plan', async () => {
  const proposePlan = jest.fn(async () => ({
    ok: true as const,
    data: { plan: proposed, source: 'template' as const },
  }));
  await openPlan({ proposePlan });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  expect(await screen.findByText('No plan yet')).toBeTruthy();
  fireEvent.press(screen.getByTestId('propose'));
  expect(await screen.findByDisplayValue('Fractions practice')).toBeTruthy();
  expect(screen.getByText('From your roadmap')).toBeTruthy();
  expect(proposePlan).toHaveBeenCalledWith(TOMORROW);
});

test('edits are saved with the new values', async () => {
  const savePlan = jest.fn(async (_day: string, tasks: Plan['tasks']) => ({
    ok: true as const,
    data: { ...proposed, tasks: [...tasks] },
  }));
  await openPlan({
    getPlan: async (day) => ({ ok: true, data: day === TOMORROW ? proposed : null }),
    savePlan,
  });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.changeText(await screen.findByTestId('title-0'), 'Decimals');
  fireEvent.changeText(screen.getByTestId('minutes-0'), '45');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  fireEvent.press(screen.getByTestId('save-plan'));
  await waitFor(() => expect(savePlan).toHaveBeenCalled());
  expect(savePlan.mock.calls[0]![1][0]).toMatchObject({
    full: { title: 'Decimals', seconds: 2700 },
  });
  await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
});

test('lock needs 3 tasks and a confirmation', async () => {
  const lockPlan = jest.fn(async () => ({
    ok: true as const,
    data: { ...threeTasks, status: 'locked' as const, lockedAt: Date.UTC(2026, 9, 14, 21, 40) },
  }));
  await openPlan({
    getPlan: async (day) => ({ ok: true, data: day === TOMORROW ? proposed : null }),
    lockPlan,
  });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  expect(await screen.findByText('A plan needs 3 to 5 tasks to lock.')).toBeTruthy();
  expect(screen.getByTestId('lock-plan')).toBeDisabled();
});

test('lock saves unsaved edits first, and a failed save locks nothing', async () => {
  const lockPlan = jest.fn(async () => ({
    ok: true as const,
    data: { ...threeTasks, status: 'locked' as const, lockedAt: 1 },
  }));
  const savePlan = jest.fn(async () => ({
    ok: false as const,
    error: { kind: 'network' as const },
  }));
  await openPlan({
    getPlan: async (day) => ({ ok: true, data: day === TOMORROW ? threeTasks : null }),
    savePlan,
    lockPlan,
  });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.changeText(await screen.findByTestId('title-0'), 'Decimals');
  fireEvent.press(screen.getByTestId('lock-plan'));
  answerAlert('Lock');
  expect(await screen.findByText('Planning needs a connection.')).toBeTruthy();
  expect(lockPlan).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('Decimals')).toBeTruthy();
});

test('a confirmed lock shows the plan as locked and read-only', async () => {
  const locked = {
    ...threeTasks,
    status: 'locked' as const,
    lockedAt: Date.UTC(2026, 9, 14, 21, 40),
  };
  await openPlan({
    getPlan: async (day) => ({ ok: true, data: day === TOMORROW ? threeTasks : null }),
    lockPlan: async () => ({ ok: true, data: locked }),
  });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.press(await screen.findByTestId('lock-plan'));
  answerAlert('Cancel');
  expect(screen.queryByText(/Locked at/)).toBeNull();
  fireEvent.press(screen.getByTestId('lock-plan'));
  answerAlert('Lock');
  expect(await screen.findByText(/^Locked at/)).toBeTruthy();
  expect(screen.queryByTestId('title-0')).toBeNull();
  expect(screen.getByText('Fractions practice')).toBeTruthy();
});

test('adding a task picks a skill from the roadmap', async () => {
  const roadmap = {
    identities: [
      { id: '01920000-0000-7000-8000-00000000c001', title: 'Engineer', why: 'Build things' },
    ],
    skills: [
      {
        id: '01920000-0000-7000-8000-00000000b001',
        identityId: '01920000-0000-7000-8000-00000000c001',
        name: 'Reading',
        rubric: 'Read daily',
        verifier: 'reading' as const,
      },
    ],
    milestones: [],
  };
  await openPlan({
    getPlan: async (day) => ({ ok: true, data: day === TOMORROW ? proposed : null }),
    getRoadmap: async () => ({ ok: true, data: roadmap }),
  });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.press(await screen.findByTestId('add-task'));
  fireEvent.press(await screen.findByText('Reading'));
  expect(await screen.findByTestId('title-2')).toBeTruthy();
  expect(screen.getByText('Give the task a title.')).toBeTruthy();
  expect(screen.getByTestId('save-plan')).toBeDisabled();
});

test('unsaved edits block switching day until discarded', async () => {
  await openPlan({
    getPlan: async (day) => ({ ok: true, data: day === TOMORROW ? proposed : null }),
  });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.changeText(await screen.findByTestId('title-0'), 'Decimals');
  expect(screen.getByTestId('plan-today')).toBeDisabled();
  fireEvent.press(screen.getByTestId('discard'));
  expect(await screen.findByDisplayValue('Fractions practice')).toBeTruthy();
  expect(screen.getByTestId('plan-today')).toBeEnabled();
});

test('server refusals show their meaning', async () => {
  await openPlan({
    proposePlan: async () => ({
      ok: false,
      error: { kind: 'rejected', status: 422, code: 'nothing_to_plan', message: 'x' },
    }),
  });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.press(await screen.findByTestId('propose'));
  expect(await screen.findByText('Add skills to your roadmap first.')).toBeTruthy();
});
```

`test/screens.test.tsx`: add `plan: PlanScreen` to `mount`. Add a test where Today's "Plan" button opens the Plan screen (`fireEvent.press(screen.getByTestId('open-plan'))` → `findByText('Plan today')`).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/plan-screen.test.tsx`
Expected: FAIL with `Cannot find module '@/screens/plan'`.

- [ ] **Step 3: Implement the hook**

`src/screens/plan/use-plan.ts`:

```ts
import { addDays, type TaskSpec } from '@futureflow/core';
import type { Skill } from '@futureflow/contracts';
import { useCallback, useEffect, useState } from 'react';
import type { ApiFailure, Plan } from '@/lib/api/client';
import { useApp } from '@/lib/app';
import { editTask, newTask, removeTask, type TaskEdit } from '@/lib/plan-draft';

export type PlanTarget = 'today' | 'tomorrow';
type Source = 'ai' | 'template' | null;

type State = Readonly<{
  day: string | null;
  loading: boolean;
  busy: boolean;
  saved: Plan | null;
  tasks: TaskSpec[];
  source: Source;
  message: string | null;
  skills: Skill[];
}>;

const MESSAGES: Readonly<Record<string, string>> = {
  nothing_to_plan: 'Add skills to your roadmap first.',
  plan_locked: 'This plan is already locked.',
  too_few_tasks: 'A plan needs 3 to 5 tasks to lock.',
  too_many_tasks: 'A plan needs 3 to 5 tasks to lock.',
  day_out_of_range: 'You can only plan today or tomorrow.',
};

export function planMessage(error: ApiFailure): string {
  switch (error.kind) {
    case 'network':
      return 'Planning needs a connection.';
    case 'invalid_response':
      return 'This app is out of date for the server. Update the app.';
    case 'server':
      return 'The server had a problem. Try again soon.';
    case 'rejected':
      return MESSAGES[error.code] ?? error.message;
  }
}

const sameTasks = (a: readonly TaskSpec[], b: readonly TaskSpec[]) =>
  JSON.stringify(a) === JSON.stringify(b);

export function usePlan() {
  const { services } = useApp();
  const [target, setTarget] = useState<PlanTarget>('today');
  const [state, setState] = useState<State>({
    day: null,
    loading: true,
    busy: false,
    saved: null,
    tasks: [],
    source: null,
    message: null,
    skills: [],
  });

  const load = useCallback(
    async (which: PlanTarget) => {
      setState((s) => ({ ...s, loading: true, message: null }));
      try {
        const snapshot = await services.store.savedToday();
        if (snapshot === null) {
          setState((s) => ({
            ...s,
            loading: false,
            day: null,
            message: 'Open Today once, online, before planning.',
          }));
          return;
        }
        const day = which === 'today' ? snapshot.today.day : addDays(snapshot.today.day, 1);
        const [plan, roadmap] = await Promise.all([
          services.api.getPlan(day),
          services.api.getRoadmap(),
        ]);
        const saved = plan.ok ? plan.data : null;
        setState((s) => ({
          ...s,
          day,
          loading: false,
          saved,
          tasks: saved?.tasks ?? [],
          source: null,
          skills: roadmap.ok ? (roadmap.data?.skills ?? []) : s.skills,
          message: plan.ok ? null : planMessage(plan.error),
        }));
      } catch {
        setState((s) => ({
          ...s,
          loading: false,
          message: "Could not read this phone's saved data.",
        }));
      }
    },
    [services],
  );

  useEffect(() => {
    void load(target);
  }, [load, target]);

  /** Runs one server call with the busy flag; returns the plan on success. */
  const run = useCallback(
    async (
      call: () => Promise<{ ok: true; data: Plan } | { ok: false; error: ApiFailure }>,
    ): Promise<Plan | null> => {
      setState((s) => ({ ...s, busy: true, message: null }));
      try {
        const result = await call();
        if (!result.ok) {
          setState((s) => ({ ...s, message: planMessage(result.error) }));
          return null;
        }
        setState((s) => ({ ...s, saved: result.data, tasks: result.data.tasks }));
        return result.data;
      } finally {
        setState((s) => ({ ...s, busy: false }));
      }
    },
    [],
  );

  const day = state.day;
  const dirty =
    state.saved === null ? state.tasks.length > 0 : !sameTasks(state.saved.tasks, state.tasks);

  return {
    ...state,
    target,
    dirty,
    setTarget: (next: PlanTarget) => {
      if (!dirty) setTarget(next);
    },
    edit: (id: string, edit: TaskEdit) =>
      setState((s) => ({ ...s, tasks: editTask(s.tasks, id, edit) })),
    remove: (id: string) => setState((s) => ({ ...s, tasks: removeTask(s.tasks, id) })),
    add: (skill: Skill) =>
      setState((s) => ({ ...s, tasks: [...s.tasks, newTask(skill, services.ids.newId())] })),
    discard: () => setState((s) => ({ ...s, tasks: s.saved?.tasks ?? [] })),
    propose: async () => {
      if (day === null) return;
      setState((s) => ({ ...s, busy: true, message: null }));
      try {
        const result = await services.api.proposePlan(day);
        if (!result.ok) setState((s) => ({ ...s, message: planMessage(result.error) }));
        else
          setState((s) => ({
            ...s,
            saved: result.data.plan,
            tasks: result.data.plan.tasks,
            source: result.data.source,
          }));
      } finally {
        setState((s) => ({ ...s, busy: false }));
      }
    },
    save: () =>
      day === null ? Promise.resolve(null) : run(() => services.api.savePlan(day, state.tasks)),
    /** Saves unsaved edits first; locks only when the save worked. */
    lock: async () => {
      if (day === null) return;
      if (dirty && (await run(() => services.api.savePlan(day, state.tasks))) === null) return;
      await run(() => services.api.lockPlan(day));
    },
  };
}
```

- [ ] **Step 4: Implement the editor and screen**

`src/screens/plan/task-editor.tsx`: a card per task. When the plan is a draft, it shows labelled `TextInput`s:

- Title (`title-<i>`), Done when (criteria), When, Minutes (`minutes-<i>`, numeric keyboard; `onChangeText` parses an integer and ignores an empty or non-number value), 2-minute version (`small-<i>`)
- the task's problems from `taskProblems([task])`, each as a `Text`
- a secondary "Remove" button (`remove-<i>`)

When locked it shows read-only text: the title, "Done when …", "When …" and "Earns N min".

`src/screens/plan/index.tsx` (`PlanScreen`):

- **Header:** a segmented control of two `Button`s (`plan-today` / `plan-tomorrow`), disabled while `dirty`. The selected one uses the primary variant.
- **Title:** "Plan today" / "Plan tomorrow" and the day label (`formatDayLabel`).
- **Loading:** `ActivityIndicator`.
- **Message:** a `Banner tone="warning"` when there is one.
- **No plan** (`saved === null && tasks.length === 0`): "No plan yet" plus the text "Your coach suggests 3 to 5 tasks from your roadmap. You can change every one." and a `propose` button.
- **Draft:**
  - a source caption when set: "Suggested by your coach" for `ai`, "From your roadmap" for `template`
  - the `TaskEditor` list
  - the `add-task` button, which opens an inline list of roadmap skills as buttons, each adding `newTask`
  - `lockProblems` plan-level messages
  - "Unsaved changes" plus `discard` when `dirty`
  - `save-plan`, disabled unless `dirty` and `taskProblems` is empty
  - `lock-plan`, disabled while `lockProblems` is non-empty or busy; it opens `Alert.alert('Lock this plan?', "A locked plan can't change. Tasks pay only once the plan is locked.", [{ text: 'Cancel', style: 'cancel' }, { text: 'Lock', onPress: () => void lock() }])`
- **Locked:** "Locked at HH:MM" (`formatTime(lockedAt, localOffsetMinutes(lockedAt))`) and read-only cards.

`src/app/plan.tsx`: `export default PlanScreen` (same pattern as the other routes).
`root-stack.tsx`: add `<Stack.Screen name="plan" options={{ title: 'Plan' }} />` and `<Stack.Screen name="away" options={{ title: 'Away' }} />` inside the paired guard.
`today/index.tsx`: add a row of secondary buttons under the hero: "Plan" (`open-plan`, `router.push('/plan')`). The "Bad day" and "Away" buttons come in Tasks 6–7.

- [ ] **Step 5: Run them to verify they pass, then the mobile suite**

Run: `cd apps/mobile && bun x jest`
Expected: all pass, and coverage ≥ 80% (`bun x jest --coverage`).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat: add the Plan screen: propose, edit, add, save and lock today's or tomorrow's plan"
```

---

### Task 6: Bad day and day-type display on Today

**Files:**

- Modify: `src/screens/today/index.tsx`, `src/screens/today/task-row.tsx`
- Test: `test/screens.test.tsx`

**Interfaces:**

- Consumes: `api.declareBadDay`.
- Produces: testIDs `bad-day`, and the task-row states "2-minute version" and "Excused".

Behavior:

- On a normal day, a secondary "Bad day" button (`bad-day`) opens `Alert.alert('Make today a bad day?', 'Your tasks shrink to their 2-minute versions. You get one bad day a week.', [Cancel, { text: 'Bad day', onPress }])`.
- On confirm it calls `declareBadDay(today.day)`. Success refreshes Today. A failure shows a `Banner`:
  - `bad_day_limit_reached` → "This week's bad day is already used."
  - `already_declared` → "Today already has a day type."
  - network → "Declaring a day needs a connection."
- `dayRecord.kind === 'bad'`: the caption reads "Bad day: 2-minute versions count", the button is hidden, and each `TaskRow` shows `task.twoMinute.title` and "Earns {twoMinute}" with the label "2-minute version".
- `dayRecord.kind === 'away'`: the caption reads "Away: {place}". Tasks not in `keptTaskIds` show "Excused" instead of their verdict.

- [ ] **Step 1: Write the failing tests** (add to `test/screens.test.tsx`; mock `Alert.alert` in a `beforeEach` as in Task 5 and copy the `answerAlert` helper)

```tsx
test('a confirmed bad day shrinks the tasks to their 2-minute versions', async () => {
  let record: Today['dayRecord'] = null;
  const declareBadDay = jest.fn(async (day: string) => {
    record = { day, kind: 'bad' };
    return { ok: true as const, data: record };
  });
  const services = await testServices(
    { today: async () => ({ ok: true, data: sampleToday({ dayRecord: record }) }), declareBadDay },
    PAIRED,
  );
  mount(ready(services));
  fireEvent.press(await screen.findByTestId('bad-day'));
  answerAlert('Bad day');
  expect(await screen.findByText('Bad day: 2-minute versions count')).toBeTruthy();
  expect(screen.getAllByText('One problem')).toHaveLength(2);
  expect(declareBadDay).toHaveBeenCalledWith('2026-10-14');
});

test('cancelling the bad day sends nothing; a used week says so', async () => {
  const declareBadDay = jest.fn(async () => ({
    ok: false as const,
    error: { kind: 'rejected' as const, status: 409, code: 'bad_day_limit_reached', message: 'x' },
  }));
  const services = await testServices({ declareBadDay }, PAIRED);
  mount(ready(services));
  fireEvent.press(await screen.findByTestId('bad-day'));
  answerAlert('Cancel');
  expect(declareBadDay).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('bad-day'));
  answerAlert('Bad day');
  expect(await screen.findByText("This week's bad day is already used.")).toBeTruthy();
});

test('an away day excuses the tasks not kept', async () => {
  const today = sampleToday();
  const kept = today.plan!.tasks[0]!.id;
  const services = await testServices(
    {
      today: async () => ({
        ok: true,
        data: {
          ...today,
          dayRecord: {
            day: today.day,
            kind: 'away',
            away: { place: 'Montreal', keptTaskIds: [kept], verified: 'pending' },
          },
        },
      }),
    },
    PAIRED,
  );
  mount(ready(services));
  expect(await screen.findByText('Away: Montreal')).toBeTruthy();
  expect(screen.getByText('Excused')).toBeTruthy();
  expect(screen.queryByTestId('bad-day')).toBeNull();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/screens.test.tsx`
Expected: the three new tests FAIL (no `bad-day` button).

- [ ] **Step 3: Implement** as described above. `TaskRow` gets props `{ task, verdict, mode: 'full' | 'small' | 'excused' }`. Today computes the mode from `dayRecord`. Show `bad-day` only when `dayRecord === null`.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/mobile && bun x jest`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat: declare a bad day from Today and show 2-minute and excused tasks"
```

---

### Task 7: Away windows and the on-device away check

**Files:**

- Create: `src/lib/away.ts`, `src/lib/location.ts`, `src/screens/away.tsx`, `src/app/away.tsx`
- Modify: `src/lib/store/types.ts` + `sqlite-store.ts` (away windows, check times), `src/lib/app.tsx` (`AppServices.locator`), `src/lib/services.ts`, `src/screens/today/use-today.ts` (check before sync), `src/screens/today/index.tsx` (Away button), `app.config.ts`, `test/support/fakes.ts` (`locator` fake)
- Test: `test/away.test.ts`, `test/away-screen.test.tsx`, `test/store.test.ts`

**Interfaces:**

- Produces:
  ```ts
  // location.ts
  type Coords = Readonly<{ lat: number; lon: number }>
  interface Locator { coarse(): Promise<Coords | null> }       // null: no permission or no fix
  expoLocator: Locator
  // away.ts
  AWAY_MIN_KM = 25; HOME_KEY = 'home_location'; CHECK_EVERY_MS = 3_600_000
  distanceKm(a: Coords, b: Coords): number                      // haversine, Earth radius 6371 km
  awayVerdict(home: Coords | null, here: Coords | null): { verified: 'yes' | 'no' | 'unknown'; distanceKm?: number }
  readHome(secrets): Promise<Coords | null>; saveHome(secrets, coords): Promise<void>
  checkAway(deps: { api: Pick<Api, 'sendAwayVerdict'>; store: LocalStore; secrets: SecretStore; locator: Locator; now: () => number }, today: Today): Promise<'sent' | 'skipped'>
  // store additions
  saveAwayWindow(w: { id: string; from: string; to: string }): Promise<void>
  awayWindows(): Promise<{ id: string; from: string; to: string }[]>
  lastAwayCheck(day: string): Promise<number | null>; saveAwayCheck(day: string, at: number): Promise<void>
  ```
- Away screen testIDs: `place`, `start-<i>` (day chips, 0 = today, 0..13), `days-minus`, `days-plus`, `days-count`, `keep-<i>`, `declare-away`, `set-home`.

**Rules:**

- `awayVerdict`:
  - `unknown` (no distance) when there's no home or no fix
  - otherwise `distance = min(20000, round(d / 10) * 10)`
  - `verified = d >= AWAY_MIN_KM ? 'yes' : 'no'`
- `checkAway`:
  - Runs only when `today.dayRecord?.kind === 'away'`, a saved window covers `today.day`, and the last check for that day is at least an hour old.
  - Reads the home and `locator.coarse()`, then sends `{ day, verified, distanceKm? }` and records the check time on success.
  - Errors are swallowed (logged by name) so Today never breaks.
- `clearServerCopy` keeps away windows and check times (they live in `kv` under `away_windows` and `away_check:<day>`; change `clearServerCopy` to delete only the `ledger_cursor`, `ledger_complete`, `today` and `last_sync` keys).

- [ ] **Step 1: Install expo-location and configure coarse-only permission**

```bash
cd apps/mobile && bun x expo install expo-location
```

`app.config.ts`:

- Add the plugin `['expo-location', { locationWhenInUsePermission: 'Future Flow checks how far you are from home on away days. Your location never leaves the phone.' }]`.
- Add `android.blockedPermissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_BACKGROUND_LOCATION']`.

- [ ] **Step 2: Write the failing tests**

`test/away.test.ts`:

```ts
import { awayVerdict, checkAway, distanceKm, saveHome } from '@/lib/away';
import type { Locator } from '@/lib/location';
import { NOW, sampleToday, testServices } from './support/fakes';

const TORONTO = { lat: 43.6532, lon: -79.3832 };
const MONTREAL = { lat: 45.5019, lon: -73.5674 };
const NEAR = { lat: 43.66, lon: -79.39 }; // ~1 km away

test('distanceKm is the great-circle distance', () => {
  expect(Math.round(distanceKm(TORONTO, MONTREAL))).toBe(504);
  expect(distanceKm(TORONTO, TORONTO)).toBe(0);
});

test('far from home is yes, home sends no, and missing data is unknown', () => {
  expect(awayVerdict(TORONTO, MONTREAL)).toEqual({ verified: 'yes', distanceKm: 500 });
  expect(awayVerdict(TORONTO, NEAR)).toEqual({ verified: 'no', distanceKm: 0 });
  expect(awayVerdict(null, MONTREAL)).toEqual({ verified: 'unknown' });
  expect(awayVerdict(TORONTO, null)).toEqual({ verified: 'unknown' });
});

const WINDOW = { id: '01920000-0000-7000-8000-0000000000e1', from: '2026-10-14', to: '2026-10-15' };
const awayToday = sampleToday({
  dayRecord: {
    day: '2026-10-14',
    kind: 'away',
    away: { place: 'Montreal', keptTaskIds: [], verified: 'pending' },
  },
});

async function setup(here: Awaited<ReturnType<Locator['coarse']>>, now = NOW) {
  const services = await testServices({}, {});
  const sent: unknown[] = [];
  const deps = {
    api: {
      sendAwayVerdict: async (id: string, body: unknown) => {
        sent.push({ id, body });
        return { ok: true as const, data: { day: '2026-10-14', kind: 'away' as const } };
      },
    },
    store: services.store,
    secrets: services.secrets,
    locator: { coarse: async () => here },
    now: () => now,
  };
  return { deps, sent, services };
}

test('the request carries no coordinates, only the rounded distance', async () => {
  const { deps, sent } = await setup(MONTREAL);
  await saveHome(deps.secrets, TORONTO);
  await deps.store.saveAwayWindow(WINDOW);
  expect(await checkAway(deps, awayToday)).toBe('sent');
  expect(sent).toEqual([
    { id: WINDOW.id, body: { day: '2026-10-14', verified: 'yes', distanceKm: 500 } },
  ]);
  expect(JSON.stringify(sent)).not.toMatch(/45\.5|73\.5|43\.6|79\.3/);
});

test('refused permission sends unknown, once per hour', async () => {
  const { deps, sent } = await setup(null);
  await deps.store.saveAwayWindow(WINDOW);
  await checkAway(deps, awayToday);
  await checkAway(deps, awayToday);
  expect(sent).toEqual([{ id: WINDOW.id, body: { day: '2026-10-14', verified: 'unknown' } }]);
  const later = { ...deps, now: () => NOW + 3_600_000 };
  await checkAway(later, awayToday);
  expect(sent).toHaveLength(2);
});

test('nothing is checked on a normal day or without a saved window', async () => {
  const { deps, sent } = await setup(MONTREAL);
  expect(await checkAway(deps, sampleToday())).toBe('skipped');
  expect(await checkAway(deps, awayToday)).toBe('skipped');
  expect(sent).toEqual([]);
});

test('a failed send is retried next time', async () => {
  const { deps } = await setup(MONTREAL);
  await deps.store.saveAwayWindow(WINDOW);
  const failing = {
    ...deps,
    api: {
      sendAwayVerdict: async () => ({ ok: false as const, error: { kind: 'network' as const } }),
    },
  };
  expect(await checkAway(failing, awayToday)).toBe('skipped');
  expect(await deps.store.lastAwayCheck('2026-10-14')).toBeNull();
});
```

`test/store.test.ts`, add:

```ts
test('away windows and check times survive clearing the server copy', async () => {
  const { store } = await open();
  const w = { id: '01920000-0000-7000-8000-0000000000e1', from: '2026-10-14', to: '2026-10-15' };
  await store.saveAwayWindow(w);
  await store.saveAwayWindow(w);
  await store.saveAwayCheck('2026-10-14', NOW);
  await store.clearServerCopy();
  expect([await store.awayWindows(), await store.lastAwayCheck('2026-10-14')]).toEqual([[w], NOW]);
});
```

`test/away-screen.test.tsx`: mount `away: AwayScreen` (with the Task 5 harness, `initialUrl: '/away'`). Tests:

1. **"declares a window with the kept tasks and saves it on the phone":**
   - `getPlan` for `2026-10-15` returns `threeTasks`.
   - Press `start-1` (tomorrow), then `days-plus` once (2 days), fill `place` = 'Montreal', press `keep-0`, then `declare-away`.
   - Expect `declareAway` called with `{ id: <uuid>, from: '2026-10-15', to: '2026-10-16', place: 'Montreal', keptTaskIds: [threeTasks.tasks[0].id] }`.
   - Expect `store.awayWindows()` to contain that id.
   - Expect the screen to navigate back (Today visible).
2. **"a retried declaration reuses the same id":** the first `declareAway` returns network and the second succeeds. Both calls carry the same `id`.
3. **"set-home stores the location only on the phone":**
   - The locator returns `TORONTO`. Press `set-home`.
   - Expect `readHome(secrets)` toEqual `TORONTO`, and the text "Home is set".
   - Expect no API call made (every api fake is a `jest.fn` that is never called).
4. **"declaring without a home warns that away days will count as unverified":** the "Set your home first" text is visible, and `declare-away` stays enabled.

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/away.test.ts test/away-screen.test.tsx test/store.test.ts`
Expected: FAIL with `Cannot find module '@/lib/away'` and `saveAwayWindow` missing.

- [ ] **Step 4: Implement**

`src/lib/location.ts`:

```ts
import * as Location from 'expo-location';

export type Coords = Readonly<{ lat: number; lon: number }>;

/** Coarse location only; null when permission is refused or no fix arrives in time. */
export interface Locator {
  coarse(): Promise<Coords | null>;
}

const FIX_TIMEOUT_MS = 15_000;

export const expoLocator: Locator = {
  async coarse() {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS));
    const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }).catch(
      () => null,
    );
    const position =
      (await Promise.race([fix, timeout])) ?? (await Location.getLastKnownPositionAsync());
    return position === null
      ? null
      : { lat: position.coords.latitude, lon: position.coords.longitude };
  },
};
```

`src/lib/away.ts`:

```ts
import type { Api, Today } from './api/client';
import type { Coords, Locator } from './location';
import type { SecretStore } from './secrets';
import type { LocalStore } from './store/types';

/** Farther than this from home counts as away; nearer means the owner is home (spec §6.4). */
export const AWAY_MIN_KM = 25;
export const HOME_KEY = 'home_location';
export const CHECK_EVERY_MS = 3_600_000;
const EARTH_KM = 6371;
const MAX_KM = 20_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function distanceKm(a: Coords, b: Coords): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type AwayVerdict = { verified: 'yes' | 'no' | 'unknown'; distanceKm?: number };

/** The only thing that leaves the phone: yes/no/unknown and a distance rounded to 10 km. */
export function awayVerdict(home: Coords | null, here: Coords | null): AwayVerdict {
  if (home === null || here === null) return { verified: 'unknown' };
  const d = distanceKm(home, here);
  return {
    verified: d >= AWAY_MIN_KM ? 'yes' : 'no',
    distanceKm: Math.min(MAX_KM, Math.round(d / 10) * 10),
  };
}

export async function readHome(secrets: SecretStore): Promise<Coords | null> {
  const raw = await secrets.get(HOME_KEY);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<Coords>;
    return typeof value.lat === 'number' && typeof value.lon === 'number'
      ? { lat: value.lat, lon: value.lon }
      : null;
  } catch {
    return null;
  }
}

export const saveHome = (secrets: SecretStore, coords: Coords) =>
  secrets.set(HOME_KEY, JSON.stringify({ lat: coords.lat, lon: coords.lon }));

export type AwayDeps = Readonly<{
  api: Pick<Api, 'sendAwayVerdict'>;
  store: LocalStore;
  secrets: SecretStore;
  locator: Locator;
  now: () => number;
}>;

/** At most hourly on an away day: measures on the device and sends only the verdict. */
export async function checkAway(deps: AwayDeps, today: Today): Promise<'sent' | 'skipped'> {
  if (today.dayRecord?.kind !== 'away') return 'skipped';
  const day = today.day;
  const window = (await deps.store.awayWindows()).find((w) => w.from <= day && day <= w.to);
  if (window === undefined) return 'skipped';
  const last = await deps.store.lastAwayCheck(day);
  if (last !== null && deps.now() - last < CHECK_EVERY_MS) return 'skipped';
  const verdict = awayVerdict(await readHome(deps.secrets), await deps.locator.coarse());
  const result = await deps.api.sendAwayVerdict(window.id, { day, ...verdict });
  if (!result.ok) return 'skipped';
  await deps.store.saveAwayCheck(day, deps.now());
  return 'sent';
}
```

Store (`types.ts` and `sqlite-store.ts`):

- `saveAwayWindow` adds to a JSON list in kv `away_windows` (no duplicate id).
- `awayWindows` reads it, validated with `z.array(z.object({ id: z.uuid(), from: DayKeySchema, to: DayKeySchema }))` (`[]` on bad data).
- `saveAwayCheck` / `lastAwayCheck` use kv `away_check:<day>`.
- `clearServerCopy` → `DELETE FROM kv WHERE key IN ('ledger_cursor','ledger_complete','today','last_sync')`.
- All writes go through `write`.

`AppServices` gets `locator: Locator`. `services.ts` passes `expoLocator`. `fakes.ts` `testServices` takes `options?: { locator?: Locator }` and defaults to `{ coarse: async () => null }`.

`use-today.ts` `refresh`: before `syncer.sync()`, `const saved = await services.store.savedToday(); if (saved) await checkAway({ ...services }, saved.today).catch(logByName)`.

`src/screens/away.tsx` (`AwayScreen`):

- **Home:** a section showing "Home is set" or "Set your home first. Do this at home; the place stays on this phone." with `set-home` (calls `locator.coarse()` → `saveHome`; shows "Could not get your location." on null).
- **Where:** a `place` input (1–80 characters).
- **Start:** 14 day chips `start-<i>` from the saved `today.day`, labelled "Today", "Tomorrow", then `formatDayLabel`.
- **How many days:** `days-minus` / `days-count` / `days-plus` (1–30).
- **Keep:** checkboxes `keep-<i>` for tasks of the start day's plan (`getPlan(from)`, up to 10), with the text "Tasks you don't keep are excused."
- **Submit:** `declare-away`, disabled until the place is valid. It sends `{ id, from, to: addDays(from, n - 1), place, keptTaskIds }` with `id` from `useState(() => ids.newId())`, so retries reuse it. On success it calls `store.saveAwayWindow` then `router.back()`. Failures show a message: network → "Declaring away needs a connection.", `already_declared` → "Some of those days already have a day type.", `day_out_of_range` → "Pick a start within the next 60 days.".

`today/index.tsx`: add an "Away" button (`open-away`) next to "Plan".

- [ ] **Step 5: Run them to verify they pass, then the mobile suite**

Run: `cd apps/mobile && bun x jest --coverage`
Expected: all pass, coverage ≥ 80%.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile bun.lock
git commit -m "feat: declare away windows and check them on the phone without sending coordinates"
```

---

### Task 8: Owner decision on pending tasks

**Files:**

- Modify: `src/screens/today/task-row.tsx`, `src/screens/today/index.tsx`
- Test: `test/screens.test.tsx`

**Interfaces:**

- Consumes: `api.decideVerdict`.
- Produces: testIDs `did-it-<taskId>` and `not-done-<taskId>`.

Behavior:

- **Shown when** a task's verdict is `pending` (judge-checked GitHub and reading tasks while `JUDGE_AUTO_DECIDE` is off), the plan is locked, and the task isn't excused. The row then shows:
  - "Waiting for your answer"
  - when there's a suggestion: "The checker thinks: done" or "The checker thinks: not done"
  - two buttons
- **"I did it"** confirms with `Alert.alert('Mark it done?', 'Only confirm what you really did. This pays the task\'s time.', [Cancel, { text: 'Yes, I did it', onPress }])`.
- **"Not done"** confirms with `Alert.alert('Mark it not done?', 'The task pays nothing today.', [Cancel, { text: 'Not done', onPress }])`.
- **On confirm:** `decideVerdict(task.id, { day, outcome })`, then refresh. A failure shows a `Banner`: `verdict_not_pending` → "This task was already decided." (and refresh); network → "Deciding needs a connection.".

- [ ] **Step 1: Write the failing tests**

```tsx
const pendingToday = () => {
  const t = sampleToday();
  const id = t.plan!.tasks[1]!.id;
  return {
    t,
    id,
    data: {
      ...t,
      verdicts: [
        ...t.verdicts,
        {
          day: t.day,
          taskId: id,
          outcome: 'pending' as const,
          confidence: 0.6,
          by: 'judge' as const,
          evidenceIds: [],
          suggestion: 'pass' as const,
        },
      ],
    },
  };
};

test('a pending task can be confirmed done after a warning', async () => {
  const { id, data } = pendingToday();
  const decideVerdict = jest.fn(async () => ({
    ok: true as const,
    data: {
      day: data.day,
      taskId: id,
      outcome: 'pass' as const,
      confidence: 1,
      by: 'owner' as const,
      evidenceIds: [],
    },
  }));
  const services = await testServices(
    { today: async () => ({ ok: true, data }), decideVerdict },
    PAIRED,
  );
  mount(ready(services));
  expect(await screen.findByText('The checker thinks: done')).toBeTruthy();
  fireEvent.press(screen.getByTestId(`did-it-${id}`));
  answerAlert('Yes, I did it');
  await waitFor(() =>
    expect(decideVerdict).toHaveBeenCalledWith(id, { day: data.day, outcome: 'pass' }),
  );
});

test('cancel sends nothing', async () => {
  const { id, data } = pendingToday();
  const decideVerdict = jest.fn();
  const services = await testServices(
    { today: async () => ({ ok: true, data }), decideVerdict },
    PAIRED,
  );
  mount(ready(services));
  fireEvent.press(await screen.findByTestId(`not-done-${id}`));
  answerAlert('Cancel');
  expect(decideVerdict).not.toHaveBeenCalled();
});

test('an already decided task says so', async () => {
  const { id, data } = pendingToday();
  const services = await testServices(
    {
      today: async () => ({ ok: true, data }),
      decideVerdict: async () => ({
        ok: false,
        error: { kind: 'rejected', status: 409, code: 'verdict_not_pending', message: 'x' },
      }),
    },
    PAIRED,
  );
  mount(ready(services));
  fireEvent.press(await screen.findByTestId(`did-it-${id}`));
  answerAlert('Yes, I did it');
  expect(await screen.findByText('This task was already decided.')).toBeTruthy();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/screens.test.tsx`
Expected: the three new tests FAIL.

- [ ] **Step 3: Implement** as described. `TaskRow` receives `onDecide?: (outcome: 'pass' | 'fail') => void`. Today owns the Alert and the API call.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/mobile && bun x jest --coverage`
Expected: all pass, coverage ≥ 80%.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat: let the owner decide tasks the judge left pending, with a clear warning"
```

---

### Task 9: Emulator flow for planning and the bad day

**Files:**

- Create: `apps/mobile/e2e/seed-roadmap.sql`
- Modify: `apps/mobile/e2e/flows/pair-and-today.yaml`, `.github/workflows/android-e2e.yml`

- [ ] **Step 1: Seed a roadmap into the local D1**

`apps/mobile/e2e/seed-roadmap.sql` (column lists as in `apps/api/src/adapters/d1/roadmap.ts`; `updated_at` = 0):

```sql
-- Test-only roadmap for the emulator run: one identity, three skills, two milestones.
INSERT INTO identities (id, title, why, deadline, position, updated_at) VALUES
  ('01920000-0000-7000-8000-00000000c001', 'Software engineer', 'Build things that matter', NULL, 0, 0);
INSERT INTO skills (id, identity_id, name, rubric, verifier, rest_weekday, position, updated_at) VALUES
  ('01920000-0000-7000-8000-00000000b001', '01920000-0000-7000-8000-00000000c001', 'Coding', 'Ship small commits', 'github', NULL, 0, 0),
  ('01920000-0000-7000-8000-00000000b002', '01920000-0000-7000-8000-00000000c001', 'Reading', 'Read and summarize', 'reading', NULL, 1, 0),
  ('01920000-0000-7000-8000-00000000b003', '01920000-0000-7000-8000-00000000c001', 'Math', 'Practice problems', 'math', NULL, 2, 0);
INSERT INTO milestones (id, skill_id, title, target_date, done, position, updated_at) VALUES
  ('01920000-0000-7000-8000-00000000d001', '01920000-0000-7000-8000-00000000b001', 'Finish the sync engine', NULL, 0, 0, 0),
  ('01920000-0000-7000-8000-00000000d002', '01920000-0000-7000-8000-00000000b002', 'Read chapter 1', NULL, 0, 1, 0);
```

In the workflow's "Start the Worker locally" step, after `migrate:local`, add: `bun x wrangler d1 execute futureflow --local --file ../mobile/e2e/seed-roadmap.sql`.

- [ ] **Step 2: Extend the Maestro flow** (append after the Diagnostics screenshot)

```yaml
- back
- tapOn:
    id: 'open-plan'
- tapOn:
    id: 'plan-tomorrow'
- tapOn:
    id: 'propose'
- extendedWaitUntil:
    visible: 'From your roadmap'
    timeout: 20000
- takeScreenshot: 04-plan-draft
- tapOn:
    id: 'lock-plan'
- tapOn: 'Lock'
- extendedWaitUntil:
    visible: 'Locked at.*'
    timeout: 20000
- takeScreenshot: 05-plan-locked
- back
- tapOn:
    id: 'bad-day'
- tapOn: 'Bad day'
- extendedWaitUntil:
    visible: 'Bad day: 2-minute versions count'
    timeout: 20000
- takeScreenshot: 06-bad-day
```

- [ ] **Step 3: Check, commit and run in the cloud**

Run: `bun x prettier --check .github apps/mobile/e2e && bash -n apps/mobile/e2e/run.sh`
Expected: clean.

```bash
git add apps/mobile/e2e .github/workflows/android-e2e.yml
git commit -m "ci: drive planning, locking and a bad day on the emulator"
git push -u origin feat/p4b-plans-day-types
gh pr create --draft --base main --title "feat: P4b plans, day types and owner checks" --body "Draft while CI and the emulator run are checked."
```

Watch both workflows. Download `android-e2e` and Read screenshots 01–06.
Expected: green. The screenshots show the draft plan from the roadmap, the locked plan, and Today on a bad day with 2-minute versions.

---

### Task 10: ADR 0012, README and memory

**Files:**

- Create: `docs/adr/0012-planning-and-day-types-on-the-phone.md`
- Modify: `README.md`

- [ ] **Step 1: ADR 0012**
- **Context:** spec §6.2–6.4 and ADR 0011.
- **Decisions:**
  - Planning is online-only: the server owns plans and locks, and the phone keeps edits local until Save.
  - Lock saves first.
  - Plan rules (3–5 tasks, 5–120 min) are checked on the phone before the server sees the draft.
  - Day switching is blocked while there are unsaved edits.
  - Bad days and away windows use the existing routes; away ids are made on the phone, so retries are safe.
  - **Away check:** coarse location only (fine and background are blocked), with the home location kept in SecureStore. `AWAY_MIN_KM = 25`: coarse fixes are about 2–3 km off and a "trip" is farther than a commute; this can change when the owner asks. It sends `yes`/`no`/`unknown` plus the distance rounded to 10 km, at most hourly, before each sync.
  - **Pending judge verdicts** are decided by the owner with a warning, because `JUDGE_AUTO_DECIDE` stays off until the judge eval (ADR 0008). Nothing is decided silently.
  - Navigation stays a Stack until P4c/P4d add Math and Coach, then moves to tabs.
- **Consequences:**
  - A phone that can't get a fix sends `unknown`, which counts toward the 2 unverified away days a month.
  - The away check runs only while the app is open; there is no background location by design.

- [ ] **Step 2: README.** Add to the Phone app section: "Plan today or tomorrow (propose, edit, lock), declare a bad or away day, and confirm tasks the checker left pending. Away days are checked on the phone; the location never leaves it."

- [ ] **Step 3: Full check and commit**

Run: `bun x prettier --write docs README.md && bun run format:check && bun run lint && bun run typecheck && bun run coverage`
Expected: green.

```bash
git add docs/adr/0012-planning-and-day-types-on-the-phone.md README.md
git commit -m "docs: record planning, day types and the on-device away check (ADR 0012)"
```
