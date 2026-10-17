import { balance, eventsForDay, sumKind, type EventContext, type LedgerEvent } from './ledger';
import { err, ok, type Result } from './result';
import type { Rules } from './rules';

const MS_PER_SECOND = 1_000;
const LATE_SPEND = 'late_spend';

export function spend(seconds: number, ctx: EventContext): Result<LedgerEvent, 'invalid_amount'> {
  if (!Number.isInteger(seconds) || seconds <= 0) return err('invalid_amount');
  return ok({ id: ctx.newId(), day: ctx.day, at: ctx.at, kind: 'usage_spend', seconds: -seconds });
}

/** Unused time does not roll over, but it pays off older debt first. */
export function expireFromBalances(
  dayBalance: number,
  runningBalance: number,
  ctx: EventContext,
): LedgerEvent | null {
  const left = Math.min(dayBalance, runningBalance);
  if (left <= 0) return null;
  return { id: ctx.newId(), day: ctx.day, at: ctx.at, kind: 'expire', seconds: -left };
}

/** `history` is the full ledger through `ctx.day`; only `ctx.day`'s leftover can expire. */
export const expireDay = (history: readonly LedgerEvent[], ctx: EventContext): LedgerEvent | null =>
  expireFromBalances(balance(eventsForDay(history, ctx.day)), balance(history), ctx);

export type UnlockRequest = Readonly<{ reason: string; waitStartedAt: number }>;

export type UnlockError = 'reason_too_short' | 'daily_limit_reached' | 'wait_not_finished';

export function unlock(
  dayEvents: readonly LedgerEvent[],
  req: UnlockRequest,
  ctx: EventContext,
  rules: Rules,
): Result<LedgerEvent, UnlockError> {
  const reason = req.reason.trim();
  if (reason.length < rules.unlockMinReasonLength) return err('reason_too_short');

  const unlocksToday = dayEvents.filter((e) => e.kind === 'unlock_borrow').length;
  if (unlocksToday >= rules.unlockMaxPerDay) return err('daily_limit_reached');

  if (ctx.at - req.waitStartedAt < rules.unlockWaitSeconds * MS_PER_SECOND) {
    return err('wait_not_finished');
  }

  return ok({
    id: ctx.newId(),
    day: ctx.day,
    at: ctx.at,
    kind: 'unlock_borrow',
    seconds: rules.unlockGrantSeconds,
    reason,
  });
}

/**
 * Spend that reaches the server after its day already expired (scrolling late, syncing next
 * morning) was paid for by that day's leftover, which the expiry then took again. This gives back
 * the overlap: at most what the day expired, less what earlier late spend already took back.
 * `dayEvents` are all of the spend's day, the spend included. Once per spend.
 */
export function lateSpendCredit(
  dayEvents: readonly LedgerEvent[],
  late: LedgerEvent,
  ctx: EventContext,
): LedgerEvent | null {
  const corrections = dayEvents.filter((e) => e.kind === 'correction' && e.reason === LATE_SPEND);
  if (corrections.some((e) => e.refId === late.id)) return null;
  const expired = -sumKind(dayEvents, 'expire');
  const givenBack = corrections.reduce((total, e) => total + e.seconds, 0);
  const seconds = Math.min(-late.seconds, expired - givenBack);
  if (seconds <= 0) return null;
  return {
    id: ctx.newId(),
    day: late.day,
    at: ctx.at,
    kind: 'correction',
    seconds,
    refId: late.id,
    reason: LATE_SPEND,
  };
}

