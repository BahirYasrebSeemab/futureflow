import { DEFAULT_RULES, unlockAllowed, type LedgerEvent } from '@futureflow/core';
import type { LedgerRepo } from '../ports';

export type UnlockRefusal = 'unlock_reason' | 'unlock_limit';

/**
 * The phone checks the unlock rule before unlocking; this checks it again on arrival (spec §6.1),
 * in batch order against the day's stored events. A resend of a stored unlock is left for the
 * merge to ignore. The wait can only be seen on the phone.
 */
export async function screenUnlocks(
  repo: LedgerRepo,
  events: readonly LedgerEvent[],
): Promise<{ id: string; reason: UnlockRefusal }[]> {
  const unlocks = events.filter((e) => e.kind === 'unlock_borrow');
  const days = new Map<string, LedgerEvent[]>();
  for (const day of new Set(unlocks.map((e) => e.day))) days.set(day, await repo.forDay(day));

  const refused: { id: string; reason: UnlockRefusal }[] = [];
  for (const e of unlocks) {
    const day = days.get(e.day) ?? [];
    if (day.some((stored) => stored.id === e.id)) continue;
    const problem = unlockAllowed(day, e.reason ?? '', DEFAULT_RULES);
    if (problem === null) day.push(e);
    else
      refused.push({
        id: e.id,
        reason: problem === 'reason_too_short' ? 'unlock_reason' : 'unlock_limit',
      });
  }
  return refused;
}
