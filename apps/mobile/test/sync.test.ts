import type { LedgerEvent } from '@futureflow/core';
import type { ApiFailure, ApiResult, LedgerPage, LedgerSyncResult, Today } from '@/lib/api/client';
import { migrate } from '@/lib/store/migrations';
import { sqliteStore } from '@/lib/store/sqlite-store';
import { createSyncer, syncOnce, type SyncDeps } from '@/lib/sync';
import { ledgerEvent, NOW, sampleToday } from './support/fakes';
import { nodeSqlDb } from './support/node-sql';

type Script = {
  push?: (events: readonly LedgerEvent[]) => ApiResult<LedgerSyncResult>;
  attempts?: (attempts: readonly { id: string }[]) => ApiResult<LedgerSyncResult>;
  pull?: (since: number) => ApiResult<LedgerPage>;
  today?: () => ApiResult<Today>;
};

const takeAll = (events: readonly { id: string }[]): ApiResult<LedgerSyncResult> => ({
  ok: true,
  data: { added: events.map((e) => e.id), ignored: [], rejected: [] },
});
const emptyPage = (since: number): ApiResult<LedgerPage> => ({
  ok: true,
  data: { events: [], next: since },
});
const failure = (error: ApiFailure): ApiResult<never> => ({ ok: false, error });

async function setup(script: Script = {}) {
  const db = nodeSqlDb();
  await migrate(db);
  const store = sqliteStore(db);
  const calls = { push: [] as number[], pull: [] as number[], today: 0, attempts: [] as number[] };
  const api: SyncDeps['api'] = {
    pushMathAttempts: async (attempts) => {
      calls.attempts.push(attempts.length);
      return (script.attempts ?? takeAll)(attempts);
    },
    pushEvents: async (events) => {
      calls.push.push(events.length);
      return (script.push ?? takeAll)(events);
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
  const [a, b] = many(2) as [LedgerEvent, LedgerEvent];
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
    push: () =>
      failure({
        kind: 'rejected',
        status: 400,
        code: 'invalid_request',
        message: 'The request is invalid.',
      }),
  });
  await store.enqueue(many(2));
  expect(await syncOnce(deps)).toMatchObject({ status: 'ok', buried: 2 });
  expect(await store.counts()).toEqual({ pending: 0, dead: 2 });
  expect([calls.today, calls.pull.length]).toEqual([1, 1]);
});

test.each([
  ['offline', { kind: 'network' }],
  ['server_error', { kind: 'server', status: 500, code: 'internal', message: 'x' }],
  ['server_error', { kind: 'rejected', status: 429, code: 'rate_limited', message: 'x' }],
  ['invalid_response', { kind: 'invalid_response' }],
] as const)('stops as %s without losing the outbox or calling further', async (status, error) => {
  const { deps, store, calls } = await setup({ push: () => failure(error) });
  await store.enqueue(many(2));
  expect((await syncOnce(deps)).status).toBe(status);
  expect(await store.counts()).toEqual({ pending: 2, dead: 0 });
  expect([calls.today, calls.pull.length]).toEqual([0, 0]);
});

test('401 keeps the outbox and reports unauthorized', async () => {
  const { deps, store } = await setup({
    push: () => failure({ kind: 'rejected', status: 401, code: 'unauthorized', message: 'x' }),
  });
  await store.enqueue(many(1));
  expect((await syncOnce(deps)).status).toBe('unauthorized');
  expect(await store.counts()).toEqual({ pending: 1, dead: 0 });
});

test('saves the today snapshot, and a today failure stops before the pull', async () => {
  const ok = await setup();
  await syncOnce(ok.deps);
  expect(await ok.store.savedToday()).toEqual({ today: sampleToday(), savedAt: NOW });

  const down = await setup({ today: () => failure({ kind: 'network' }) });
  expect((await syncOnce(down.deps)).status).toBe('offline');
  expect(down.calls.pull).toEqual([]);
});

test('an unexpected refusal of a read stops as invalid_response', async () => {
  const { deps } = await setup({
    pull: () => failure({ kind: 'rejected', status: 400, code: 'invalid_request', message: 'x' }),
  });
  expect((await syncOnce(deps)).status).toBe('invalid_response');
});

test('pulls pages until a short page and resumes from the saved cursor', async () => {
  const pages: Record<number, LedgerPage> = {
    0: { events: many(500), next: 500 },
    500: { events: [ledgerEvent(501)], next: 501 },
    501: { events: [], next: 501 },
  };
  const { deps, store, calls } = await setup({
    pull: (since) => ({ ok: true, data: pages[since] ?? { events: [], next: since } }),
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

test('a refused batch is split until only the bad event is buried', async () => {
  const events = many(5);
  const bad = events[2]!.id;
  const { deps, store } = await setup({
    push: (batch) =>
      batch.some((e) => e.id === bad)
        ? failure({ kind: 'rejected', status: 400, code: 'invalid_request', message: 'x' })
        : takeAll(batch),
  });
  await store.enqueue(events);
  expect(await syncOnce(deps)).toMatchObject({ status: 'ok', pushed: 4, buried: 1 });
  expect(await store.counts()).toEqual({ pending: 0, dead: 1 });
});

test('an unexpected refusal (404 from a wrong address) buries nothing', async () => {
  const { deps, store } = await setup({
    push: () => failure({ kind: 'rejected', status: 404, code: 'not_found', message: 'x' }),
  });
  await store.enqueue(many(2));
  expect((await syncOnce(deps)).status).toBe('invalid_response');
  expect(await store.counts()).toEqual({ pending: 2, dead: 0 });
});

test('an accepted event stays in the balance when the rest of the sync fails', async () => {
  const { deps, store } = await setup({ today: () => failure({ kind: 'network' }) });
  await store.enqueue([ledgerEvent(1)]);
  expect((await syncOnce(deps)).status).toBe('offline');
  expect([await store.pending(), await store.confirmed()]).toEqual([[], [ledgerEvent(1)]]);
});

test('the ledger is complete after a short page, and not after a cut-off pull', async () => {
  const done = await setup();
  await syncOnce(done.deps);
  expect(await done.store.ledgerComplete()).toBe(true);

  let next = 0;
  const endless = await setup({
    pull: () => {
      next += 500;
      return { ok: true, data: { events: many(500), next } };
    },
  });
  await syncOnce(endless.deps);
  expect(endless.calls.pull).toHaveLength(20);
  expect(await endless.store.ledgerComplete()).toBe(false);
});

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

const mathAttempt = (i: number) => ({
  id: `01920000-0000-7000-8000-${String(900 + i).padStart(12, '0')}`,
  day: '2026-10-14',
  at: NOW - 1000 + i,
  topicId: 'fractions',
  difficulty: 3,
  correct: true,
  answerType: 'typed' as const,
});

test('math attempts are pushed and marked sent', async () => {
  const { deps, store, calls } = await setup();
  await store.saveAttempt(mathAttempt(1));
  await store.saveAttempt(mathAttempt(2));
  expect((await syncOnce(deps)).status).toBe('ok');
  expect(calls.attempts).toEqual([2]);
  expect(await store.unsentAttempts()).toEqual([]);
  await syncOnce(deps);
  expect(calls.attempts).toEqual([2]);
});

test('future-dated attempts the server refuses are not retried', async () => {
  const { deps, store } = await setup({
    attempts: (attempts) => ({
      ok: true,
      data: {
        added: [],
        ignored: [],
        rejected: attempts.map((a) => ({ id: a.id, reason: 'future_timestamp' as const })),
      },
    }),
  });
  await store.saveAttempt(mathAttempt(1));
  await syncOnce(deps);
  expect(await store.unsentAttempts()).toEqual([]);
});

test('an offline attempt push keeps them unsent and stops the sync', async () => {
  const { deps, store, calls } = await setup({ attempts: () => failure({ kind: 'network' }) });
  await store.saveAttempt(mathAttempt(1));
  expect((await syncOnce(deps)).status).toBe('offline');
  expect(await store.unsentAttempts()).toEqual([mathAttempt(1)]);
  expect(calls.today).toBe(0);
});
