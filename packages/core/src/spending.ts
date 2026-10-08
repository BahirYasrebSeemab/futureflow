import { balance, type EventContext, type LedgerEvent } from './ledger';
import { err, ok, type Result } from './result';
import type { Rules } from './rules';

const MS_PER_SECOND = 1_000;

export function spend(seconds: number, ctx: EventContext): Result<LedgerEvent, 'invalid_amount'> {
  if (!Number.isInteger(seconds) || seconds <= 0) return err('invalid_amount');
  return ok({ id: ctx.newId(), day: ctx.day, at: ctx.at, kind: 'usage_spend', seconds: -seconds });
}

/** Unused time does not roll over. Debt (negative balance) is not expired. */
export function expireDay(
  dayEvents: readonly LedgerEvent[],
  ctx: EventContext,
): LedgerEvent | null {
  const left = balance(dayEvents);
  if (left <= 0) return null;
  return { id: ctx.newId(), day: ctx.day, at: ctx.at, kind: 'expire', seconds: -left };
}

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
