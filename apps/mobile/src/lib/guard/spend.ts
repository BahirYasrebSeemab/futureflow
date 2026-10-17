import { DEFAULT_RULES, spend, type LedgerEvent } from '@futureflow/core';
import { currentDayKey, localOffsetMinutes } from '../format';

/** Time the guard counted in blocked apps; `seq` grows with every closed session. */
export type SpendSession = Readonly<{ seq: number; start: number; ms: number }>;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_SECOND = 1_000;

/** The next local day boundary (04:00) after `at`. */
function nextBoundary(at: number): number {
  const offset = localOffsetMinutes(at) * MS_PER_MINUTE;
  const boundary = DEFAULT_RULES.dayBoundaryHour * MS_PER_HOUR;
  const dayStart = Math.floor((at + offset - boundary) / MS_PER_DAY) * MS_PER_DAY;
  return dayStart + MS_PER_DAY + boundary - offset;
}

/** Cuts a session at each day boundary, so every day pays for its own time. */
function parts(session: SpendSession): { day: string; end: number; ms: number }[] {
  const out: { day: string; end: number; ms: number }[] = [];
  const end = session.start + session.ms;
  for (let from = session.start; from < end; ) {
    const to = Math.min(end, nextBoundary(from));
    out.push({ day: currentDayKey(from), end: to, ms: to - from });
    from = to;
  }
  return out;
}

/**
 * Sessions after `afterSeq` become `usage_spend` events, one per day each touches. Returns the
 * highest seq seen: sessions up to it are recorded, even those too short to charge.
 */
export function spendEvents(
  sessions: readonly SpendSession[],
  afterSeq: number,
  newId: () => string,
): { events: LedgerEvent[]; seq: number } {
  const fresh = sessions.filter((s) => s.seq > afterSeq);
  const events = fresh.flatMap(parts).flatMap((part) => {
    const seconds = Math.round(part.ms / MS_PER_SECOND);
    const event = spend(seconds, { day: part.day, at: part.end, newId });
    return event.ok ? [event.value] : [];
  });
  return { events, seq: Math.max(afterSeq, ...fresh.map((s) => s.seq)) };
}
