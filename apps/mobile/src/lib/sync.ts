import { MAX_ATTEMPTS_PER_BATCH, MAX_EVENTS_PER_BATCH } from '@futureflow/contracts';
import { addDays, type LedgerEvent } from '@futureflow/core';
import type { Api, ApiFailure } from './api/client';
import { spendEvents } from './guard/spend';
import type { Guard } from './guard/types';
import { currentDayKey } from './format';
import { applyBlocklist, blocklistDay } from './guard/apply-blocklist';
import { projectBalance } from './ledger';
import type { LocalStore, SyncReport, SyncStatus } from './store/types';

export const PUSH_BATCH = MAX_EVENTS_PER_BATCH;
export const PULL_PAGE = MAX_EVENTS_PER_BATCH;
/** Bounds each loop: 20 × 500 events per sync is far beyond a day's traffic. */
export const MAX_ROUNDS = 20;

export type SyncDeps = Readonly<{
  api: Pick<Api, 'pushEvents' | 'pushMathAttempts' | 'today' | 'pullLedger' | 'getBank'>;
  store: LocalStore;
  now: () => number;
  /**
   * The native guard: it gets today's blocklist, its spend becomes events, and it learns the
   * balance after each pull. `extraBlocked` is the emulator build's Settings.
   */
  guard?: Readonly<{ native: Guard; newId: () => string; extraBlocked?: readonly string[] }>;
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
  for (const reason of new Set(rejected.map((r) => r.reason))) {
    const ids = rejected.filter((r) => r.reason === reason).map((r) => r.id);
    await deps.store.bury(ids, reason, deps.now());
  }
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

/** Math attempts: everything the server answered for (added, ignored, refused) is done. */
async function pushAttempts(deps: SyncDeps): Promise<Stop | null> {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const batch = await deps.store.unsentAttempts(MAX_ATTEMPTS_PER_BATCH);
    if (batch.length === 0) return null;
    const result = await deps.api.pushMathAttempts(batch);
    if (!result.ok) return stopFor(result.error);
    const { added, ignored, rejected } = result.data;
    const done = [...added, ...ignored, ...rejected.map((r) => r.id)];
    if (done.length === 0) return 'invalid_response';
    await deps.store.markAttemptsSent(done);
  }
  return null;
}

const BANK_PAGE = 50;

/** The word-problem bank is optional: a failure is logged and never changes the sync status. */
async function pullBank(deps: SyncDeps): Promise<void> {
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await deps.api.getBank(await deps.store.bankCursor(), BANK_PAGE);
      if (!result.ok) {
        console.error(JSON.stringify({ event: 'bank_pull_failed', kind: result.error.kind }));
        return;
      }
      await deps.store.saveBankProblems(result.data.problems, result.data.next);
      if (result.data.problems.length < BANK_PAGE) return;
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown';
    console.error(JSON.stringify({ event: 'bank_pull_failed', name }));
  }
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

const logGuardFailure = (event: string, error: unknown) => {
  const name = error instanceof Error ? error.name : 'unknown';
  console.error(JSON.stringify({ event, name }));
};

/** Time spent in blocked apps joins the outbox first, so this same sync sends it. */
/** A pending unblock applies once its day has come, even if the app wasn't opened at 04:00. */
async function refreshBlocklist(deps: SyncDeps): Promise<void> {
  if (deps.guard === undefined) return;
  try {
    const { native, extraBlocked } = deps.guard;
    const day = await blocklistDay(deps.store, deps.now());
    await applyBlocklist(deps.store, native, day, extraBlocked);
  } catch (error) {
    logGuardFailure('guard_blocklist_failed', error);
  }
}

async function collectSpend(deps: SyncDeps): Promise<void> {
  if (deps.guard === undefined) return;
  try {
    const before = await deps.store.spendSeq();
    const sessions = await deps.guard.native.pendingSpend();
    const { events, seq } = spendEvents(sessions, before, deps.guard.newId);
    if (seq > before) await deps.store.enqueueSpend(events, seq);
  } catch (error) {
    logGuardFailure('guard_spend_failed', error);
  }
}

/**
 * Only after a pull that reached the end is the balance today's: before that the guard keeps its
 * own count (and falls back to the base allowance on a new day). Debt reaches it as no time left.
 */
async function commitBalance(deps: SyncDeps): Promise<void> {
  if (deps.guard === undefined) return;
  try {
    const [confirmed, pending] = [await deps.store.confirmed(), await deps.store.pending()];
    const balance = projectBalance(confirmed, pending);
    // The guard drops the unlocks this balance already has, so each counts once.
    // Grants older than yesterday are gone from the guard already; naming them would only grow.
    const since = addDays(currentDayKey(deps.now()), -1);
    const unlocks = [...confirmed, ...pending].filter(
      (e) => e.kind === 'unlock_borrow' && e.day >= since,
    );
    const included = [...new Set(unlocks.map((e) => e.id))];
    await deps.guard.native.commit(await deps.store.spendSeq(), Math.max(0, balance), included);
  } catch (error) {
    logGuardFailure('guard_commit_failed', error);
  }
}

/** Push, then today (it may write the base grant), then pull, so the pull brings the grant back. */
export async function syncOnce(deps: SyncDeps): Promise<SyncReport> {
  await collectSpend(deps);
  const sent = await push(deps);
  let status: SyncStatus = sent.stop ?? 'ok';
  let pulled = 0;
  if (status === 'ok') status = (await refreshToday(deps)) ?? 'ok';
  if (status === 'ok') {
    const page = await pull(deps);
    pulled = page.pulled;
    status = page.stop ?? 'ok';
    // A pull cut off after MAX_ROUNDS ends without an error but short of today's balance.
    if (status === 'ok' && (await deps.store.ledgerComplete())) await commitBalance(deps);
  }
  // Attempts are a record for the server, not money: send them last, so a problem with them
  // never holds up today's plan or the ledger.
  if (status === 'ok') status = (await pushAttempts(deps)) ?? 'ok';
  if (status === 'ok') await pullBank(deps);
  // Last, so a day the server just turned is known; offline it still runs on the saved day.
  await refreshBlocklist(deps);
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
