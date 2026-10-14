import { MAX_EVENTS_PER_BATCH } from '@futureflow/contracts';
import type { Api, ApiFailure } from './api/client';
import type { LocalStore, SyncReport, SyncStatus } from './store/types';

export const PUSH_BATCH = MAX_EVENTS_PER_BATCH;
export const PULL_PAGE = MAX_EVENTS_PER_BATCH;
/** Bounds each loop: 20 × 500 events per sync is far beyond a day's traffic. */
export const MAX_ROUNDS = 20;

export type SyncDeps = Readonly<{ api: Api; store: LocalStore; now: () => number }>;

type Stop = Exclude<SyncStatus, 'ok'>;
type Pushed = { stop: Stop | null; pushed: number; buried: number };
type Pulled = { stop: Stop | null; pulled: number };

type Refusal = Extract<ApiFailure, { kind: 'rejected' }>;
const RETRYABLE_REFUSALS: ReadonlySet<string> = new Set(['unauthorized', 'rate_limited']);

/** A refusal that will repeat forever: our own data fails the contract. */
const isFinalRefusal = (error: ApiFailure): error is Refusal =>
  error.kind === 'rejected' && !RETRYABLE_REFUSALS.has(error.code);

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

async function push(deps: SyncDeps): Promise<Pushed> {
  let pushed = 0;
  let buried = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const batch = await deps.store.pending(PUSH_BATCH);
    if (batch.length === 0) break;
    const result = await deps.api.pushEvents(batch);
    if (!result.ok) {
      if (!isFinalRefusal(result.error)) return { stop: stopFor(result.error), pushed, buried };
      // Retrying can never succeed, so keep the events aside instead of blocking the queue.
      const ids = batch.map((e) => e.id);
      await deps.store.bury(ids, `refused:${result.error.code}`, deps.now());
      buried += ids.length;
      continue;
    }
    const sent = [...result.data.added, ...result.data.ignored];
    const refused = result.data.rejected.map((r) => r.id);
    if (sent.length + refused.length === 0) return { stop: 'invalid_response', pushed, buried };
    await deps.store.settle(sent);
    if (refused.length > 0) await deps.store.bury(refused, 'future_timestamp', deps.now());
    pushed += sent.length;
    buried += refused.length;
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
    const result = await deps.api.pullLedger(await deps.store.cursor(), PULL_PAGE);
    if (!result.ok) return { stop: stopFor(result.error), pulled };
    await deps.store.applyPage(result.data.events, result.data.next);
    pulled += result.data.events.length;
    if (result.data.events.length < PULL_PAGE) break;
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
