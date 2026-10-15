import {
  DEFAULT_RULES,
  earn,
  type LedgerEvent,
  mergeEvents,
  outstandingBorrowSeconds,
} from '@futureflow/core';

export type RewardInput = Readonly<{
  confirmed: readonly LedgerEvent[];
  pending: readonly LedgerEvent[];
  /** The day of today's snapshot. */
  day: string;
  /** The phone's day now (04:00 boundary); time is only paid for that day. */
  currentDay: string;
  planLocked: boolean;
  attemptId: string;
  answerType: 'typed' | 'choice';
  at: number;
  newId: () => string;
}>;

export type NoMathReward = 'plan_not_locked' | 'cap_reached' | 'not_today' | 'already_granted';

export type RewardResult =
  { events: LedgerEvent[]; seconds: number } | { events: []; reason: NoMathReward };

/** Math time through core's earn(): the same caps, repayment and once-per-attempt rule as the server. */
export function mathReward(input: RewardInput): RewardResult {
  if (input.day !== input.currentDay) return { events: [], reason: 'not_today' };
  const all = mergeEvents(input.confirmed, input.pending).events;
  const result = earn(
    all.filter((e) => e.day === input.day),
    { kind: 'math_reward', attemptId: input.attemptId, answerType: input.answerType },
    { day: input.day, at: input.at, newId: input.newId },
    DEFAULT_RULES,
    { planLocked: input.planLocked, outstandingBorrow: outstandingBorrowSeconds(all) },
  );
  if (!result.ok) {
    if (result.error === 'plan_not_locked' || result.error === 'already_granted') {
      return { events: [], reason: result.error };
    }
    return { events: [], reason: 'cap_reached' }; // invalid_amount cannot happen for math
  }
  const seconds = result.value[0]?.seconds ?? 0;
  // A capped reward of 0 seconds is not worth a ledger event.
  if (seconds <= 0) return { events: [], reason: 'cap_reached' };
  return { events: result.value, seconds };
}
