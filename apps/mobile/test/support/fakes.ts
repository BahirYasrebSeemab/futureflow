import type { SpendSession } from '@/lib/guard/spend';
import {
  noGuard,
  type Guard,
  type GuardClock,
  type GuardSettings,
  type GuardStatus,
  type InstalledApp,
} from '@/lib/guard/types';
import { DEFAULT_RULES, type LedgerEvent } from '@futureflow/core';
import { randomBytes } from 'node:crypto';
import type { Api, Today } from '@/lib/api/client';
import type { AppServices } from '@/lib/app';
import { makeIds } from '@/lib/ids';
import type { Locator } from '@/lib/location';
import type { SecretStore } from '@/lib/secrets';
import { migrate } from '@/lib/store/migrations';
import { sqliteStore } from '@/lib/store/sqlite-store';
import { createSyncer } from '@/lib/sync';
import { nodeSqlDb } from './node-sql';

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

export const PAIRED = {
  device_token: 'A'.repeat(43),
  device_id: '01920000-0000-7000-8000-0000000000d1',
};

const OFFLINE = { ok: false, error: { kind: 'network' } } as const;

/** Real store (node:sqlite) and syncer, with a scripted API and memory secrets. */
export async function testServices(
  api: Partial<Api> = {},
  secrets: Record<string, string> = {},
  options: { locator?: Locator; guard?: Guard } = {},
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
    getPlan: async () => ({ ok: true, data: null }),
    getRoadmap: async () => ({ ok: true, data: null }),
    savePlan: async () => OFFLINE,
    proposePlan: async () => OFFLINE,
    lockPlan: async () => OFFLINE,
    declareBadDay: async () => OFFLINE,
    declareAway: async () => OFFLINE,
    sendAwayVerdict: async () => OFFLINE,
    decideVerdict: async () => OFFLINE,
    sendReading: async () => OFFLINE,
    coachMessages: async (since) => ({ ok: true, data: { messages: [], next: since } }),
    sendCoachMessage: async () => OFFLINE,
    saveRoadmap: async () => OFFLINE,
    getGithubLink: async () => ({ ok: true, data: null }),
    linkGithub: async () => OFFLINE,
    unlinkGithub: async () => OFFLINE,
    getBank: async (since) => ({ ok: true, data: { problems: [], next: since } }),
    pushMathAttempts: async (attempts) => ({
      ok: true,
      data: { added: attempts.map((a) => a.id), ignored: [], rejected: [] },
    }),
    ...api,
  };
  const now = () => NOW;
  const ids = makeIds((n) => new Uint8Array(randomBytes(n)));
  const guard = options.guard ?? noGuard;
  return {
    api: fullApi,
    store,
    secrets: memorySecrets(secrets),
    ids,
    syncer: createSyncer({ api: fullApi, store, now, guard: { native: guard, newId: ids.newId } }),
    locator: options.locator ?? { coarse: async () => null },
    guard,
    now,
    apiUrl: 'https://api.test',
    extraBlocked: [],
    unlockWaitSeconds: DEFAULT_RULES.unlockWaitSeconds,
  };
}

/** A guard that records what the app tells it; `sessions` is what it has counted. */
export function fakeGuard(
  overrides: Partial<Guard> & {
    sessions?: SpendSession[];
    enabled?: boolean;
    /** Status fields to change (named apart from `Guard.status`, which overrides replace). */
    state?: Partial<GuardStatus>;
    installed?: InstalledApp[];
  } = {},
) {
  const { sessions, enabled, state, installed, ...methods } = overrides;
  /** The monotonic clock; tests move it with `tick`. */
  const clock = { elapsed: 0, bootId: '1' };
  const calls = {
    commit: [] as [number, number][],
    included: [] as string[][],
    grants: [] as [string, number][],
    blocked: [] as [string[], boolean][],
    domains: [] as string[][],
    settings: [] as GuardSettings[],
    linked: [] as [string, string][],
    unlinked: 0,
    notificationRequests: 0,
  };
  let status: GuardStatus = {
    available: true,
    enabled: enabled ?? true,
    connected: enabled ?? true,
    foreground: enabled ?? true,
    notifications: true,
    batteryUnrestricted: true,
    xiaomi: false,
    usageAccess: true,
    ...state,
  };
  const guard: Guard = {
    status: async () => status,
    setBlockedApps: async (packages, blockGames) => {
      calls.blocked.push([[...packages], blockGames]);
    },
    setBlockedDomains: async (domains) => {
      calls.domains.push([...domains]);
    },
    pendingSpend: async () => sessions ?? [],
    commit: async (watermark, balance, included) => {
      calls.commit.push([watermark, balance]);
      calls.included.push([...included].sort());
    },
    grant: async (id, seconds) => {
      calls.grants.push([id, seconds]);
    },
    clock: async (): Promise<GuardClock> => ({ ...clock }),
    installedApps: async () => installed ?? [],
    openSettings: async (kind) => {
      calls.settings.push(kind);
    },
    requestNotifications: async () => {
      calls.notificationRequests++;
      status = { ...status, notifications: true };
      return true;
    },
    link: async (apiUrl, token) => {
      calls.linked.push([apiUrl, token]);
    },
    unlink: async () => {
      calls.unlinked++;
    },
    ...methods,
  };
  const tick = (ms: number) => {
    clock.elapsed += ms;
  };
  const reboot = () => {
    clock.elapsed = 1_000;
    clock.bootId = String(Number(clock.bootId) + 1);
  };
  return { guard, calls, tick, reboot };
}
