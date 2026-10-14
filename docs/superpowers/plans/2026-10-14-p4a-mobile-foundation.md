# Future Flow P4a: mobile foundation (pairing, local store, sync, Today) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Android app that pairs with the Worker, keeps an offline copy of the ledger and today's snapshot in SQLite, syncs through an outbox, and shows a Today screen. GitHub Actions builds it and drives it on an emulator against a real local Worker, saving screenshots. EAS builds the APK for the owner's phone.

**Architecture:** Hexagonal, like the API. Screens use React hooks over three ports: `Api` (typed fetch client validated by `@futureflow/contracts`), `LocalStore` (SQLite: outbox, dead letters, confirmed ledger, key-value) and `SecretStore` (expo-secure-store). A single-flight sync engine pushes the outbox, refreshes `/v1/today`, then pulls the ledger. The local balance is `core.balance(mergeEvents(confirmed, pending))`, so it works offline. Pure logic is tested with Jest. The SQL is tested for real through a `node:sqlite` shim of the expo-sqlite async API. Screens are tested with React Native Testing Library and Expo Router's `renderRouter`. The whole app is tested on an emulator in CI with Maestro.

**Tech Stack:** Expo SDK 57 (expo 57.0.28, React Native 0.86.3, React 19.2.3), expo-router ~57.0.26, expo-sqlite ~57.0.4, expo-secure-store ~57.0.4, expo-crypto ~57.0.4, uuid ^14 (v7), zod ^4.6.5, Jest 29.7 + jest-expo ~57.0.6, @testing-library/react-native ~13.3, Maestro, reactivecircus/android-emulator-runner, EAS Build.

**Spec:** `docs/superpowers/specs/2026-10-08-futureflow-v1-design.md` — §4.3 (phone enforces, offline-first), §11 (API), §12 (phone storage: outbox, plan cache, settings), §13.1 ("Sync duplicate → ignored", "Phone balance unknown → base allowance"), §13.2/13.3 (security, privacy), §15 P4, §16 ADR 5 and 11.

## Global Constraints

- Bun only: `bun install`, `bun run`, `bun x <tool>`. Never `npx`, `bunx` or `pnpm`. Skills that print `npx expo install X` mean `bun x expo install X`.
- Commits and PRs carry no AI attribution (no Co-Authored-By, no generated-with footer).
- No secrets in the repo. `EXPO_PUBLIC_*` values are public by design, and only the API URL goes there. The e2e setup code is a throwaway test value, never a real one.
- The device token lives only in SecureStore. It is never written to SQLite, logged or shown.
- Logs contain no personal data: no plan titles, setup codes, tokens or device names. Log event names and error class names only.
- App code must not import the `@futureflow/math-engine` root, which pulls in the CAS. The lint rule enforces this. The CAS-on-phone decision belongs to P4c.
- This dev machine has 1.8 GB of RAM. A local `expo export` uses `NODE_OPTIONS=--max-old-space-size=640` and `--max-workers 1`, never more. Gradle and emulator work runs only in GitHub Actions.
- Expo libraries are added with `bun x expo install` so their versions match SDK 57.
- `bunfig.toml` keeps `linker = "hoisted"`. The root keeps `@babel/core` ^7 (Babel 8 breaks Expo).
- Tests live in `apps/mobile/test/**` (repo convention), not colocated.
- Every screen designs its loading, error, empty and content states. A refresh error keeps the saved content visible.

## Review Focus

1. **Process killed between "server accepted" and "outbox settled".** The next sync re-sends the same ids, the server answers `ignored`, and the phone settles them with no duplicate time. Pinned by the Task 6 test "settles ignored ids as sent".
2. **Process killed after the token is saved but before the pairing answer arrives.** A retry with the same code reuses the saved token and the server returns the same device id. Pinned by the Task 5 test "a retry after a lost answer reuses the saved token".
3. **First launch after pairing while offline.** Today shows an error with Retry, not an endless spinner, and Retry works once the network returns. Pinned by the Task 7 test "first load offline shows Retry, and Retry loads".
4. **Negative balance (debt) and a zero balance.** Shown as "−1 min" (debt rounded up, never hidden) and "0 min". Time left is rounded down, never overstated. Pinned by the Task 7 `formatDuration` tests.
5. **The server forgets the phone (401).** Sync stops without losing the outbox, and Today offers "Pair again", which wipes local data and returns to pairing. Pinned by the Task 6 "401 keeps the outbox" and Task 7 "Pair again" tests.

---

## File structure

```
apps/mobile/
├── app.config.ts                 # replaces app.json: name, package id, plugins, e2e cleartext switch
├── eas.json                      # EAS preview profile (APK)
├── .env.example                  # EXPO_PUBLIC_API_URL for local dev
├── e2e/
│   ├── run.sh                    # installs the APK and runs Maestro (CI only)
│   └── flows/pair-and-today.yaml
├── src/
│   ├── app/                      # routes only
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # → screens/today
│   │   ├── pair.tsx              # → screens/pair
│   │   └── diagnostics.tsx       # → screens/diagnostics
│   ├── components/
│   │   ├── banner.tsx
│   │   └── button.tsx
│   ├── lib/
│   │   ├── api/client.ts         # typed client, ApiResult/ApiFailure
│   │   ├── app.tsx               # AppProvider, useApp, StartupError screen
│   │   ├── config.ts             # parseApiUrl, StartupError
│   │   ├── format.ts             # formatDuration, formatTime, formatDayLabel
│   │   ├── ids.ts                # makeIds (UUIDv7, device token)
│   │   ├── ledger.ts             # projectBalance
│   │   ├── pairing.ts            # pairDevice, readSession, forgetPairing
│   │   ├── secrets.ts            # SecretStore port + SecureStore adapter
│   │   ├── services.ts           # production wiring (native; excluded from coverage)
│   │   ├── store/
│   │   │   ├── migrations.ts
│   │   │   ├── sql.ts            # SqlDb port (subset of expo-sqlite)
│   │   │   ├── sqlite-store.ts
│   │   │   └── types.ts          # LocalStore port, SavedToday, SyncReport
│   │   └── sync.ts               # syncOnce, createSyncer
│   ├── screens/
│   │   ├── diagnostics.tsx
│   │   ├── pair.tsx
│   │   ├── root-stack.tsx        # Stack + Stack.Protected gating
│   │   └── today/
│   │       ├── index.tsx
│   │       ├── task-row.tsx
│   │       └── use-today.ts
│   └── theme.ts
└── test/
    ├── support/{node-sql.ts,fakes.ts}
    └── *.test.ts(x)
```

---

### Task 1: Scaffold, tooling and the test harness

**Files:**

- Keep: `bunfig.toml` (hoisted linker), root `package.json` devDependency `"@babel/core": "^7.28.0"`
- Delete: `apps/mobile/app.json`, `apps/mobile/test/spike.test.tsx`
- Create: `apps/mobile/app.config.ts`, `apps/mobile/.env.example`, `apps/mobile/test/smoke.test.tsx`
- Modify: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`, `apps/mobile/src/app/index.tsx`, `eslint.config.js`, `.prettierignore`, `.gitignore`

**Interfaces:**

- Produces: the `@/*` → `src/*` import alias (TypeScript and Jest), `bun run test`/`coverage`/`typecheck` inside apps/mobile, and the lint rule against the math-engine root.

- [ ] **Step 1: Pin the test library and add runtime dependencies**

```bash
cd apps/mobile
bun add -d @testing-library/react-native@~13.3.0 @types/node@^24
bun add uuid@^14.0.2 zod@^4.6.5
bun x expo install expo-build-properties
```

Expected: `package.json` lists `@testing-library/react-native` `~13.3.x` (Expo Router's `renderRouter` is built against 13, and 14's async render breaks it), `uuid`, `zod`, `expo-build-properties`.

- [ ] **Step 2: Write the smoke test**

`apps/mobile/test/smoke.test.tsx`:

```tsx
import { dayKeyFor } from '@futureflow/core';
import { TodaySchema } from '@futureflow/contracts';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { v7 } from 'uuid';
import { space } from '@/theme';

test('workspace packages, ESM uuid and the @ alias load under jest', () => {
  expect(dayKeyFor(Date.UTC(2026, 9, 9, 12), 0, 4)).toBe('2026-10-09');
  expect(TodaySchema.safeParse({}).success).toBe(false);
  expect(v7()).toMatch(/^[0-9a-f-]{36}$/);
  expect(space.md).toBe(16);
});

test('renders React Native components', () => {
  render(<Text>Future Flow</Text>);
  expect(screen.getByText('Future Flow')).toBeTruthy();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/mobile && bun x jest test/smoke.test.tsx`
Expected: FAIL. Either `Cannot find module '@/theme'` or a uuid `SyntaxError: Cannot use import statement outside a module`.

- [ ] **Step 4: Configure Jest, TypeScript, the app config and the theme**

`apps/mobile/package.json` `jest` block (replace it):

```json
"jest": {
  "preset": "jest-expo",
  "testMatch": ["<rootDir>/test/**/*.test.ts?(x)"],
  "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" },
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|uuid)"
  ],
  "collectCoverageFrom": ["src/**/*.{ts,tsx}", "!src/app/**", "!src/lib/services.ts"],
  "coverageThreshold": { "global": { "lines": 80, "branches": 80, "functions": 80, "statements": 80 } }
}
```

Also set `"version": "0.1.0"` in `apps/mobile/package.json`.

`apps/mobile/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "types": ["jest", "node"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

`apps/mobile/app.config.ts` (then delete `app.json`):

```ts
import type { ExpoConfig } from 'expo/config';

/** CI's emulator build talks to a local Worker over plain http://10.0.2.2. Store builds never do. */
const isE2E = process.env.E2E === '1';

const config: ExpoConfig = {
  name: 'Future Flow',
  slug: 'futureflow',
  scheme: 'futureflow',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'com.bahiryasreb.futureflow',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    ['expo-build-properties', { android: { usesCleartextTraffic: isE2E } }],
  ],
};

export default config;
```

`apps/mobile/.env.example`:

```
# The Worker's URL. On the Android emulator, 10.0.2.2 is the host machine.
EXPO_PUBLIC_API_URL=http://10.0.2.2:8787
```

`apps/mobile/src/theme.ts`:

```ts
import { useColorScheme } from 'react-native';

const light = {
  background: '#F7F6F2',
  surface: '#FFFFFF',
  text: '#1B1B1F',
  muted: '#5E5E66',
  border: '#E3E1DA',
  accent: '#2F5BEA',
  accentText: '#FFFFFF',
  warningBg: '#FFF4D6',
  warningText: '#5C4300',
  dangerBg: '#FCE8E6',
  dangerText: '#8C1D18',
};

export type Palette = typeof light;

const dark: Palette = {
  background: '#111114',
  surface: '#1C1C21',
  text: '#F2F1EE',
  muted: '#A3A3AD',
  border: '#2C2C33',
  accent: '#8FA8FF',
  accentText: '#0B1026',
  warningBg: '#3A2F0B',
  warningText: '#FFE08A',
  dangerBg: '#41100D',
  dangerText: '#FFB4AB',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { md: 12, lg: 20 } as const;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
```

`apps/mobile/src/app/index.tsx` stays a placeholder until Task 7:

```tsx
import { Text, View } from 'react-native';

export default function TodayRoute() {
  return (
    <View>
      <Text>Today</Text>
    </View>
  );
}
```

- [ ] **Step 5: Lint and format config**

`eslint.config.js`: add to `ignores`: `'apps/mobile/.expo/**'`, `'apps/mobile/android/**'`, `'apps/mobile/ios/**'`, `'apps/mobile/expo-env.d.ts'`. Add a block:

```js
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@futureflow/math-engine',
              message:
                'The package root pulls in the CAS, which this machine cannot bundle (ADR 0011). Import @futureflow/math-engine/generators, /types or /rational.',
            },
          ],
        },
      ],
    },
  },
```

`.prettierignore`: add `apps/mobile/.expo/`, `apps/mobile/android/`, `apps/mobile/ios/`.
`.gitignore`: add `.claude/*.lock`.

- [ ] **Step 6: Run the smoke test to verify it passes, then the whole repo**

Run: `cd apps/mobile && bun x jest test/smoke.test.tsx`
Expected: PASS 2/2.

Run: `cd ../.. && bun x prettier --write apps/mobile && bun run format:check && bun run lint && bun run typecheck && bun run test`
Expected: all green. The mobile coverage threshold isn't run here; `bun run test` runs `jest` without coverage.

- [ ] **Step 7: Prove the lint rule bites**

Temporarily add `import '@futureflow/math-engine';` to `src/app/index.tsx` and run `bun run lint`. Expected: FAIL with the ADR 0011 message. Remove the line.

- [ ] **Step 8: Commit**

```bash
git add bunfig.toml package.json bun.lock eslint.config.js .prettierignore .gitignore apps/mobile
git commit -m "feat: scaffold the Expo app with Jest, strict TypeScript and the CAS import fence"
```

---

### Task 2: Ids and the API address

**Files:**

- Create: `apps/mobile/src/lib/ids.ts`, `apps/mobile/src/lib/config.ts`
- Test: `apps/mobile/test/ids.test.ts`, `apps/mobile/test/config.test.ts`

**Interfaces:**

- Produces: `type Ids = Readonly<{ newId: (now?: number) => string; newDeviceToken: () => string }>`, `makeIds(randomBytes: (n: number) => Uint8Array): Ids`, `toBase64Url(bytes: Uint8Array): string`, `class StartupError extends Error`, `parseApiUrl(raw: string | undefined): string`.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/test/ids.test.ts`:

```ts
import { DeviceTokenSchema } from '@futureflow/contracts';
import { randomBytes } from 'node:crypto';
import { makeIds, toBase64Url } from '@/lib/ids';

const ids = makeIds((n) => new Uint8Array(randomBytes(n)));

test('newId makes distinct UUIDv7 ids that sort by time', () => {
  const a = ids.newId(Date.UTC(2026, 9, 14, 8));
  const b = ids.newId(Date.UTC(2026, 9, 14, 9));
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(a < b).toBe(true);
  expect(new Set(Array.from({ length: 100 }, () => ids.newId())).size).toBe(100);
});

test('newDeviceToken is 32 random bytes in base64url, as the API expects', () => {
  const token = ids.newDeviceToken();
  expect(DeviceTokenSchema.safeParse(token).success).toBe(true);
  expect(token).not.toBe(ids.newDeviceToken());
});

test('toBase64Url uses the URL-safe alphabet without padding', () => {
  expect(toBase64Url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_');
  expect(toBase64Url(new Uint8Array([1]))).toBe('AQ');
});
```

`apps/mobile/test/config.test.ts`:

```ts
import { parseApiUrl, StartupError } from '@/lib/config';

test.each([
  ['https://futureflow-api.example.workers.dev', 'https://futureflow-api.example.workers.dev'],
  ['https://api.example.com/', 'https://api.example.com'],
  ['  https://api.example.com/base//  ', 'https://api.example.com/base'],
  ['http://10.0.2.2:8787', 'http://10.0.2.2:8787'],
  ['http://localhost:8787', 'http://localhost:8787'],
])('accepts %s', (raw, expected) => {
  expect(parseApiUrl(raw)).toBe(expected);
});

test.each([
  [undefined, 'no server address'],
  ['', 'no server address'],
  ['api.example.com', 'not a valid URL'],
  ['ftp://api.example.com', 'not a valid URL'],
  ['http://api.example.com', 'must use https'],
  ['https://api.example.com?x=1', 'not a valid URL'],
])('refuses %p', (raw, message) => {
  expect(() => parseApiUrl(raw)).toThrow(StartupError);
  expect(() => parseApiUrl(raw)).toThrow(message);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/ids.test.ts test/config.test.ts`
Expected: FAIL with `Cannot find module '@/lib/ids'` and `'@/lib/config'`.

- [ ] **Step 3: Implement**

`apps/mobile/src/lib/ids.ts`:

```ts
import { v7 } from 'uuid';

export type Ids = Readonly<{
  /** UUIDv7, so the server can order and de-duplicate events by id. */
  newId: (now?: number) => string;
  /** 32 random bytes, base64url: the device token the phone invents before pairing (ADR 0006). */
  newDeviceToken: () => string;
}>;

/** Hermes has no crypto.getRandomValues, so the caller supplies the randomness (expo-crypto on the phone). */
export function makeIds(randomBytes: (n: number) => Uint8Array): Ids {
  return {
    newId: (now = Date.now()) => v7({ msecs: now, random: randomBytes(16) }),
    newDeviceToken: () => toBase64Url(randomBytes(32)),
  };
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

`apps/mobile/src/lib/config.ts`:

```ts
/** A problem with the build itself: shown on a full screen, because nothing else can work. */
export class StartupError extends Error {
  override name = 'StartupError';
}

// React Native's URL class is incomplete (no hostname/protocol), so the address is parsed by hand.
const URL_SHAPE = /^(https?):\/\/([A-Za-z0-9.-]+)(:\d{1,5})?(\/[A-Za-z0-9._~\-/]*)?$/;
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

/** Reads EXPO_PUBLIC_API_URL: https, or plain http only for the emulator and local hosts. */
export function parseApiUrl(raw: string | undefined): string {
  const value = raw?.trim() ?? '';
  if (value === '') {
    throw new StartupError(
      'This build has no server address. Set EXPO_PUBLIC_API_URL and rebuild.',
    );
  }
  const match = URL_SHAPE.exec(value);
  if (match === null)
    throw new StartupError('The server address in this build is not a valid URL.');
  const [, scheme, host = '', port = '', path = ''] = match;
  if (scheme === 'http' && !LOCAL_HOSTS.has(host)) {
    throw new StartupError('The server address must use https.');
  }
  return `${scheme}://${host}${port}${path.replace(/\/+$/, '')}`;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/mobile && bun x jest test/ids.test.ts test/config.test.ts`
Expected: PASS. If `v7` rejects `msecs` together with `random`, check `node_modules/uuid/dist/types.d.ts` (it declares both on `Version7Options`) before changing anything.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/ids.ts apps/mobile/src/lib/config.ts apps/mobile/test/ids.test.ts apps/mobile/test/config.test.ts
git commit -m "feat: add UUIDv7 ids, device tokens and API address parsing to the app"
```

---

### Task 3: Typed API client

**Files:**

- Create: `apps/mobile/src/lib/api/client.ts`
- Test: `apps/mobile/test/api-client.test.ts`, `apps/mobile/test/support/fakes.ts` (first part)

**Interfaces:**

- Consumes: contracts `envelope`, `PairResponseSchema`, `TodaySchema`, `LedgerSyncResultSchema`, `LedgerPageSchema`, `PairRequestSchema`; core `LedgerEvent`.
- Produces:

  ```ts
  type ApiFailure =
    | { kind: 'network' }
    | { kind: 'server'; status: number; code: string; message: string }
    | { kind: 'rejected'; status: number; code: string; message: string }
    | { kind: 'invalid_response' };
  type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };
  type Today = z.infer<typeof TodaySchema>;
  type PairRequest = z.infer<typeof PairRequestSchema>;
  type ApiDeps = { baseUrl: string; fetch: typeof fetch; getToken: () => Promise<string | null>; timeoutMs?: number };
  createApi(deps: ApiDeps): Api
  interface Api {
    pair(body: PairRequest): Promise<ApiResult<{ deviceId: string }>>;
    today(): Promise<ApiResult<Today>>;
    pushEvents(events: readonly LedgerEvent[]): Promise<ApiResult<LedgerSyncResult>>;
    pullLedger(since: number, limit: number): Promise<ApiResult<LedgerPage>>;
  }
  ```

  `test/support/fakes.ts` exports `jsonResponse(status, body)`, `okBody(data)`, `errBody(code, message)`, `sampleToday(overrides?)`, `ledgerEvent(i, overrides?)`, `NOW`.

- [ ] **Step 1: Write the test helpers**

`apps/mobile/test/support/fakes.ts`:

```ts
import type { LedgerEvent } from '@futureflow/core';
import type { Today } from '@/lib/api/client';

export const NOW = Date.UTC(2026, 9, 14, 12); // Wednesday 14 October 2026, 12:00 UTC

export const jsonResponse = (status: number, body: unknown): Response =>
  ({ status, json: async () => body }) as unknown as Response;

export const okBody = (data: unknown) => ({ ok: true, data, error: null });
export const errBody = (code: string, message: string) => ({
  ok: false,
  data: null,
  error: { code, message },
});

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');

/** A valid phone-side spend event; `i` keeps ids unique and ordered. */
export const ledgerEvent = (i: number, overrides: Partial<LedgerEvent> = {}): LedgerEvent => ({
  id: `01920000-0000-7000-8000-${hex(i, 12)}`,
  day: '2026-10-14',
  at: NOW - 60_000 + i,
  kind: 'usage_spend',
  seconds: -60,
  ...overrides,
});

const task = (n: number, title: string) => ({
  id: `01920000-0000-7000-8000-00000000a00${n}`,
  skillId: 'math',
  when: 'after breakfast',
  verifier: 'math' as const,
  full: { title, criteria: 'Finish the set with 80% correct', seconds: 1800 },
  twoMinute: { title: 'One problem', criteria: 'Solve one problem', seconds: 120 },
});

export const sampleToday = (overrides: Partial<Today> = {}): Today => ({
  day: '2026-10-14',
  serverTime: NOW,
  plan: {
    day: '2026-10-14',
    status: 'locked',
    tasks: [task(1, 'Fractions practice'), task(2, 'Read chapter 3')],
    lockedAt: NOW - 3_600_000,
  },
  dayRecord: null,
  balanceSeconds: 3900,
  earnedTodaySeconds: 1500,
  verdicts: [
    {
      day: '2026-10-14',
      taskId: task(1, '').id,
      outcome: 'pass',
      confidence: 1,
      by: 'code',
      evidenceIds: [],
    },
  ],
  ...overrides,
});
```

`verifier: 'math'` must be one of core's `VERIFIER_KINDS`. Check `packages/core/src/plan.ts` and use a listed value if `math` isn't one.

- [ ] **Step 2: Write the failing client tests**

`apps/mobile/test/api-client.test.ts`:

```ts
import { createApi, type ApiDeps } from '@/lib/api/client';
import { errBody, jsonResponse, ledgerEvent, okBody, sampleToday } from './support/fakes';

const TOKEN = 'a'.repeat(43);

function setup(
  reply: (url: string, init: RequestInit) => Promise<Response>,
  token: string | null = TOKEN,
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const deps: ApiDeps = {
    baseUrl: 'https://api.test',
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return reply(url, init);
    }) as unknown as typeof fetch,
    getToken: async () => token,
    timeoutMs: 50,
  };
  return { api: createApi(deps), calls };
}

const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

test('pair posts the request without a token and returns the device id', async () => {
  const deviceId = '01920000-0000-7000-8000-0000000000d1';
  const { api, calls } = setup(async () => jsonResponse(201, okBody({ deviceId })));
  const body = { code: 'x'.repeat(16), token: TOKEN, deviceName: 'Phone', utcOffsetMinutes: -240 };

  expect(await api.pair(body)).toEqual({ ok: true, data: { deviceId } });
  expect(calls[0]?.url).toBe('https://api.test/v1/device/pair');
  expect(calls[0]?.init.method).toBe('POST');
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual(body);
  expect(header(calls[0]!.init, 'authorization')).toBeUndefined();
});

test('today sends the bearer token and returns the validated snapshot', async () => {
  const { api, calls } = setup(async () => jsonResponse(200, okBody(sampleToday())));
  expect(await api.today()).toEqual({ ok: true, data: sampleToday() });
  expect(header(calls[0]!.init, 'authorization')).toBe(`Bearer ${TOKEN}`);
});

test('pullLedger and pushEvents use the ledger routes', async () => {
  const { api, calls } = setup(async (url) =>
    url.includes('/events')
      ? jsonResponse(200, okBody({ added: [ledgerEvent(1).id], ignored: [], rejected: [] }))
      : jsonResponse(200, okBody({ events: [ledgerEvent(2)], next: 7 })),
  );
  expect((await api.pushEvents([ledgerEvent(1)])).ok).toBe(true);
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ events: [ledgerEvent(1)] });
  expect(await api.pullLedger(5, 500)).toEqual({
    ok: true,
    data: { events: [ledgerEvent(2)], next: 7 },
  });
  expect(calls[1]?.url).toBe('https://api.test/v1/ledger?since=5&limit=500');
});

test('a thrown fetch is a network failure', async () => {
  const { api } = setup(async () => {
    throw new TypeError('Network request failed');
  });
  expect(await api.today()).toEqual({ ok: false, error: { kind: 'network' } });
});

test('a request that never answers times out as a network failure', async () => {
  const { api } = setup(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
  expect(await api.today()).toEqual({ ok: false, error: { kind: 'network' } });
});

test('a 4xx envelope is rejected with its code and fixed message', async () => {
  const { api } = setup(async () =>
    jsonResponse(401, errBody('invalid_code', 'The setup code is wrong.')),
  );
  expect(
    await api.pair({ code: 'x'.repeat(16), token: TOKEN, deviceName: 'P', utcOffsetMinutes: 0 }),
  ).toEqual({
    ok: false,
    error: {
      kind: 'rejected',
      status: 401,
      code: 'invalid_code',
      message: 'The setup code is wrong.',
    },
  });
});

test('a 5xx is a server failure, even when the body is not JSON', async () => {
  const { api } = setup(async () =>
    jsonResponse(503, errBody('pairing_disabled', 'Pairing is not configured on the server.')),
  );
  expect(await api.today()).toEqual({
    ok: false,
    error: {
      kind: 'server',
      status: 503,
      code: 'pairing_disabled',
      message: 'Pairing is not configured on the server.',
    },
  });
  const broken = setup(
    async () =>
      ({
        status: 502,
        json: async () => {
          throw new SyntaxError('html');
        },
      }) as unknown as Response,
  );
  expect(await broken.api.today()).toEqual({
    ok: false,
    error: { kind: 'server', status: 502, code: 'internal', message: 'The server had a problem.' },
  });
});

test('a 200 that breaks the contract is an invalid response', async () => {
  const { api } = setup(async () => jsonResponse(200, okBody({ day: 'nope' })));
  expect(await api.today()).toEqual({ ok: false, error: { kind: 'invalid_response' } });
});

test('an authenticated call without a token is refused before the network', async () => {
  const { api, calls } = setup(async () => jsonResponse(200, okBody(sampleToday())), null);
  expect(await api.today()).toEqual({
    ok: false,
    error: {
      kind: 'rejected',
      status: 401,
      code: 'unauthorized',
      message: 'This phone is not paired.',
    },
  });
  expect(calls).toHaveLength(0);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/api-client.test.ts`
Expected: FAIL with `Cannot find module '@/lib/api/client'`.

- [ ] **Step 4: Implement**

`apps/mobile/src/lib/api/client.ts`:

```ts
import {
  envelope,
  LedgerPageSchema,
  LedgerSyncResultSchema,
  PairResponseSchema,
  type PairRequestSchema,
  TodaySchema,
} from '@futureflow/contracts';
import type { LedgerEvent } from '@futureflow/core';
import type { z } from 'zod';

export type Today = z.infer<typeof TodaySchema>;
export type PairRequest = z.infer<typeof PairRequestSchema>;
export type LedgerSyncResult = z.infer<typeof LedgerSyncResultSchema>;
export type LedgerPage = z.infer<typeof LedgerPageSchema>;

/** Why a call failed, in the terms the caller acts on: retry later, give up on this request, or update the app. */
export type ApiFailure =
  | { kind: 'network' }
  | { kind: 'server'; status: number; code: string; message: string }
  | { kind: 'rejected'; status: number; code: string; message: string }
  | { kind: 'invalid_response' };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

export type ApiDeps = Readonly<{
  baseUrl: string;
  fetch: typeof fetch;
  getToken: () => Promise<string | null>;
  timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = 15_000;
const NETWORK: ApiResult<never> = { ok: false, error: { kind: 'network' } };
const NOT_PAIRED: ApiResult<never> = {
  ok: false,
  error: {
    kind: 'rejected',
    status: 401,
    code: 'unauthorized',
    message: 'This phone is not paired.',
  },
};

type Call = { method: 'GET' | 'POST'; path: string; body?: unknown; auth?: boolean };

async function request<S extends z.ZodType>(
  deps: ApiDeps,
  schema: S,
  call: Call,
): Promise<ApiResult<z.infer<S>>> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (call.auth !== false) {
    const token = await deps.getToken();
    if (token === null) return NOT_PAIRED;
    headers.authorization = `Bearer ${token}`;
  }
  if (call.body !== undefined) headers['content-type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await deps.fetch(`${deps.baseUrl}${call.path}`, {
        method: call.method,
        headers,
        body: call.body === undefined ? undefined : JSON.stringify(call.body),
        signal: controller.signal,
      });
    } catch {
      return NETWORK;
    }
    return await readEnvelope(response, schema, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function readEnvelope<S extends z.ZodType>(
  response: Response,
  schema: S,
  signal: AbortSignal,
): Promise<ApiResult<z.infer<S>>> {
  const isServerError = response.status >= 500;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (signal.aborted) return NETWORK;
    return isServerError
      ? {
          ok: false,
          error: {
            kind: 'server',
            status: response.status,
            code: 'internal',
            message: 'The server had a problem.',
          },
        }
      : { ok: false, error: { kind: 'invalid_response' } };
  }
  const parsed = envelope(schema).safeParse(body);
  if (!parsed.success) {
    return isServerError
      ? {
          ok: false,
          error: {
            kind: 'server',
            status: response.status,
            code: 'internal',
            message: 'The server had a problem.',
          },
        }
      : { ok: false, error: { kind: 'invalid_response' } };
  }
  if (parsed.data.ok) return { ok: true, data: parsed.data.data as z.infer<S> };
  const { code, message } = parsed.data.error;
  const kind = isServerError ? 'server' : 'rejected';
  return { ok: false, error: { kind, status: response.status, code, message } };
}

export function createApi(deps: ApiDeps) {
  return {
    pair: (body: PairRequest) =>
      request(deps, PairResponseSchema, {
        method: 'POST',
        path: '/v1/device/pair',
        body,
        auth: false,
      }),
    today: () => request(deps, TodaySchema, { method: 'GET', path: '/v1/today' }),
    pushEvents: (events: readonly LedgerEvent[]) =>
      request(deps, LedgerSyncResultSchema, {
        method: 'POST',
        path: '/v1/ledger/events',
        body: { events },
      }),
    pullLedger: (since: number, limit: number) =>
      request(deps, LedgerPageSchema, {
        method: 'GET',
        path: `/v1/ledger?since=${since}&limit=${limit}`,
      }),
  };
}

export type Api = ReturnType<typeof createApi>;
```

- [ ] **Step 5: Run them to verify they pass**

Run: `cd apps/mobile && bun x jest test/api-client.test.ts`
Expected: PASS 9/9.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/api apps/mobile/test/api-client.test.ts apps/mobile/test/support/fakes.ts
git commit -m "feat: add a typed API client that validates every response against the contracts"
```

---

### Task 4: Local store (SQLite) and secrets

**Files:**

- Create: `apps/mobile/src/lib/store/sql.ts`, `.../store/migrations.ts`, `.../store/types.ts`, `.../store/sqlite-store.ts`, `apps/mobile/src/lib/secrets.ts`, `apps/mobile/src/lib/ledger.ts`
- Test: `apps/mobile/test/support/node-sql.ts`, `apps/mobile/test/store.test.ts`, `apps/mobile/test/ledger.test.ts`; extend `test/support/fakes.ts` with `memorySecrets`

**Interfaces:**

- Consumes: contracts `LedgerEventSchema`, `TodaySchema`; core `LedgerEvent`, `balance`, `mergeEvents`; `Today` from Task 3.
- Produces:

  ```ts
  type SqlParam = string | number | null;
  interface SqlDb { execAsync(sql): Promise<void>; runAsync(sql, ...params: SqlParam[]): Promise<unknown>;
    getAllAsync<T>(sql, ...params): Promise<T[]>; getFirstAsync<T>(sql, ...params): Promise<T | null>;
    withTransactionAsync(task: () => Promise<void>): Promise<void> }
  migrate(db: SqlDb): Promise<void>; SCHEMA_VERSION = 1
  type SavedToday = { today: Today; savedAt: number }
  type SyncStatus = 'ok' | 'offline' | 'server_error' | 'unauthorized' | 'invalid_response'
  type SyncReport = { status: SyncStatus; pushed: number; buried: number; pulled: number; at: number }
  interface LocalStore {
    enqueue(events: readonly LedgerEvent[]): Promise<void>;          // validates; all or nothing
    pending(limit?: number): Promise<LedgerEvent[]>;                  // oldest first; default all
    settle(ids: readonly string[]): Promise<void>;                    // sent: remove from outbox
    bury(ids: readonly string[], reason: string, at: number): Promise<void>; // outbox → dead letters
    counts(): Promise<{ pending: number; dead: number }>;
    applyPage(events: readonly LedgerEvent[], next: number): Promise<void>; // events + cursor, atomically
    cursor(): Promise<number>;
    confirmed(): Promise<LedgerEvent[]>;
    saveToday(saved: SavedToday): Promise<void>; savedToday(): Promise<SavedToday | null>;
    saveSync(report: SyncReport): Promise<void>; lastSync(): Promise<SyncReport | null>;
    reset(): Promise<void>;
  }
  sqliteStore(db: SqlDb): LocalStore
  interface SecretStore { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> }
  secureSecrets: SecretStore
  projectBalance(confirmed: readonly LedgerEvent[], pending: readonly LedgerEvent[]): number
  ```

  Test support: `nodeSqlDb(): SqlDb`, `memorySecrets(initial?: Record<string, string>): SecretStore & { snapshot(): Record<string, string> }`.

- [ ] **Step 1: Write the node:sqlite shim and memory secrets**

`apps/mobile/test/support/node-sql.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import type { SqlDb, SqlParam } from '@/lib/store/sql';

/** The expo-sqlite async API over Node's built-in SQLite, so the real SQL runs in tests. */
export function nodeSqlDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    runAsync: async (sql, ...params: SqlParam[]) => db.prepare(sql).run(...params),
    getAllAsync: async <T>(sql: string, ...params: SqlParam[]) =>
      db.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, ...params: SqlParam[]) =>
      (db.prepare(sql).get(...params) ?? null) as T | null,
    withTransactionAsync: async (task) => {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
```

Append to `apps/mobile/test/support/fakes.ts`:

```ts
import type { SecretStore } from '@/lib/secrets';

export function memorySecrets(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const store: SecretStore & { snapshot(): Record<string, string> } = {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
    snapshot: () => Object.fromEntries(values),
  };
  return store;
}
```

(Move the `import type` to the top of the file with the others.)

- [ ] **Step 2: Write the failing store and balance tests**

`apps/mobile/test/store.test.ts`:

```ts
import { migrate, SCHEMA_VERSION } from '@/lib/store/migrations';
import { sqliteStore } from '@/lib/store/sqlite-store';
import type { SqlDb } from '@/lib/store/sql';
import { ledgerEvent, NOW, sampleToday } from './support/fakes';
import { nodeSqlDb } from './support/node-sql';

async function open(): Promise<{ db: SqlDb; store: ReturnType<typeof sqliteStore> }> {
  const db = nodeSqlDb();
  await migrate(db);
  return { db, store: sqliteStore(db) };
}

test('migrate creates the schema once and refuses a newer one', async () => {
  const db = nodeSqlDb();
  await migrate(db);
  await migrate(db);
  expect(await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')).toEqual({
    user_version: SCHEMA_VERSION,
  });
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
  await expect(migrate(db)).rejects.toThrow('newer');
});

test('the outbox returns pending events oldest first and ignores a repeated id', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(2), ledgerEvent(1)]);
  await store.enqueue([ledgerEvent(1)]);
  expect(await store.pending()).toEqual([ledgerEvent(1), ledgerEvent(2)]);
  expect(await store.pending(1)).toEqual([ledgerEvent(1)]);
});

test('enqueue validates every event and writes nothing when one is invalid', async () => {
  const { store } = await open();
  await expect(store.enqueue([ledgerEvent(1), ledgerEvent(2, { seconds: 60 })])).rejects.toThrow();
  expect(await store.counts()).toEqual({ pending: 0, dead: 0 });
});

test('settle removes sent events; bury moves refused ones to dead letters', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(1), ledgerEvent(2), ledgerEvent(3)]);
  await store.settle([ledgerEvent(1).id]);
  await store.bury([ledgerEvent(2).id], 'future_timestamp', NOW);
  expect(await store.pending()).toEqual([ledgerEvent(3)]);
  expect(await store.counts()).toEqual({ pending: 1, dead: 1 });
});

test('applyPage stores confirmed events once and advances the cursor', async () => {
  const { store } = await open();
  expect(await store.cursor()).toBe(0);
  await store.applyPage([ledgerEvent(1), ledgerEvent(2)], 2);
  await store.applyPage([ledgerEvent(2), ledgerEvent(3)], 3);
  expect(await store.confirmed()).toEqual([ledgerEvent(1), ledgerEvent(2), ledgerEvent(3)]);
  expect(await store.cursor()).toBe(3);
});

test('the today snapshot and last sync round-trip; a corrupt snapshot reads as none', async () => {
  const { db, store } = await open();
  expect(await store.savedToday()).toBeNull();
  await store.saveToday({ today: sampleToday(), savedAt: NOW });
  expect(await store.savedToday()).toEqual({ today: sampleToday(), savedAt: NOW });
  const report = { status: 'offline' as const, pushed: 0, buried: 0, pulled: 0, at: NOW };
  await store.saveSync(report);
  expect(await store.lastSync()).toEqual(report);
  await db.runAsync("UPDATE kv SET value = '{\"today\":1}' WHERE key = 'today'");
  expect(await store.savedToday()).toBeNull();
});

test('reset wipes every table', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(1)]);
  await store.applyPage([ledgerEvent(2)], 1);
  await store.saveToday({ today: sampleToday(), savedAt: NOW });
  await store.reset();
  expect([
    await store.counts(),
    await store.confirmed(),
    await store.cursor(),
    await store.savedToday(),
  ]).toEqual([{ pending: 0, dead: 0 }, [], 0, null]);
});
```

`apps/mobile/test/ledger.test.ts`:

```ts
import { projectBalance } from '@/lib/ledger';
import { ledgerEvent } from './support/fakes';

test('the balance counts confirmed and pending events once each', () => {
  const grant = ledgerEvent(1, { kind: 'base_grant', seconds: 1800 });
  const spend = ledgerEvent(2); // -60
  expect(projectBalance([grant, spend], [spend, ledgerEvent(3)])).toBe(1800 - 60 - 60);
  expect(projectBalance([], [])).toBe(0);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/store.test.ts test/ledger.test.ts`
Expected: FAIL with `Cannot find module '@/lib/store/migrations'` and `'@/lib/ledger'`.

- [ ] **Step 4: Implement**

`apps/mobile/src/lib/store/sql.ts`:

```ts
export type SqlParam = string | number | null;

/** The part of expo-sqlite's SQLiteDatabase the store uses; tests supply a node:sqlite version. */
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlParam[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlParam[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
```

`apps/mobile/src/lib/store/migrations.ts`:

```ts
import type { SqlDb } from './sql';

/** One entry per schema version; never edit a shipped entry, append a new one. */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE outbox (id TEXT PRIMARY KEY, at INTEGER NOT NULL, event TEXT NOT NULL);
   CREATE TABLE dead_letters (id TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, buried_at INTEGER NOT NULL);
   CREATE TABLE ledger (id TEXT PRIMARY KEY, at INTEGER NOT NULL, event TEXT NOT NULL);
   CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SqlDb): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) throw new Error('The local database is from a newer app version.');
  for (let version = current; version < SCHEMA_VERSION; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version] ?? '');
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
```

`apps/mobile/src/lib/store/types.ts`:

```ts
import type { LedgerEvent } from '@futureflow/core';
import type { Today } from '../api/client';

export type SavedToday = Readonly<{ today: Today; savedAt: number }>;

export type SyncStatus = 'ok' | 'offline' | 'server_error' | 'unauthorized' | 'invalid_response';

export type SyncReport = Readonly<{
  status: SyncStatus;
  pushed: number;
  buried: number;
  pulled: number;
  at: number;
}>;

/** The phone's own data: unsent events, refused events, the server-confirmed ledger and small values. */
export interface LocalStore {
  enqueue(events: readonly LedgerEvent[]): Promise<void>;
  pending(limit?: number): Promise<LedgerEvent[]>;
  settle(ids: readonly string[]): Promise<void>;
  bury(ids: readonly string[], reason: string, at: number): Promise<void>;
  counts(): Promise<{ pending: number; dead: number }>;
  applyPage(events: readonly LedgerEvent[], next: number): Promise<void>;
  cursor(): Promise<number>;
  confirmed(): Promise<LedgerEvent[]>;
  saveToday(saved: SavedToday): Promise<void>;
  savedToday(): Promise<SavedToday | null>;
  saveSync(report: SyncReport): Promise<void>;
  lastSync(): Promise<SyncReport | null>;
  reset(): Promise<void>;
}
```

`apps/mobile/src/lib/store/sqlite-store.ts`:

```ts
import { LedgerEventSchema, TodaySchema } from '@futureflow/contracts';
import type { LedgerEvent } from '@futureflow/core';
import { z } from 'zod';
import type { SqlDb } from './sql';
import type { LocalStore, SavedToday, SyncReport } from './types';

const SavedTodaySchema = z.object({ today: TodaySchema, savedAt: z.number().int() });
const SyncReportSchema = z.object({
  status: z.enum(['ok', 'offline', 'server_error', 'unauthorized', 'invalid_response']),
  pushed: z.number().int(),
  buried: z.number().int(),
  pulled: z.number().int(),
  at: z.number().int(),
});

const KEY = { cursor: 'ledger_cursor', today: 'today', lastSync: 'last_sync' } as const;
const TABLES = ['outbox', 'dead_letters', 'ledger', 'kv'] as const;

const toEvents = (rows: readonly { event: string }[]): LedgerEvent[] =>
  rows.map((row) => JSON.parse(row.event) as LedgerEvent);

/** Bulk writes pass one JSON parameter through json_each, as the API does with D1. */
export function sqliteStore(db: SqlDb): LocalStore {
  const getKv = async (key: string): Promise<string | null> =>
    (await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key))?.value ??
    null;
  const setKv = (key: string, value: string) =>
    db.runAsync(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  const readJson = async <T>(key: string, schema: z.ZodType<T>): Promise<T | null> => {
    const raw = await getKv(key);
    if (raw === null) return null;
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  return {
    async enqueue(events) {
      const valid = events.map((event) => LedgerEventSchema.parse(event));
      await db.runAsync(
        `INSERT OR IGNORE INTO outbox (id, at, event)
         SELECT value ->> '$.id', value ->> '$.at', value FROM json_each(?)`,
        JSON.stringify(valid),
      );
    },
    pending: async (limit = -1) =>
      toEvents(
        await db.getAllAsync<{ event: string }>(
          'SELECT event FROM outbox ORDER BY at, id LIMIT ?',
          limit,
        ),
      ),
    async settle(ids) {
      await db.runAsync(
        'DELETE FROM outbox WHERE id IN (SELECT value FROM json_each(?))',
        JSON.stringify(ids),
      );
    },
    async bury(ids, reason, at) {
      const list = JSON.stringify(ids);
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT OR REPLACE INTO dead_letters (id, event, reason, buried_at)
           SELECT id, event, ?, ? FROM outbox WHERE id IN (SELECT value FROM json_each(?))`,
          reason,
          at,
          list,
        );
        await db.runAsync('DELETE FROM outbox WHERE id IN (SELECT value FROM json_each(?))', list);
      });
    },
    async counts() {
      const row = await db.getFirstAsync<{ pending: number; dead: number }>(
        'SELECT (SELECT COUNT(*) FROM outbox) AS pending, (SELECT COUNT(*) FROM dead_letters) AS dead',
      );
      return { pending: row?.pending ?? 0, dead: row?.dead ?? 0 };
    },
    async applyPage(events, next) {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT OR IGNORE INTO ledger (id, at, event)
           SELECT value ->> '$.id', value ->> '$.at', value FROM json_each(?)`,
          JSON.stringify(events),
        );
        await setKv(KEY.cursor, String(next));
      });
    },
    cursor: async () => Number((await getKv(KEY.cursor)) ?? 0),
    confirmed: async () =>
      toEvents(await db.getAllAsync<{ event: string }>('SELECT event FROM ledger ORDER BY at, id')),
    async saveToday(saved: SavedToday) {
      await setKv(KEY.today, JSON.stringify(saved));
    },
    savedToday: () => readJson(KEY.today, SavedTodaySchema),
    async saveSync(report: SyncReport) {
      await setKv(KEY.lastSync, JSON.stringify(report));
    },
    lastSync: () => readJson(KEY.lastSync, SyncReportSchema),
    async reset() {
      await db.withTransactionAsync(async () => {
        for (const table of TABLES) await db.execAsync(`DELETE FROM ${table}`);
      });
    },
  };
}
```

`apps/mobile/src/lib/secrets.ts`:

```ts
import * as SecureStore from 'expo-secure-store';

/** Small secrets (the device token) in the Android Keystore-backed store, never in SQLite. */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const secureSecrets: SecretStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};
```

`apps/mobile/src/lib/ledger.ts`:

```ts
import { balance, mergeEvents, type LedgerEvent } from '@futureflow/core';

/** The balance the phone believes right now: what the server confirmed plus what is still unsent. */
export const projectBalance = (
  confirmed: readonly LedgerEvent[],
  pending: readonly LedgerEvent[],
): number => balance(mergeEvents(confirmed, pending).events);
```

- [ ] **Step 5: Run them to verify they pass**

Run: `cd apps/mobile && bun x jest test/store.test.ts test/ledger.test.ts`
Expected: PASS 8/8. If Jest prints node:sqlite's `ExperimentalWarning`, that's fine. If `->>` is unsupported, check `SELECT sqlite_version()` (it needs ≥ 3.38) before changing the SQL.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/store apps/mobile/src/lib/secrets.ts apps/mobile/src/lib/ledger.ts apps/mobile/test
git commit -m "feat: add the phone's SQLite store (outbox, dead letters, ledger, snapshot) and secret storage"
```

---

### Task 5: Pairing

**Files:**

- Create: `apps/mobile/src/lib/pairing.ts`
- Test: `apps/mobile/test/pairing.test.ts`

**Interfaces:**

- Consumes: `Api['pair']` (Task 3), `SecretStore`, `LocalStore.reset` (Task 4).
- Produces: `TOKEN_KEY = 'device_token'`, `DEVICE_ID_KEY = 'device_id'`, `type Session = { status: 'paired'; deviceId: string } | { status: 'unpaired' }`, `readSession(secrets): Promise<Session>`, `type PairDeps = { api: Pick<Api, 'pair'>; secrets: SecretStore; newToken: () => string; utcOffsetMinutes: () => number }`, `type PairOutcome = { ok: true; deviceId: string } | { ok: false; message: string }`, `pairDevice(deps, input: { code: string; deviceName: string }): Promise<PairOutcome>`, `forgetPairing(secrets, store): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/test/pairing.test.ts`:

```ts
import type { ApiResult } from '@/lib/api/client';
import {
  DEVICE_ID_KEY,
  forgetPairing,
  pairDevice,
  readSession,
  TOKEN_KEY,
  type PairDeps,
} from '@/lib/pairing';
import { migrate } from '@/lib/store/migrations';
import { sqliteStore } from '@/lib/store/sqlite-store';
import { ledgerEvent, memorySecrets } from './support/fakes';
import { nodeSqlDb } from './support/node-sql';

const CODE = 'setup-code-0123456789';
const DEVICE = '01920000-0000-7000-8000-0000000000d1';
const TOKEN_A = 'A'.repeat(43);
const TOKEN_B = 'B'.repeat(43);

function setup(replies: ApiResult<{ deviceId: string }>[]) {
  const secrets = memorySecrets();
  const tokens = [TOKEN_A, TOKEN_B];
  const seen: { token: string; storedToken: string | null }[] = [];
  const deps: PairDeps = {
    secrets,
    newToken: () => tokens.shift() ?? 'unexpected',
    utcOffsetMinutes: () => -240,
    api: {
      pair: async (body) => {
        seen.push({ token: body.token, storedToken: await secrets.get(TOKEN_KEY) });
        return replies.shift() ?? { ok: false, error: { kind: 'network' } };
      },
    },
  };
  return { deps, secrets, seen };
}

test('saves the new token before calling the server, then the device id on success', async () => {
  const { deps, secrets, seen } = setup([{ ok: true, data: { deviceId: DEVICE } }]);
  expect(await pairDevice(deps, { code: ` ${CODE} `, deviceName: ' My phone ' })).toEqual({
    ok: true,
    deviceId: DEVICE,
  });
  expect(seen).toEqual([{ token: TOKEN_A, storedToken: TOKEN_A }]);
  expect(secrets.snapshot()).toEqual({ [TOKEN_KEY]: TOKEN_A, [DEVICE_ID_KEY]: DEVICE });
  expect(await readSession(secrets)).toEqual({ status: 'paired', deviceId: DEVICE });
});

test('a retry after a lost answer reuses the saved token', async () => {
  const { deps, seen } = setup([
    { ok: false, error: { kind: 'network' } },
    { ok: true, data: { deviceId: DEVICE } },
  ]);
  expect(await pairDevice(deps, { code: CODE, deviceName: 'P' })).toEqual({
    ok: false,
    message: "Can't reach the server. Check the connection and try again.",
  });
  expect((await pairDevice(deps, { code: CODE, deviceName: 'P' })).ok).toBe(true);
  expect(seen.map((s) => s.token)).toEqual([TOKEN_A, TOKEN_A]);
});

test('server refusals show the server message and keep the token for the next try', async () => {
  const { deps, secrets } = setup([
    {
      ok: false,
      error: {
        kind: 'rejected',
        status: 401,
        code: 'invalid_code',
        message: 'The setup code is wrong.',
      },
    },
    {
      ok: false,
      error: {
        kind: 'server',
        status: 503,
        code: 'pairing_disabled',
        message: 'Pairing is not configured on the server.',
      },
    },
    { ok: false, error: { kind: 'invalid_response' } },
  ]);
  const tries = [];
  for (let i = 0; i < 3; i++) tries.push(await pairDevice(deps, { code: CODE, deviceName: 'P' }));
  expect(tries).toEqual([
    { ok: false, message: 'The setup code is wrong.' },
    { ok: false, message: 'Pairing is not configured on the server.' },
    {
      ok: false,
      message: 'The server sent an answer this app does not understand. Update the app.',
    },
  ]);
  expect(secrets.snapshot()).toEqual({ [TOKEN_KEY]: TOKEN_A });
  expect(await readSession(secrets)).toEqual({ status: 'unpaired' });
});

test.each([
  ['short', { code: 'short', deviceName: 'P' }, 'The setup code is at least 16 characters.'],
  ['nameless', { code: CODE, deviceName: '   ' }, 'Give this phone a name of up to 64 characters.'],
  [
    'long name',
    { code: CODE, deviceName: 'x'.repeat(65) },
    'Give this phone a name of up to 64 characters.',
  ],
])(
  'refuses a %s input without touching the network or the token',
  async (_label, input, message) => {
    const { deps, secrets, seen } = setup([]);
    expect(await pairDevice(deps, input)).toEqual({ ok: false, message });
    expect([seen, secrets.snapshot()]).toEqual([[], {}]);
  },
);

test('forgetPairing removes the secrets and wipes local data', async () => {
  const secrets = memorySecrets({ [TOKEN_KEY]: TOKEN_A, [DEVICE_ID_KEY]: DEVICE });
  const db = nodeSqlDb();
  await migrate(db);
  const store = sqliteStore(db);
  await store.enqueue([ledgerEvent(1)]);
  await forgetPairing(secrets, store);
  expect([secrets.snapshot(), await store.counts()]).toEqual([{}, { pending: 0, dead: 0 }]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/pairing.test.ts`
Expected: FAIL with `Cannot find module '@/lib/pairing'`.

- [ ] **Step 3: Implement**

`apps/mobile/src/lib/pairing.ts`:

```ts
import type { Api } from './api/client';
import type { SecretStore } from './secrets';
import type { LocalStore } from './store/types';

export const TOKEN_KEY = 'device_token';
export const DEVICE_ID_KEY = 'device_id';

const MIN_CODE = 16;
const MAX_CODE = 128;
const MAX_NAME = 64;

export type Session = { status: 'paired'; deviceId: string } | { status: 'unpaired' };

export type PairDeps = Readonly<{
  api: Pick<Api, 'pair'>;
  secrets: SecretStore;
  newToken: () => string;
  utcOffsetMinutes: () => number;
}>;

export type PairOutcome = { ok: true; deviceId: string } | { ok: false; message: string };

const MESSAGES = {
  shortCode: `The setup code is at least ${MIN_CODE} characters.`,
  badName: `Give this phone a name of up to ${MAX_NAME} characters.`,
  offline: "Can't reach the server. Check the connection and try again.",
  invalid: 'The server sent an answer this app does not understand. Update the app.',
} as const;

export async function readSession(secrets: SecretStore): Promise<Session> {
  const [deviceId, token] = await Promise.all([secrets.get(DEVICE_ID_KEY), secrets.get(TOKEN_KEY)]);
  return deviceId !== null && token !== null
    ? { status: 'paired', deviceId }
    : { status: 'unpaired' };
}

/**
 * The token is invented here and saved BEFORE the request, so a retry after a lost answer sends the
 * same token and the server recognises the phone (see the pair route).
 */
export async function pairDevice(
  deps: PairDeps,
  input: { code: string; deviceName: string },
): Promise<PairOutcome> {
  const code = input.code.trim();
  const deviceName = input.deviceName.trim();
  if (code.length < MIN_CODE || code.length > MAX_CODE)
    return { ok: false, message: MESSAGES.shortCode };
  if (deviceName.length === 0 || deviceName.length > MAX_NAME)
    return { ok: false, message: MESSAGES.badName };

  let token = await deps.secrets.get(TOKEN_KEY);
  if (token === null) {
    token = deps.newToken();
    await deps.secrets.set(TOKEN_KEY, token);
  }
  const result = await deps.api.pair({
    code,
    token,
    deviceName,
    utcOffsetMinutes: deps.utcOffsetMinutes(),
  });
  if (result.ok) {
    await deps.secrets.set(DEVICE_ID_KEY, result.data.deviceId);
    return { ok: true, deviceId: result.data.deviceId };
  }
  switch (result.error.kind) {
    case 'network':
      return { ok: false, message: MESSAGES.offline };
    case 'invalid_response':
      return { ok: false, message: MESSAGES.invalid };
    case 'server':
    case 'rejected':
      return { ok: false, message: result.error.message };
  }
}

/** After the server forgets this phone: drop the credentials and every local copy. */
export async function forgetPairing(secrets: SecretStore, store: LocalStore): Promise<void> {
  await secrets.remove(DEVICE_ID_KEY);
  await secrets.remove(TOKEN_KEY);
  await store.reset();
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/mobile && bun x jest test/pairing.test.ts`
Expected: PASS 7/7.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/pairing.ts apps/mobile/test/pairing.test.ts
git commit -m "feat: pair the phone with a token saved before the request, so retries are recognised"
```

---

### Task 6: Sync engine

**Files:**

- Create: `apps/mobile/src/lib/sync.ts`
- Test: `apps/mobile/test/sync.test.ts`

**Interfaces:**

- Consumes: `Api` (Task 3); `LocalStore`, `SyncReport`, `SyncStatus` (Task 4); contracts `MAX_EVENTS_PER_BATCH`.
- Produces: `PUSH_BATCH = 500`, `PULL_PAGE = 500`, `MAX_ROUNDS = 20`, `type SyncDeps = { api: Api; store: LocalStore; now: () => number }`, `syncOnce(deps): Promise<SyncReport>`, `type Syncer = { sync(): Promise<SyncReport> }`, `createSyncer(deps): Syncer`.

Order: push the outbox, then fetch `/v1/today` (which may write the day's base grant on the server), then pull the ledger, so the pull brings back the grant.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/test/sync.test.ts`:

```ts
import type { Api, ApiResult, LedgerPage, LedgerSyncResult } from '@/lib/api/client';
import { migrate } from '@/lib/store/migrations';
import { sqliteStore } from '@/lib/store/sqlite-store';
import { createSyncer, syncOnce, type SyncDeps } from '@/lib/sync';
import { ledgerEvent, NOW, sampleToday } from './support/fakes';
import { nodeSqlDb } from './support/node-sql';

type Script = {
  push?: (events: readonly { id: string }[]) => ApiResult<LedgerSyncResult>;
  pull?: (since: number) => ApiResult<LedgerPage>;
  today?: () => ApiResult<ReturnType<typeof sampleToday>>;
};

const added = (events: readonly { id: string }[]): ApiResult<LedgerSyncResult> => ({
  ok: true,
  data: { added: events.map((e) => e.id), ignored: [], rejected: [] },
});
const emptyPage = (since: number): ApiResult<LedgerPage> => ({
  ok: true,
  data: { events: [], next: since },
});

async function setup(script: Script = {}) {
  const db = nodeSqlDb();
  await migrate(db);
  const store = sqliteStore(db);
  const calls = { push: [] as number[], pull: [] as number[], today: 0 };
  const api: Api = {
    pair: async () => ({ ok: false, error: { kind: 'network' } }),
    pushEvents: async (events) => {
      calls.push.push(events.length);
      return (script.push ?? added)(events);
    },
    pullLedger: async (since) => {
      calls.pull.push(since);
      return (script.pull ?? emptyPage)(since);
    },
    today: async () => {
      calls.today++;
      return script.today?.() ?? { ok: true, data: sampleToday() };
    },
  };
  const deps: SyncDeps = { api, store, now: () => NOW };
  return { deps, store, calls };
}

const many = (n: number) => Array.from({ length: n }, (_, i) => ledgerEvent(i + 1));

test('pushes the outbox in batches of 500 and settles what the server took', async () => {
  const { deps, store, calls } = await setup();
  await store.enqueue(many(1200));
  const report = await syncOnce(deps);
  expect(calls.push).toEqual([500, 500, 200]);
  expect(report).toEqual({ status: 'ok', pushed: 1200, buried: 0, pulled: 0, at: NOW });
  expect(await store.counts()).toEqual({ pending: 0, dead: 0 });
  expect(await store.lastSync()).toEqual(report);
});

test('settles ignored ids as sent (a duplicate after a lost answer)', async () => {
  const { deps, store } = await setup({
    push: (events) => ({
      ok: true,
      data: { added: [], ignored: events.map((e) => e.id), rejected: [] },
    }),
  });
  await store.enqueue(many(3));
  expect((await syncOnce(deps)).pushed).toBe(3);
  expect(await store.counts()).toEqual({ pending: 0, dead: 0 });
});

test('buries events the server refuses as future-dated instead of retrying them', async () => {
  const [a, b] = many(2) as [ReturnType<typeof ledgerEvent>, ReturnType<typeof ledgerEvent>];
  const { deps, store } = await setup({
    push: () => ({
      ok: true,
      data: { added: [a.id], ignored: [], rejected: [{ id: b.id, reason: 'future_timestamp' }] },
    }),
  });
  await store.enqueue([a, b]);
  expect(await syncOnce(deps)).toMatchObject({ status: 'ok', pushed: 1, buried: 1 });
  expect(await store.counts()).toEqual({ pending: 0, dead: 1 });
});

test('a refused batch (400) is buried and sync carries on', async () => {
  const { deps, store, calls } = await setup({
    push: () => ({
      ok: false,
      error: {
        kind: 'rejected',
        status: 400,
        code: 'invalid_request',
        message: 'The request is invalid.',
      },
    }),
  });
  await store.enqueue(many(2));
  expect(await syncOnce(deps)).toMatchObject({ status: 'ok', buried: 2 });
  expect([calls.today, calls.pull.length]).toEqual([1, 1]);
});

test.each([
  ['offline', { kind: 'network' } as const],
  ['server_error', { kind: 'server', status: 500, code: 'internal', message: 'x' } as const],
  ['server_error', { kind: 'rejected', status: 429, code: 'rate_limited', message: 'x' } as const],
  ['invalid_response', { kind: 'invalid_response' } as const],
])('stops as %s without losing the outbox or calling further', async (status, error) => {
  const { deps, store, calls } = await setup({ push: () => ({ ok: false, error }) });
  await store.enqueue(many(2));
  expect((await syncOnce(deps)).status).toBe(status);
  expect(await store.counts()).toEqual({ pending: 2, dead: 0 });
  expect([calls.today, calls.pull.length]).toEqual([0, 0]);
});

test('401 keeps the outbox and reports unauthorized', async () => {
  const { deps, store } = await setup({
    push: () => ({
      ok: false,
      error: { kind: 'rejected', status: 401, code: 'unauthorized', message: 'x' },
    }),
  });
  await store.enqueue(many(1));
  expect((await syncOnce(deps)).status).toBe('unauthorized');
  expect(await store.counts()).toEqual({ pending: 1, dead: 0 });
});

test('saves the today snapshot, and a today failure stops before the pull', async () => {
  const ok = await setup();
  await syncOnce(ok.deps);
  expect(await ok.store.savedToday()).toEqual({ today: sampleToday(), savedAt: NOW });

  const down = await setup({ today: () => ({ ok: false, error: { kind: 'network' } }) });
  expect((await syncOnce(down.deps)).status).toBe('offline');
  expect(down.calls.pull).toEqual([]);
});

test('pulls pages until a short page and resumes from the saved cursor', async () => {
  const pages: Record<number, LedgerPage> = {
    0: { events: many(500), next: 500 },
    500: { events: [ledgerEvent(501)], next: 501 },
    501: { events: [], next: 501 },
  };
  const { deps, store, calls } = await setup({
    pull: (since) => ({ ok: true, data: pages[since]! }),
  });
  expect((await syncOnce(deps)).pulled).toBe(501);
  expect(calls.pull).toEqual([0, 500]);
  expect(await store.cursor()).toBe(501);
  await syncOnce(deps);
  expect(calls.pull).toEqual([0, 500, 501]);
});

test('a batch the server neither takes nor refuses stops sync instead of looping', async () => {
  const { deps, store, calls } = await setup({
    push: () => ({ ok: true, data: { added: [], ignored: [], rejected: [] } }),
  });
  await store.enqueue(many(1));
  expect((await syncOnce(deps)).status).toBe('invalid_response');
  expect(calls.push).toEqual([1]);
});

test('concurrent sync calls share one run', async () => {
  const { deps, calls } = await setup();
  const syncer = createSyncer(deps);
  const [a, b] = await Promise.all([syncer.sync(), syncer.sync()]);
  expect(a).toBe(b);
  expect(calls.today).toBe(1);
  await syncer.sync();
  expect(calls.today).toBe(2);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/sync.test.ts`
Expected: FAIL with `Cannot find module '@/lib/sync'`.

- [ ] **Step 3: Implement**

`apps/mobile/src/lib/sync.ts`:

```ts
import { MAX_EVENTS_PER_BATCH } from '@futureflow/contracts';
import type { Api, ApiFailure } from './api/client';
import type { LocalStore, SyncReport, SyncStatus } from './store/types';

export const PUSH_BATCH = MAX_EVENTS_PER_BATCH;
export const PULL_PAGE = MAX_EVENTS_PER_BATCH;
/** Bounds each loop: 20 × 500 events per sync is far beyond a day's traffic. */
export const MAX_ROUNDS = 20;

export type SyncDeps = Readonly<{ api: Api; store: LocalStore; now: () => number }>;

type Stop = Exclude<SyncStatus, 'ok'>;
type Step = { stop: Stop | null; count: number };

/** Network, server and rate-limit failures are worth retrying later; other refusals are not. */
function stopFor(error: ApiFailure): Stop {
  switch (error.kind) {
    case 'network':
      return 'offline';
    case 'server':
      return 'server_error';
    case 'invalid_response':
      return 'invalid_response';
    case 'rejected':
      if (error.code === 'unauthorized') return 'unauthorized';
      return error.code === 'rate_limited' ? 'server_error' : 'invalid_response';
  }
}

const isRefusedBatch = (error: ApiFailure): error is Extract<ApiFailure, { kind: 'rejected' }> =>
  error.kind === 'rejected' && error.code !== 'unauthorized' && error.code !== 'rate_limited';

async function push(deps: SyncDeps): Promise<Step & { buried: number }> {
  let pushed = 0;
  let buried = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const batch = await deps.store.pending(PUSH_BATCH);
    if (batch.length === 0) break;
    const result = await deps.api.pushEvents(batch);
    if (!result.ok) {
      if (!isRefusedBatch(result.error))
        return { stop: stopFor(result.error), count: pushed, buried };
      // Our own events failed the contract: retrying can never succeed, so keep them aside.
      await deps.store.bury(
        batch.map((e) => e.id),
        `refused:${result.error.code}`,
        deps.now(),
      );
      buried += batch.length;
      continue;
    }
    const sent = [...result.data.added, ...result.data.ignored];
    const refused = result.data.rejected.map((r) => r.id);
    if (sent.length + refused.length === 0)
      return { stop: 'invalid_response', count: pushed, buried };
    await deps.store.settle(sent);
    if (refused.length > 0) await deps.store.bury(refused, 'future_timestamp', deps.now());
    pushed += sent.length;
    buried += refused.length;
  }
  return { stop: null, count: pushed, buried };
}

async function refreshToday(deps: SyncDeps): Promise<Stop | null> {
  const result = await deps.api.today();
  if (!result.ok) return stopFor(result.error);
  await deps.store.saveToday({ today: result.data, savedAt: deps.now() });
  return null;
}

async function pull(deps: SyncDeps): Promise<Step> {
  let pulled = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result = await deps.api.pullLedger(await deps.store.cursor(), PULL_PAGE);
    if (!result.ok) return { stop: stopFor(result.error), count: pulled };
    await deps.store.applyPage(result.data.events, result.data.next);
    pulled += result.data.events.length;
    if (result.data.events.length < PULL_PAGE) break;
  }
  return { stop: null, count: pulled };
}

/** Push, then today (it may write the base grant), then pull, so the pull brings the grant back. */
export async function syncOnce(deps: SyncDeps): Promise<SyncReport> {
  const pushed = await push(deps);
  let status: SyncStatus = pushed.stop ?? 'ok';
  let pulled = 0;
  if (status === 'ok') status = (await refreshToday(deps)) ?? 'ok';
  if (status === 'ok') {
    const page = await pull(deps);
    pulled = page.count;
    status = page.stop ?? 'ok';
  }
  const report: SyncReport = {
    status,
    pushed: pushed.count,
    buried: pushed.buried,
    pulled,
    at: deps.now(),
  };
  await deps.store.saveSync(report);
  return report;
}

export type Syncer = Readonly<{ sync(): Promise<SyncReport> }>;

/** One sync at a time: a second caller while one runs gets the same result. */
export function createSyncer(deps: SyncDeps): Syncer {
  let running: Promise<SyncReport> | null = null;
  return {
    sync() {
      running ??= syncOnce(deps).finally(() => {
        running = null;
      });
      return running;
    },
  };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/mobile && bun x jest test/sync.test.ts`
Expected: PASS 13/13.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/sync.ts apps/mobile/test/sync.test.ts
git commit -m "feat: sync the outbox, today snapshot and ledger in one bounded, single-flight run"
```

---

### Task 7: App shell and screens (Pair, Today, Diagnostics)

Design guidance: apply `animate-expo` (press feedback, no motion where none is needed), `emil-design-eng` (restraint, clear hierarchy) and `apple-design` (instant feedback, 48 dp touch targets, Dynamic Type). P4a adds no animation library. Feedback is an instant opacity change on press-in. Text uses system fonts and respects the font scale (no fixed heights on text containers). The balance uses tabular figures.

**Files:**

- Create: `apps/mobile/src/lib/format.ts`, `src/lib/app.tsx`, `src/lib/services.ts`, `src/components/button.tsx`, `src/components/banner.tsx`, `src/screens/root-stack.tsx`, `src/screens/pair.tsx`, `src/screens/today/index.tsx`, `src/screens/today/task-row.tsx`, `src/screens/today/use-today.ts`, `src/screens/diagnostics.tsx`, `src/app/_layout.tsx`, `src/app/pair.tsx`, `src/app/diagnostics.tsx`
- Modify: `src/app/index.tsx`
- Test: `apps/mobile/test/format.test.ts`, `apps/mobile/test/screens.test.tsx`; extend `test/support/fakes.ts` with `testServices`

**Interfaces:**

- Consumes: everything from Tasks 2–6.
- Produces:

  ```ts
  formatDuration(seconds: number): string; formatTime(ms: number, offsetMinutes: number): string;
  localOffsetMinutes(ms: number): number; formatDayLabel(day: string): string
  type AppServices = Readonly<{ api: Api; store: LocalStore; secrets: SecretStore; ids: Ids; syncer: Syncer; now: () => number; apiUrl: string }>
  AppProvider({ load, children }: { load: () => Promise<AppServices>; children: ReactNode })
  useApp(): { services: AppServices; session: Session; setPaired(deviceId: string): void; forgetPairing(): Promise<void> }
  createServices(): Promise<AppServices>
  RootStack(): JSX.Element
  testServices(api?: Partial<Api>, secrets?: Record<string, string>): Promise<AppServices>  // test support
  ```

  testIDs for Maestro: `setup-code`, `device-name`, `pair-button`, `balance`, `diagnostics-link`, `sync-now`, `retry`.

- [ ] **Step 1: Write the failing format tests**

`apps/mobile/test/format.test.ts`:

```ts
import { formatDayLabel, formatDuration, formatTime } from '@/lib/format';

test.each([
  [0, '0 min'],
  [59, '0 min'],
  [60, '1 min'],
  [3599, '59 min'],
  [3600, '1 h 00 min'],
  [3900, '1 h 05 min'],
  [-1, '−1 min'],
  [-30, '−1 min'],
  [-3660, '−1 h 01 min'],
])('formatDuration(%i) is %s: time left rounds down, debt rounds up', (seconds, text) => {
  expect(formatDuration(seconds)).toBe(text);
});

test('formatTime shows the local wall clock for an offset', () => {
  expect(formatTime(Date.UTC(2026, 9, 14, 18, 2), -240)).toBe('14:02');
  expect(formatTime(Date.UTC(2026, 9, 14, 23, 30), 60)).toBe('00:30');
});

test('formatDayLabel names the weekday and month', () => {
  expect(formatDayLabel('2026-10-14')).toBe('Wednesday 14 October');
  expect(formatDayLabel('2027-01-01')).toBe('Friday 1 January');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/format.test.ts`
Expected: FAIL with `Cannot find module '@/lib/format'`.

- [ ] **Step 3: Implement format.ts**

`apps/mobile/src/lib/format.ts`:

```ts
import { parseDayKey } from '@futureflow/core';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const pad = (n: number) => String(n).padStart(2, '0');

/** Time left is rounded down (never promise time you don't have); debt is rounded up (never hide it). */
export function formatDuration(seconds: number): string {
  const minutes = seconds < 0 ? Math.ceil(-seconds / 60) : Math.floor(seconds / 60);
  const sign = seconds < 0 ? '−' : '';
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${sign}${minutes} min` : `${sign}${hours} h ${pad(minutes % 60)} min`;
}

export const localOffsetMinutes = (ms: number): number => -new Date(ms).getTimezoneOffset();

export function formatTime(ms: number, offsetMinutes: number): string {
  const local = new Date(ms + offsetMinutes * 60_000);
  return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

export function formatDayLabel(day: string): string {
  const date = new Date(parseDayKey(day));
  return `${WEEKDAYS[date.getUTCDay()] ?? ''} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''}`;
}
```

Run: `cd apps/mobile && bun x jest test/format.test.ts`
Expected: PASS. If `parseDayKey` isn't midnight UTC, read `packages/core/src/time.ts` and adapt `formatDayLabel` (not the test).

- [ ] **Step 4: Write the test services helper**

Append to `apps/mobile/test/support/fakes.ts`:

```ts
import { randomBytes } from 'node:crypto';
import type { Api } from '@/lib/api/client';
import type { AppServices } from '@/lib/app';
import { makeIds } from '@/lib/ids';
import { migrate } from '@/lib/store/migrations';
import { sqliteStore } from '@/lib/store/sqlite-store';
import { createSyncer } from '@/lib/sync';
import { nodeSqlDb } from './node-sql';

export async function testServices(
  api: Partial<Api> = {},
  secrets: Record<string, string> = {},
): Promise<AppServices> {
  const db = nodeSqlDb();
  await migrate(db);
  const store = sqliteStore(db);
  const fullApi: Api = {
    pair: async () => ({ ok: false, error: { kind: 'network' } }),
    today: async () => ({ ok: true, data: sampleToday() }),
    pushEvents: async (events) => ({
      ok: true,
      data: { added: events.map((e) => e.id), ignored: [], rejected: [] },
    }),
    pullLedger: async (since) => ({ ok: true, data: { events: [], next: since } }),
    ...api,
  };
  const now = () => NOW;
  return {
    api: fullApi,
    store,
    secrets: memorySecrets(secrets),
    ids: makeIds((n) => new Uint8Array(randomBytes(n))),
    syncer: createSyncer({ api: fullApi, store, now }),
    now,
    apiUrl: 'https://api.test',
  };
}

export const PAIRED = {
  device_token: 'A'.repeat(43),
  device_id: '01920000-0000-7000-8000-0000000000d1',
};
```

(Merge the imports into the top of the file.)

- [ ] **Step 5: Write the failing screen tests**

`apps/mobile/test/screens.test.tsx`:

```tsx
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { ApiResult, Today } from '@/lib/api/client';
import { AppProvider, type AppServices } from '@/lib/app';
import { RootStack } from '@/screens/root-stack';
import { DiagnosticsScreen } from '@/screens/diagnostics';
import { PairScreen } from '@/screens/pair';
import { TodayScreen } from '@/screens/today';
import { ledgerEvent, PAIRED, sampleToday, testServices } from './support/fakes';

function mount(services: AppServices, initialUrl = '/') {
  const load = async () => services;
  return renderRouter(
    {
      _layout: () => (
        <AppProvider load={load}>
          <RootStack />
        </AppProvider>
      ),
      index: TodayScreen,
      pair: PairScreen,
      diagnostics: DiagnosticsScreen,
    },
    { initialUrl },
  );
}

const offline: ApiResult<never> = { ok: false, error: { kind: 'network' } };

test('an unpaired phone lands on pairing; a good code opens Today', async () => {
  const grant = ledgerEvent(1, { kind: 'base_grant', seconds: 3900 });
  const services = await testServices({
    pair: async () => ({ ok: true, data: { deviceId: PAIRED.device_id } }),
    pullLedger: async (since) => ({
      ok: true,
      data: since === 0 ? { events: [grant], next: 1 } : { events: [], next: since },
    }),
  });
  mount(services);
  expect(await screen.findByText('Pair this phone')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('setup-code'), 'setup-code-0123456789');
  fireEvent.press(screen.getByTestId('pair-button'));
  expect(await screen.findByTestId('balance')).toHaveTextContent('1 h 05 min');
});

test('a refused code shows the reason inline and keeps the draft', async () => {
  const services = await testServices({
    pair: async () => ({
      ok: false,
      error: {
        kind: 'rejected',
        status: 401,
        code: 'invalid_code',
        message: 'The setup code is wrong.',
      },
    }),
  });
  mount(services);
  fireEvent.changeText(await screen.findByTestId('setup-code'), 'setup-code-0123456789');
  fireEvent.press(screen.getByTestId('pair-button'));
  expect(await screen.findByText('The setup code is wrong.')).toBeTruthy();
  expect(screen.getByTestId('setup-code')).toHaveProp('value', 'setup-code-0123456789');
  expect(screen.getByTestId('pair-button')).toBeEnabled();
});

test('Today shows the balance, earned time, tasks and their verdicts', async () => {
  const services = await testServices({}, PAIRED);
  await services.store.applyPage([ledgerEvent(1, { kind: 'base_grant', seconds: 3960 })], 1);
  mount(services);
  expect(await screen.findByTestId('balance')).toHaveTextContent('1 h 06 min');
  expect(screen.getByText('Earned today 25 min')).toBeTruthy();
  expect(screen.getByText('Wednesday 14 October')).toBeTruthy();
  expect(screen.getByText('Fractions practice')).toBeTruthy();
  expect(screen.getByText('Passed')).toBeTruthy();
  expect(screen.getByText('Not checked yet')).toBeTruthy();
});

test('a day without a plan says so instead of showing an empty list', async () => {
  const services = await testServices(
    { today: async () => ({ ok: true, data: sampleToday({ plan: null }) }) },
    PAIRED,
  );
  mount(services);
  expect(await screen.findByText('No plan for today')).toBeTruthy();
});

test('first load offline shows Retry, and Retry loads', async () => {
  let reply: ApiResult<Today> = offline;
  const services = await testServices({ today: async () => reply }, PAIRED);
  mount(services);
  expect(await screen.findByText("Can't load today")).toBeTruthy();
  reply = { ok: true, data: sampleToday() };
  fireEvent.press(screen.getByTestId('retry'));
  expect(await screen.findByText('Fractions practice')).toBeTruthy();
});

test('offline after a good sync keeps the saved day with a banner', async () => {
  let reply: ApiResult<Today> = { ok: true, data: sampleToday() };
  const services = await testServices({ today: async () => reply }, PAIRED);
  await services.syncer.sync();
  reply = offline;
  mount(services);
  expect(await screen.findByText(/^Offline\. Showing what was saved at/)).toBeTruthy();
  expect(screen.getByText('Fractions practice')).toBeTruthy();
});

test('a forgotten phone (401) offers Pair again, which wipes local data', async () => {
  const unauthorized: ApiResult<never> = {
    ok: false,
    error: { kind: 'rejected', status: 401, code: 'unauthorized', message: 'x' },
  };
  const services = await testServices(
    { pushEvents: async () => unauthorized, today: async () => unauthorized },
    PAIRED,
  );
  await services.store.enqueue([ledgerEvent(1)]);
  mount(services);
  fireEvent.press(await screen.findByText('Pair again'));
  expect(await screen.findByText('Pair this phone')).toBeTruthy();
  expect(await services.store.counts()).toEqual({ pending: 0, dead: 0 });
  expect(await services.secrets.get('device_token')).toBeNull();
});

test('Diagnostics shows the queue and syncs on demand', async () => {
  const services = await testServices({}, PAIRED);
  await services.store.enqueue([ledgerEvent(1), ledgerEvent(2)]);
  mount(services, '/diagnostics');
  expect(await screen.findByText('Waiting to send')).toBeTruthy();
  expect(screen.getByTestId('pending-count')).toHaveTextContent('2');
  fireEvent.press(screen.getByTestId('sync-now'));
  await waitFor(() => expect(screen.getByTestId('pending-count')).toHaveTextContent('0'));
});

test('a failed startup shows the reason on a full screen', async () => {
  const load = async (): Promise<AppServices> => {
    const { StartupError } = await import('@/lib/config');
    throw new StartupError(
      'This build has no server address. Set EXPO_PUBLIC_API_URL and rebuild.',
    );
  };
  renderRouter({
    _layout: () => (
      <AppProvider load={load}>
        <RootStack />
      </AppProvider>
    ),
    index: TodayScreen,
    pair: PairScreen,
  });
  expect(
    await screen.findByText(
      'This build has no server address. Set EXPO_PUBLIC_API_URL and rebuild.',
    ),
  ).toBeTruthy();
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `cd apps/mobile && bun x jest test/screens.test.tsx`
Expected: FAIL with `Cannot find module '@/lib/app'`.

- [ ] **Step 7: Implement the app provider and production wiring**

`apps/mobile/src/lib/app.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette, space } from '@/theme';
import type { Api } from './api/client';
import { StartupError } from './config';
import type { Ids } from './ids';
import { forgetPairing, readSession, type Session } from './pairing';
import type { SecretStore } from './secrets';
import type { LocalStore } from './store/types';
import type { Syncer } from './sync';

export type AppServices = Readonly<{
  api: Api;
  store: LocalStore;
  secrets: SecretStore;
  ids: Ids;
  syncer: Syncer;
  now: () => number;
  apiUrl: string;
}>;

type AppValue = Readonly<{
  services: AppServices;
  session: Session;
  setPaired: (deviceId: string) => void;
  forgetPairing: () => Promise<void>;
}>;

type State =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; services: AppServices; session: Session };

const AppContext = createContext<AppValue | null>(null);
const GENERIC_FAILURE =
  'The app could not open its storage. Restart it; if this keeps happening, reinstall.';

/** Loads the services and the saved session before any screen renders, so nothing flashes or misroutes. */
export function AppProvider({
  load,
  children,
}: {
  load: () => Promise<AppServices>;
  children: ReactNode;
}) {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const services = await load();
        const session = await readSession(services.secrets);
        if (live) setState({ phase: 'ready', services, session });
      } catch (error) {
        console.error(
          JSON.stringify({
            event: 'startup_failed',
            name: error instanceof Error ? error.name : 'unknown',
          }),
        );
        if (live)
          setState({
            phase: 'failed',
            message: error instanceof StartupError ? error.message : GENERIC_FAILURE,
          });
      }
    })();
    return () => {
      live = false;
    };
  }, [load]);

  const setPaired = useCallback((deviceId: string) => {
    setState((s) => (s.phase === 'ready' ? { ...s, session: { status: 'paired', deviceId } } : s));
  }, []);

  const forget = useCallback(async () => {
    if (state.phase !== 'ready') return;
    await forgetPairing(state.services.secrets, state.services.store);
    setState({ ...state, session: { status: 'unpaired' } });
  }, [state]);

  const value = useMemo<AppValue | null>(
    () =>
      state.phase === 'ready'
        ? { services: state.services, session: state.session, setPaired, forgetPairing: forget }
        : null,
    [state, setPaired, forget],
  );

  if (state.phase === 'loading') return null;
  if (state.phase === 'failed') return <StartupFailure message={state.message} />;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (value === null) throw new Error('useApp must be used inside AppProvider');
  return value;
}

function StartupFailure({ message }: { message: string }) {
  const c = usePalette();
  return (
    <View style={[styles.failure, { backgroundColor: c.background }]}>
      <Text accessibilityRole="header" style={[styles.failureTitle, { color: c.text }]}>
        Future Flow can't start
      </Text>
      <Text style={[styles.failureBody, { color: c.muted }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  failure: { flex: 1, justifyContent: 'center', padding: space.lg, gap: space.sm },
  failureTitle: { fontSize: 22, fontWeight: '600' },
  failureBody: { fontSize: 16, lineHeight: 22 },
});
```

`apps/mobile/src/lib/services.ts`:

```ts
import { getRandomBytes } from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';
import type { AppServices } from './app';
import { createApi } from './api/client';
import { parseApiUrl } from './config';
import { makeIds } from './ids';
import { TOKEN_KEY } from './pairing';
import { secureSecrets } from './secrets';
import { migrate } from './store/migrations';
import { sqliteStore } from './store/sqlite-store';
import { createSyncer } from './sync';

/** Production wiring. Native modules only, so it is covered by the emulator run, not Jest. */
export async function createServices(): Promise<AppServices> {
  const apiUrl = parseApiUrl(process.env.EXPO_PUBLIC_API_URL);
  const db = await openDatabaseAsync('futureflow.db');
  await db.execAsync('PRAGMA journal_mode = WAL');
  await migrate(db);
  const store = sqliteStore(db);
  const api = createApi({
    baseUrl: apiUrl,
    fetch: (input, init) => fetch(input, init),
    getToken: () => secureSecrets.get(TOKEN_KEY),
  });
  const now = () => Date.now();
  return {
    api,
    store,
    secrets: secureSecrets,
    ids: makeIds(getRandomBytes),
    syncer: createSyncer({ api, store, now }),
    now,
    apiUrl,
  };
}
```

`EXPO_PUBLIC_API_URL` must be read as `process.env.EXPO_PUBLIC_API_URL` literally, because Expo inlines only that exact member expression.

- [ ] **Step 8: Implement components, screens and routes**

`apps/mobile/src/components/button.tsx`:

```tsx
import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, space, usePalette } from '@/theme';

type ButtonProps = Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  testID?: string;
}>;

/** Feedback is instant on press-in (no fade), and the touch target is at least 48 dp tall. */
export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  testID,
}: ButtonProps) {
  const c = usePalette();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        primary
          ? { backgroundColor: c.accent }
          : { borderColor: c.border, borderWidth: StyleSheet.hairlineWidth * 2 },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, { color: primary ? c.accentText : c.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  label: { fontSize: 16, fontWeight: '600' },
});
```

`apps/mobile/src/components/banner.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { radius, space, usePalette } from '@/theme';
import { Button } from './button';

type BannerProps = Readonly<{
  tone: 'warning' | 'danger';
  message: string;
  action?: { label: string; onPress: () => void };
}>;

export function Banner({ tone, message, action }: BannerProps) {
  const c = usePalette();
  const [bg, fg] = tone === 'warning' ? [c.warningBg, c.warningText] : [c.dangerBg, c.dangerText];
  return (
    <View accessibilityLiveRegion="polite" style={[styles.box, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{message}</Text>
      {action && <Button label={action.label} onPress={action.onPress} variant="secondary" />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  text: { fontSize: 15, lineHeight: 21 },
});
```

`apps/mobile/src/screens/root-stack.tsx`:

```tsx
import { Stack } from 'expo-router';
import { useApp } from '@/lib/app';

/** Unpaired phones can only reach pairing; paired phones never see it. */
export function RootStack() {
  const { session } = useApp();
  const paired = session.status === 'paired';
  return (
    <Stack>
      <Stack.Protected guard={paired}>
        <Stack.Screen name="index" options={{ title: 'Today' }} />
        <Stack.Screen name="diagnostics" options={{ title: 'Diagnostics' }} />
      </Stack.Protected>
      <Stack.Protected guard={!paired}>
        <Stack.Screen name="pair" options={{ title: 'Pair this phone', headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
```

`apps/mobile/src/screens/pair.tsx`:

```tsx
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { localOffsetMinutes } from '@/lib/format';
import { pairDevice } from '@/lib/pairing';
import { radius, space, usePalette } from '@/theme';

export function PairScreen() {
  const { services, setPaired } = useApp();
  const c = usePalette();
  const [code, setCode] = useState('');
  const [name, setName] = useState('My phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await pairDevice(
      {
        api: services.api,
        secrets: services.secrets,
        newToken: services.ids.newDeviceToken,
        utcOffsetMinutes: () => localOffsetMinutes(services.now()),
      },
      { code, deviceName: name },
    );
    setBusy(false);
    if (outcome.ok) setPaired(outcome.deviceId);
    else setError(outcome.message);
  };

  const input = [
    styles.input,
    { color: c.text, borderColor: c.border, backgroundColor: c.surface },
  ];
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView behavior="height" style={styles.fill}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>
            Pair this phone
          </Text>
          <Text style={[styles.lead, { color: c.muted }]}>
            Enter the setup code from your server. It works once, for this phone only.
          </Text>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.text }]}>Setup code</Text>
            <TextInput
              testID="setup-code"
              value={code}
              onChangeText={setCode}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={input}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.text }]}>Phone name</Text>
            <TextInput
              testID="device-name"
              value={name}
              onChangeText={setName}
              maxLength={64}
              style={input}
            />
          </View>
          {error !== null && (
            <Text accessibilityLiveRegion="polite" style={[styles.error, { color: c.dangerText }]}>
              {error}
            </Text>
          )}
          <Button
            testID="pair-button"
            label={busy ? 'Pairing…' : 'Pair'}
            onPress={submit}
            disabled={busy || code.trim() === ''}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: space.lg, gap: space.md, paddingTop: space.xl },
  title: { fontSize: 28, fontWeight: '700' },
  lead: { fontSize: 16, lineHeight: 22 },
  field: { gap: space.xs },
  label: { fontSize: 15, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  error: { fontSize: 15, lineHeight: 21 },
});
```

`apps/mobile/src/screens/today/use-today.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApp } from '@/lib/app';
import { projectBalance } from '@/lib/ledger';
import type { SavedToday, SyncReport } from '@/lib/store/types';

export type TodayView = Readonly<{
  loaded: boolean;
  syncing: boolean;
  saved: SavedToday | null;
  balanceSeconds: number;
  lastSync: SyncReport | null;
}>;

const INITIAL: TodayView = {
  loaded: false,
  syncing: false,
  saved: null,
  balanceSeconds: 0,
  lastSync: null,
};

/** Shows what is saved at once, then syncs on open, on return to the app and on demand. */
export function useToday() {
  const { services } = useApp();
  const [view, setView] = useState<TodayView>(INITIAL);
  const live = useRef(true);

  const reload = useCallback(async () => {
    const { store } = services;
    const [saved, confirmed, pending, lastSync] = await Promise.all([
      store.savedToday(),
      store.confirmed(),
      store.pending(),
      store.lastSync(),
    ]);
    if (live.current) {
      setView((v) => ({
        ...v,
        loaded: true,
        saved,
        balanceSeconds: projectBalance(confirmed, pending),
        lastSync,
      }));
    }
  }, [services]);

  const refresh = useCallback(async () => {
    setView((v) => ({ ...v, syncing: true }));
    try {
      await services.syncer.sync();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'sync_failed',
          name: error instanceof Error ? error.name : 'unknown',
        }),
      );
    }
    await reload();
    if (live.current) setView((v) => ({ ...v, syncing: false }));
  }, [services, reload]);

  useEffect(() => {
    live.current = true;
    void reload().then(refresh);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      live.current = false;
      subscription.remove();
    };
  }, [reload, refresh]);

  return { ...view, refresh };
}
```

`apps/mobile/src/screens/today/task-row.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import type { Today } from '@/lib/api/client';
import { formatDuration } from '@/lib/format';
import { radius, space, usePalette } from '@/theme';

type Task = NonNullable<Today['plan']>['tasks'][number];
type Verdict = Today['verdicts'][number];

const STATUS: Record<Verdict['outcome'], string> = {
  pass: 'Passed',
  fail: 'Not passed',
  pending: 'Checking',
};

export function TaskRow({ task, verdict }: { task: Task; verdict: Verdict | undefined }) {
  const c = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.title, { color: c.text }]}>{task.full.title}</Text>
      <Text style={[styles.criteria, { color: c.muted }]}>{task.full.criteria}</Text>
      <View style={styles.meta}>
        <Text style={[styles.metaText, { color: c.muted }]}>
          Earns {formatDuration(task.full.seconds)}
        </Text>
        <Text style={[styles.metaText, { color: c.text }]}>
          {verdict ? STATUS[verdict.outcome] : 'Not checked yet'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: space.md,
    gap: space.xs,
  },
  title: { fontSize: 17, fontWeight: '600' },
  criteria: { fontSize: 15, lineHeight: 21 },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
  },
  metaText: { fontSize: 14 },
});
```

`apps/mobile/src/screens/today/index.tsx`:

```tsx
import { Link } from 'expo-router';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { formatDayLabel, formatDuration, formatTime, localOffsetMinutes } from '@/lib/format';
import type { SyncReport } from '@/lib/store/types';
import { space, usePalette } from '@/theme';
import { TaskRow } from './task-row';
import { useToday } from './use-today';

const DAY_KIND: Record<string, string> = { bad: 'Bad day', away: 'Away' };

function syncBanner(report: SyncReport | null, savedAt: number | null) {
  if (report === null || report.status === 'ok' || report.status === 'unauthorized') return null;
  const when =
    savedAt === null
      ? ''
      : ` Showing what was saved at ${formatTime(savedAt, localOffsetMinutes(savedAt))}.`;
  const reason = report.status === 'offline' ? 'Offline.' : 'The server had a problem.';
  return `${reason}${when}`;
}

export function TodayScreen() {
  const c = usePalette();
  const { forgetPairing } = useApp();
  const { loaded, syncing, saved, balanceSeconds, lastSync, refresh } = useToday();

  if (!loaded || (saved === null && (syncing || lastSync === null))) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} />
        <Text style={[styles.muted, { color: c.muted }]}>Loading today…</Text>
      </View>
    );
  }

  if (lastSync?.status === 'unauthorized') {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Banner
          tone="danger"
          message="The server no longer knows this phone. Pair it again to keep syncing."
          action={{ label: 'Pair again', onPress: () => void forgetPairing() }}
        />
      </View>
    );
  }

  if (saved === null) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>
          Can't load today
        </Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          Check the connection, then try again.
        </Text>
        <Button testID="retry" label="Retry" onPress={() => void refresh()} />
      </View>
    );
  }

  const { today } = saved;
  const banner = syncBanner(lastSync, saved.savedAt);
  const verdictFor = (taskId: string) => today.verdicts.find((v) => v.taskId === taskId);
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.body}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void refresh()} />}
    >
      {banner !== null && <Banner tone="warning" message={banner} />}
      <View style={styles.hero}>
        <Text style={[styles.caption, { color: c.muted }]}>Time left</Text>
        <Text testID="balance" style={[styles.balance, { color: c.text }]}>
          {formatDuration(balanceSeconds)}
        </Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          Earned today {formatDuration(today.earnedTodaySeconds)}
        </Text>
      </View>
      <View style={styles.dayRow}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>
          {formatDayLabel(today.day)}
        </Text>
        {today.dayRecord && DAY_KIND[today.dayRecord.kind] && (
          <Text style={[styles.caption, { color: c.muted }]}>{DAY_KIND[today.dayRecord.kind]}</Text>
        )}
      </View>
      {today.plan === null || today.plan.tasks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No plan for today</Text>
          <Text style={[styles.muted, { color: c.muted }]}>
            Plans you lock for a day show up here with what each task earns.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {today.plan.status === 'draft' && (
            <Text style={[styles.caption, { color: c.muted }]}>Draft plan, not locked yet</Text>
          )}
          {today.plan.tasks.map((task) => (
            <TaskRow key={task.id} task={task} verdict={verdictFor(task.id)} />
          ))}
        </View>
      )}
      <Link
        href="/diagnostics"
        testID="diagnostics-link"
        style={[styles.link, { color: c.accent }]}
      >
        Diagnostics
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    gap: space.md,
  },
  body: { padding: space.md, gap: space.lg },
  hero: { gap: space.xs, paddingTop: space.sm },
  caption: { fontSize: 14, fontWeight: '500' },
  balance: { fontSize: 44, fontWeight: '700', fontVariant: ['tabular-nums'] },
  muted: { fontSize: 15, lineHeight: 21, textAlign: 'auto' },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  heading: { fontSize: 20, fontWeight: '600' },
  empty: { gap: space.xs },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  list: { gap: space.sm },
  link: { fontSize: 15, paddingVertical: space.md, textAlign: 'center' },
});
```

`apps/mobile/src/screens/diagnostics.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { formatTime, localOffsetMinutes } from '@/lib/format';
import type { SyncReport } from '@/lib/store/types';
import { space, usePalette } from '@/theme';

type Facts = { pending: number; dead: number; cursor: number; lastSync: SyncReport | null };

export function DiagnosticsScreen() {
  const c = usePalette();
  const { services, session } = useApp();
  const [facts, setFacts] = useState<Facts | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [counts, cursor, lastSync] = await Promise.all([
      services.store.counts(),
      services.store.cursor(),
      services.store.lastSync(),
    ]);
    setFacts({ ...counts, cursor, lastSync });
  }, [services]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncNow = async () => {
    setBusy(true);
    await services.syncer.sync().catch(() => undefined);
    await load();
    setBusy(false);
  };

  const last = facts?.lastSync;
  const rows: [string, string, string?][] = [
    ['Server', services.apiUrl.replace(/^https?:\/\//, '')],
    ['Device', session.status === 'paired' ? session.deviceId.slice(0, 8) : 'not paired'],
    ['Waiting to send', String(facts?.pending ?? '…'), 'pending-count'],
    ['Could not send', String(facts?.dead ?? '…')],
    ['Ledger position', String(facts?.cursor ?? '…')],
    [
      'Last sync',
      last ? `${formatTime(last.at, localOffsetMinutes(last.at))} · ${last.status}` : 'never',
    ],
    ['App version', Constants.expoConfig?.version ?? 'unknown'],
  ];
  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.body}>
      {rows.map(([label, value, testID]) => (
        <View key={label} style={[styles.row, { borderColor: c.border }]}>
          <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
          <Text testID={testID} style={[styles.value, { color: c.text }]}>
            {value}
          </Text>
        </View>
      ))}
      <Button
        testID="sync-now"
        label={busy ? 'Syncing…' : 'Sync now'}
        onPress={syncNow}
        disabled={busy}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 15 },
  value: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
```

Routes (`src/app/*`), each a thin wrapper:

```tsx
// src/app/_layout.tsx
import { AppProvider } from '@/lib/app';
import { createServices } from '@/lib/services';
import { RootStack } from '@/screens/root-stack';

export default function RootLayout() {
  return (
    <AppProvider load={createServices}>
      <RootStack />
    </AppProvider>
  );
}
```

```tsx
// src/app/index.tsx
import { TodayScreen } from '@/screens/today';
export default TodayScreen;
```

```tsx
// src/app/pair.tsx
import { PairScreen } from '@/screens/pair';
export default PairScreen;
```

```tsx
// src/app/diagnostics.tsx
import { DiagnosticsScreen } from '@/screens/diagnostics';
export default DiagnosticsScreen;
```

- [ ] **Step 9: Run the screen tests to verify they pass**

Run: `cd apps/mobile && bun x jest test/screens.test.tsx`
Expected: PASS 9/9. If `Stack.Protected` doesn't redirect under `renderRouter`, rule on an explicit `<Redirect href="/pair" />` in the Today route and `<Redirect href="/" />` in the Pair route (keep `Stack.Protected` too), and ledger it.

- [ ] **Step 10: Run the whole mobile suite with coverage**

Run: `cd apps/mobile && bun x jest --coverage 2>&1 | tail -30`
Expected: all pass, and global coverage ≥ 80% on lines, branches, functions and statements. If a file is under 80%, add the missing behavior test. Don't lower the threshold.

- [ ] **Step 11: Bundle check with the CAS fence (local, low memory)**

Run: `cd apps/mobile && EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 NODE_OPTIONS=--max-old-space-size=640 timeout 900 bun x expo export --platform android --max-workers 1 --output-dir /tmp/claude-1000/-home-yasreb-projects-mflow/0ebdf3c2-185b-480e-87b8-2d5d4bcd0aa7/scratchpad/expo-spike/p4a`
Expected: `Exported:` with one `.hbc` file, under 5 MB.

- [ ] **Step 12: Commit**

```bash
git add apps/mobile
git commit -m "feat: add pairing, Today and Diagnostics screens over the local store and sync"
```

---

### Task 8: Cloud builds and emulator tests

**Files:**

- Create: `.github/workflows/android-e2e.yml`, `apps/mobile/e2e/run.sh`, `apps/mobile/e2e/flows/pair-and-today.yaml`, `apps/mobile/eas.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: the testIDs from Task 7, the API's `migrate:local` script, and `SETUP_CODE` from `.dev.vars`.

- [ ] **Step 1: Add the Android bundle job to CI**

Append to `.github/workflows/ci.yml` under `jobs:`:

```yaml
android-bundle:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version-file: package.json
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc
    - run: bun install --frozen-lockfile
    - name: Bundle for Android (Metro + Hermes)
      working-directory: apps/mobile
      env:
        EXPO_PUBLIC_API_URL: https://example.invalid
      run: |
        bun x expo export --platform android --output-dir dist-android
        find dist-android -name '*.hbc' -printf '%s bytes %p\n'
        test -n "$(find dist-android -name '*.hbc')"
```

- [ ] **Step 2: Write the Maestro flow and the runner script**

`apps/mobile/e2e/flows/pair-and-today.yaml`:

```yaml
appId: com.bahiryasreb.futureflow
---
- launchApp:
    clearState: true
- assertVisible: 'Pair this phone'
- takeScreenshot: 01-pair
- tapOn:
    id: 'setup-code'
- inputText: 'e2e-setup-code-0123456789'
- hideKeyboard
- tapOn:
    id: 'pair-button'
- extendedWaitUntil:
    visible:
      id: 'balance'
    timeout: 20000
- assertVisible: 'Time left'
- takeScreenshot: 02-today
- tapOn:
    id: 'diagnostics-link'
- assertVisible: 'Waiting to send'
- takeScreenshot: 03-diagnostics
```

`apps/mobile/e2e/run.sh`:

```bash
#!/usr/bin/env bash
# Runs inside the emulator step: install the release APK, then the Maestro flows.
set -euo pipefail
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
adb install -r "$APK"
mkdir -p e2e-out
cd e2e-out
"$HOME/.maestro/bin/maestro" test ../apps/mobile/e2e/flows --format junit --output report.xml
```

`chmod +x apps/mobile/e2e/run.sh`.

- [ ] **Step 3: Write the emulator workflow**

`.github/workflows/android-e2e.yml`:

```yaml
name: Android e2e

on:
  pull_request:
    paths:
      - 'apps/mobile/**'
      - 'apps/api/**'
      - 'packages/**'
      - 'bun.lock'
      - '.github/workflows/android-e2e.yml'
  workflow_dispatch:

concurrency:
  group: android-e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: package.json
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
          cache: gradle
      - run: bun install --frozen-lockfile

      - name: Start the Worker locally (throwaway setup code)
        working-directory: apps/api
        run: |
          printf 'SETUP_CODE=e2e-setup-code-0123456789\n' > .dev.vars
          bun run migrate:local
          nohup bun x wrangler dev --port 8787 > ../../wrangler.log 2>&1 &
          for i in $(seq 1 60); do
            code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/v1/today || true)
            [ "$code" = "401" ] && echo "Worker up" && exit 0
            sleep 2
          done
          echo "Worker did not start"; cat ../../wrangler.log; exit 1

      - name: Build the release APK for the emulator
        working-directory: apps/mobile
        env:
          E2E: '1'
          EXPO_PUBLIC_API_URL: http://10.0.2.2:8787
        run: |
          bun x expo prebuild --platform android --no-install
          cd android && ./gradlew :app:assembleRelease --no-daemon -PreactNativeArchitectures=x86_64

      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
          sudo udevadm control --reload-rules
          sudo udevadm trigger --name-match=kvm

      - name: Install Maestro
        run: curl -fsSL https://get.maestro.mobile.dev | bash

      - name: Run Maestro on an emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          arch: x86_64
          target: google_apis
          disable-animations: true
          emulator-options: -no-window -gpu swiftshader_indirect -noaudio -no-boot-anim -camera-back none
          script: ./apps/mobile/e2e/run.sh

      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: android-e2e
          path: |
            e2e-out/
            wrangler.log
          if-no-files-found: warn
```

- [ ] **Step 4: Write the EAS profile**

`apps/mobile/eas.json`:

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "preview": {
      "distribution": "internal",
      "environment": "preview",
      "android": { "buildType": "apk" }
    }
  }
}
```

The preview build reads `EXPO_PUBLIC_API_URL` from the EAS "preview" environment (set once with `bun x eas-cli env:create`). It's never committed.

- [ ] **Step 5: Check the YAML and scripts locally**

Run: `bun x prettier --check .github apps/mobile/e2e apps/mobile/eas.json && bash -n apps/mobile/e2e/run.sh`
Expected: no errors.

- [ ] **Step 6: Commit and run it in the cloud**

```bash
git add .github apps/mobile/e2e apps/mobile/eas.json
git commit -m "ci: bundle the app for Android and drive it on an emulator against a local Worker"
git push -u origin feat/p4a-mobile-foundation
gh pr create --draft --base chore/rename-futureflow --title "feat: P4a mobile foundation" --body "Draft: CI and emulator runs in progress."
```

Then: `gh run watch` the `CI` and `Android e2e` runs. When e2e finishes, run `gh run download <run-id> -n android-e2e -D <scratchpad>/e2e` and Read each PNG.
Expected: both workflows green. The three screenshots show the Pair screen, Today with "Time left" and a balance, and Diagnostics. A failing run is debugged from its log and `wrangler.log`. Each fix is a new commit; record every ruling in the ledger.

---

### Task 9: ADR 0011, README and memory

**Files:**

- Create: `docs/adr/0011-mobile-local-first.md`
- Modify: `README.md`

- [ ] **Step 1: Write ADR 0011**

`docs/adr/0011-mobile-local-first.md` covers:

- **Status:** Accepted, 2026-10-14.
- **Context:** the phone enforces offline (spec §4.3); the dev machine has 1.8 GB of RAM.
- **Decision:**
  - SQLite holds the outbox, dead letters, confirmed ledger and key-value data (the today snapshot is the spec's "plan cache"; "settings" are key-value data).
  - The local balance is `balance(mergeEvents(confirmed, pending))`.
  - Sync order is push → today → pull, single-flight and bounded to 20 rounds.
  - Refused events (future timestamps, contract refusals) go to dead letters, never retried.
  - Pairing invents the token on the phone and saves it before the request.
  - SecureStore holds only the token and the device id.
  - Hexagonal ports, with a `node:sqlite` shim so Jest runs the real SQL.
  - No TanStack Query: the local store is the source of truth, and the app reads it after each sync.
- **CAS:**
  - not in the phone bundle in P4a (Metro can't transform it on this machine)
  - the lint rule fences it out
  - P4c decides between a lighter checker, bundling only in the cloud, or more WSL memory
- **Testing:**
  - Jest and RNTL 13.3 (Expo Router's `renderRouter`)
  - GitHub Actions bundles for Android
  - GitHub Actions runs Maestro on an emulator against `wrangler dev`, with screenshots as artifacts
  - EAS Build makes the installable APK; Maestro jobs on EAS need the paid plan
- **Tooling:** the hoisted Bun linker, plus the root Babel 7 pin.
- **Consequences:**
  - The spec's "balance unknown → base allowance" belongs to the guard (P5). Today shows loading or Retry until the first sync.
  - Dead letters only appear in Diagnostics for now.

- [ ] **Step 2: README**

Add a "Phone app" section to `README.md`:

```markdown
## Phone app (apps/mobile)

    cp apps/mobile/.env.example apps/mobile/.env   # EXPO_PUBLIC_API_URL
    bun run --cwd apps/api dev                       # local Worker on :8787 (needs SETUP_CODE in .dev.vars)
    bun run --cwd apps/mobile start                  # Expo dev server; open in Expo Go or the emulator

- Tests: `bun run --cwd apps/mobile test` (Jest, real SQL via node:sqlite).
- CI bundles the app for Android, and the `Android e2e` workflow pairs with a local Worker on an emulator,
  saving screenshots as the `android-e2e` artifact.
- Installable APK: `bun x eas-cli login`, then in apps/mobile `bun x eas-cli init`,
  `bun x eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://<worker-url> --visibility plaintext`
  and `bun x eas-cli build -p android --profile preview` (free plan: 15 Android builds a month).
```

Check that `apps/api/package.json` has a `dev` script. If it doesn't, write `bun x wrangler dev --cwd apps/api` instead.

- [ ] **Step 3: Format, full check, commit**

Run: `bun x prettier --write docs README.md && bun run format:check && bun run lint && bun run typecheck && bun run test`
Expected: green.

```bash
git add docs/adr/0011-mobile-local-first.md README.md docs/superpowers/plans/2026-10-14-p4a-mobile-foundation.md
git commit -m "docs: record the local-first mobile design (ADR 0011) and phone app setup"
```
