import type { LedgerEvent, TaskSpec } from '@mflow/core';
import { env } from 'cloudflare:test';
import { v7 as uuidv7 } from 'uuid';
import { createApp, type AppOptions } from '../src/app';

/** 2026-10-09 12:00 UTC, a Friday. */
export const T0 = Date.UTC(2026, 9, 9, 12, 0, 0);
/** Same value as SETUP_CODE in vitest.config.ts. */
export const TEST_SETUP_CODE = 'test-setup-code-0123456789';

export type Clock = { now: number };
export type Envelope<T> = {
  ok: boolean;
  data: T;
  error: { code: string; message: string } | null;
};
export type Reply<T> = { status: number; body: Envelope<T> };
export type App = ReturnType<typeof createApp>;

export const makeApp = (clock: Clock = { now: T0 }, options: AppOptions = {}): App =>
  createApp({ now: () => clock.now, ...options });

export type CallOptions = Readonly<{
  body?: unknown;
  raw?: string;
  token?: string;
  headers?: Record<string, string>;
  env?: Partial<Cloudflare.Env>;
}>;

export async function call<T = unknown>(
  app: App,
  method: string,
  path: string,
  opts: CallOptions = {},
): Promise<Reply<T>> {
  const headers = new Headers(opts.headers);
  if (opts.token !== undefined) headers.set('authorization', `Bearer ${opts.token}`);
  const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  if (body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const res = await app.request(path, { method, headers, body }, { ...env, ...opts.env });
  return { status: res.status, body: (await res.json()) as Envelope<T> };
}

/** What the phone does: 32 random bytes, base64url (43 characters). */
export const phoneToken = (): string =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

export async function pairDevice(
  app: App,
  opts: { code?: string; utcOffsetMinutes?: number } = {},
): Promise<{ token: string; deviceId: string }> {
  const code = opts.code ?? TEST_SETUP_CODE;
  const token = phoneToken();
  const reply = await call<{ deviceId: string }>(app, 'POST', '/v1/device/pair', {
    body: { code, token, deviceName: 'Redmi A5', utcOffsetMinutes: opts.utcOffsetMinutes ?? 0 },
    env: { SETUP_CODE: code },
  });
  if (reply.status !== 201) throw new Error(`pairing failed with ${reply.status}`);
  return { token, deviceId: reply.body.data.deviceId };
}

export const event = (
  over: Partial<LedgerEvent> & Pick<LedgerEvent, 'kind' | 'seconds'>,
): LedgerEvent => ({ id: uuidv7(), day: '2026-10-09', at: T0, ...over });

export const taskSpec = (title = 'Ship one PR'): TaskSpec => ({
  id: uuidv7(),
  skillId: 'swe',
  when: '20:00 at my desk',
  verifier: 'github',
  full: { title, criteria: 'a merged PR', seconds: 1200 },
  twoMinute: { title: 'Open the repo', criteria: 'one commit', seconds: 300 },
});

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
