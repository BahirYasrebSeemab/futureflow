import { balance, mergeEvents, sumKind, type LedgerEvent } from '@futureflow/core';

const WORK_KINDS = ['task_reward', 'all_done_bonus', 'math_reward'] as const;

/** The balance the phone believes right now: what the server confirmed plus what is still unsent. */
export const projectBalance = (
  confirmed: readonly LedgerEvent[],
  pending: readonly LedgerEvent[],
): number => balance(mergeEvents(confirmed, pending).events);

/** What a day paid for work, apart from the free daily allowance (the server's "earned" counts both). */
export function dayTotals(
  confirmed: readonly LedgerEvent[],
  pending: readonly LedgerEvent[],
  day: string,
): { earned: number; allowance: number } {
  const events = mergeEvents(confirmed, pending).events.filter((e) => e.day === day);
  return {
    earned: WORK_KINDS.reduce((total, kind) => total + sumKind(events, kind), 0),
    allowance: sumKind(events, 'base_grant'),
  };
}
