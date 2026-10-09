import { earnedSeconds, sumKind, type EventContext, type LedgerEvent } from './ledger';
import { err, ok, type Result } from './result';
import type { Rules } from './rules';

export type EarnRequest =
  | { readonly kind: 'base_grant' }
  | { readonly kind: 'task_reward'; readonly taskId: string; readonly seconds: number }
  | { readonly kind: 'all_done_bonus' }
  | {
      readonly kind: 'math_reward';
      readonly attemptId: string;
      readonly answerType: 'typed' | 'choice';
    };

export type EarnState = Readonly<{ planLocked: boolean; outstandingBorrow: number }>;

export type EarnError = 'plan_not_locked' | 'already_granted' | 'invalid_amount';

const refIdOf = (req: EarnRequest): string | undefined => {
  if (req.kind === 'task_reward') return req.taskId;
  if (req.kind === 'math_reward') return req.attemptId;
  return undefined;
};

const isPositiveInteger = (n: number): boolean => Number.isInteger(n) && n > 0;

function requestedSeconds(req: EarnRequest, rules: Rules): number | null {
  switch (req.kind) {
    case 'base_grant':
      return rules.baseSeconds;
    case 'all_done_bonus':
      return rules.allDoneBonusSeconds;
    case 'task_reward':
      return isPositiveInteger(req.seconds) ? req.seconds : null;
    case 'math_reward': {
      const factor = req.answerType === 'choice' ? rules.choiceRewardFactor : 1;
      return Math.round(rules.mathSecondsPerProblem * factor);
    }
  }
}

function remainingCap(dayEvents: readonly LedgerEvent[], req: EarnRequest, rules: Rules): number {
  const daily = Math.max(0, rules.dailyCapSeconds - earnedSeconds(dayEvents));
  if (req.kind !== 'math_reward') return daily;
  const math = Math.max(0, rules.mathDailyCapSeconds - sumKind(dayEvents, 'math_reward'));
  return Math.min(daily, math);
}

const alreadyGranted = (dayEvents: readonly LedgerEvent[], req: EarnRequest): boolean => {
  const refId = refIdOf(req);
  return dayEvents.some((e) => e.kind === req.kind && (refId === undefined || e.refId === refId));
};

export function earn(
  dayEvents: readonly LedgerEvent[],
  req: EarnRequest,
  ctx: EventContext,
  rules: Rules,
  state: EarnState,
): Result<LedgerEvent[], EarnError> {
  if (req.kind !== 'base_grant' && !state.planLocked) return err('plan_not_locked');
  if (alreadyGranted(dayEvents, req)) return err('already_granted');

  const requested = requestedSeconds(req, rules);
  if (requested === null) return err('invalid_amount');

  const refId = refIdOf(req);
  const reward: LedgerEvent = {
    id: ctx.newId(),
    day: ctx.day,
    at: ctx.at,
    kind: req.kind,
    seconds: Math.min(requested, remainingCap(dayEvents, req, rules)),
    ...(refId === undefined ? {} : { refId }),
  };

  // The base grant is a guaranteed floor, so it never pays debt.
  const repay = req.kind === 'base_grant' ? 0 : Math.min(reward.seconds, state.outstandingBorrow);
  if (repay === 0) return ok([reward]);

  const repayment: LedgerEvent = {
    id: ctx.newId(),
    day: ctx.day,
    at: ctx.at,
    kind: 'borrow_repay',
    seconds: -repay,
    refId: reward.id,
  };
  return ok([reward, repayment]);
}
