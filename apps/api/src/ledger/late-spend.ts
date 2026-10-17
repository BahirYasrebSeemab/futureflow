import { lateSpendCredit, type LedgerEvent } from '@futureflow/core';
import type { LedgerRepo } from '../ports';
import { appendEvents } from './append';

/**
 * Spend for a day that already expired gives back what the expiry took twice (core
 * `lateSpendCredit`). Runs for newly added spend only, so a resent batch credits nothing.
 * One read per day touched, one write for all credits.
 */
export async function creditLateSpend(
  repo: LedgerRepo,
  added: readonly LedgerEvent[],
  newId: () => string,
  now: number,
): Promise<void> {
  const spends = added.filter((e) => e.kind === 'usage_spend');
  const credits: LedgerEvent[] = [];
  for (const day of new Set(spends.map((e) => e.day))) {
    let dayEvents = await repo.forDay(day);
    for (const spend of spends.filter((e) => e.day === day)) {
      const credit = lateSpendCredit(dayEvents, spend, { day, at: now, newId });
      if (credit === null) continue;
      credits.push(credit);
      dayEvents = [...dayEvents, credit];
    }
  }
  if (credits.length > 0) await appendEvents(repo, credits, null, now);
}
