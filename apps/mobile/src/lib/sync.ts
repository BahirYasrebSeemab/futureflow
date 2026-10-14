import { MAX_EVENTS_PER_BATCH } from '@futureflow/contracts';
import type { LedgerEvent } from '@futureflow/core';
import type { Api, ApiFailure } from './api/client';
import type { LocalStore, SyncReport, SyncStatus } from './store/types';

export const PUSH_BATCH = MAX_EVENTS_PER_BATCH;
export const PULL_PAGE = MAX_EVENTS_PER_BATCH;
/** Bounds each loop: 20 × 500 events per sync is far beyond a day's traffic. */
export const MAX_ROUNDS = 20;

export type SyncDeps = Readonly<{
  api: Pick<Api, 'pushEvents' | 'today' | 'pullLedger'>;
  store: LocalStore;
  now: () => number;
}>;

type Stop = Exclude<SyncStatus, 'ok'>;
type Pushed = { stop: Stop | null; pushed: number; buried: number };
type Pulled = { stop: Stop | null; pulled: number };

/**
 * Refusals that mean "this data breaks the contract": the batch is split in halves until only the
 * offending events are left, and those are set aside. Any other refusal (a wrong address, an unknown
 * route) is a setup problem, so it stops the sync and buries nothing.
 */
const SPLITTABLE: ReadonlySet<string> = new Set(['invalid_request', 'payload_too_large']);
const isBadData = (error: ApiFailure): boolean =>
  error.kind === 'rejected' && SPLITTABLE.has(error.code);

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

async function sendBatch(deps: SyncDeps, batch: readonly LedgerEvent[]): Promise<Pushed> {
  const result = await deps.api.pushEvents(batch);
  if (!result.ok) {
    if (!isBadData(result.error)) return { stop: stopFor(result.error), pushed: 0, buried: 0 };
    if (batch.length === 1) {
      const reason = result.error.kind === 'rejected' ? result.error.code : 'refused';
      await deps.store.bury([batch[0]!.id], `refused:${reason}`, deps.now());
      return { stop: null, pushed: 0, buried: 1 };
    }
    const middle = Math.ceil(batch.length / 2);
    const first = await sendBatch(deps, batch.slice(0, middle));
    if (first.stop !== null) return first;
    const second = await sendBatch(deps, batch.slice(middle));
    return {
      stop: second.stop,
      pushed: first.pushed + second.pushed,
      buried: first.buried + second.buried,
    };
  }
  const { added, ignored, rejected } = result.data;
  const refused = rejected.map((r) => r.id);
  if (added.length + ignored.length + refused.length === 0) {
    return { stop: 'invalid_response', pushed: 0, buried: 0 };
  }
  await deps.store.settle(added, ignored);
  if (refused.length > 0) await deps.store.bury(refused, 'future_timestamp', deps.now());
  return { stop: null, pushed: added.length + ignored.length, buried: refused.length };
}

async function push(deps: SyncDeps): Promise<Pushed> {
  let pushed = 0;
  let buried = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const batch = await deps.store.pending(PUSH_BATCH);
    if (batch.length === 0) break;
    const sent = await sendBatch(deps, batch);
    pushed += sent.pushed;
    buried += sent.buried;
    if (sent.stop !== null) return { stop: sent.stop, pushed, buried };
  }
  return { stop: null, pushed, buried };
}

async function refreshToday(deps: SyncDeps): Promise<Stop | null> {
  const result = await deps.api.today();
  if (!result.ok) return stopFor(result.error);
  await deps.store.saveToday({ today: result.data, savedAt: deps.now() });
  return null;
}

async function pull(deps: SyncDeps): Promise<Pulled> {
  let pulled = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const since = await deps.store.cursor();
    const result = await deps.api.pullLedger(since, PULL_PAGE);
    if (!result.ok) return { stop: stopFor(result.error), pulled };
    const complete = result.data.events.length < PULL_PAGE;
    await deps.store.applyPage(result.data.events, result.data.next, complete);
    pulled += result.data.events.length;
    if (complete) break;
    // A full page that doesn't move the cursor would be fetched again and again.
    if (result.data.next <= since) return { stop: 'invalid_response', pulled };
  }
  return { stop: null, pulled };
}

/** Push, then today (it may write the base grant), then pull, so the pull brings the grant back. */
export async function syncOnce(deps: SyncDeps): Promise<SyncReport> {
  const sent = await push(deps);
  let status: SyncStatus = sent.stop ?? 'ok';
  let pulled = 0;
  if (status === 'ok') status = (await refreshToday(deps)) ?? 'ok';
  if (status === 'ok') {
    const page = await pull(deps);
    pulled = page.pulled;
    status = page.stop ?? 'ok';
  }
  const report: SyncReport = {
    status,
    pushed: sent.pushed,
    buried: sent.buried,
    pulled,
    at: deps.now(),
  };
  await deps.store.saveSync(report);
  return report;
}

export type Syncer = Readonly<{
  sync(): Promise<SyncReport>;
  /** Resolves once no sync is running (at once if none is). */
  idle(): Promise<void>;
}>;

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
    idle: () =>
      running === null
        ? Promise.resolve()
        : running.then(
            () => undefined,
            () => undefined,
          ),
  };
}
