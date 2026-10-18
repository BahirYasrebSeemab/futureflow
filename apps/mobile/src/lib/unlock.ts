import {
  unlock,
  type EventContext,
  type LedgerEvent,
  type Result,
  type Rules,
  type UnlockError,
} from '@futureflow/core';
import type { GuardClock } from './guard/types';

/** An emergency unlock waiting out its 10 minutes (spec §6.1). Kept in kv, so leaving doesn't reset it. */
export type UnlockWait = Readonly<{
  reason: string;
  /** Wall time, for the record. */
  startedAt: number;
  /** The monotonic clock, which measures the wait. */
  startElapsed: number;
  bootId: string;
}>;

export const startWait = (reason: string, clock: GuardClock, now: number): UnlockWait => ({
  reason: reason.trim(),
  startedAt: now,
  startElapsed: clock.elapsed,
  bootId: clock.bootId,
});

/**
 * Milliseconds still to wait. Measured on the monotonic clock, so changing the time doesn't
 * shorten it; it restarts at every boot, so a reboot means waiting again.
 */
export function waitLeftMs(wait: UnlockWait, clock: GuardClock, rules: Rules): number | 'restart' {
  if (clock.bootId !== wait.bootId || clock.elapsed < wait.startElapsed) return 'restart';
  return Math.max(0, rules.unlockWaitSeconds * 1_000 - (clock.elapsed - wait.startElapsed));
}

/** Core's unlock rule, with the wait's start taken from the monotonic clock instead of the wall. */
export function finishUnlock(
  dayEvents: readonly LedgerEvent[],
  wait: UnlockWait,
  clock: GuardClock,
  ctx: EventContext,
  rules: Rules,
): Result<LedgerEvent, UnlockError | 'wait_restarted'> {
  if (waitLeftMs(wait, clock, rules) === 'restart') return { ok: false, error: 'wait_restarted' };
  const waited = clock.elapsed - wait.startElapsed;
  return unlock(dayEvents, { reason: wait.reason, waitStartedAt: ctx.at - waited }, ctx, rules);
}
