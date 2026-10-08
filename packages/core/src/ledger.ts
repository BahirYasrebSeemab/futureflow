import type { DayKey } from './time';

export const LEDGER_EVENT_KINDS = [
  'base_grant',
  'task_reward',
  'all_done_bonus',
  'math_reward',
  'usage_spend',
  'unlock_borrow',
  'borrow_repay',
  'expire',
  'correction',
] as const;

export type LedgerEventKind = (typeof LEDGER_EVENT_KINDS)[number];

/** Append-only. Never updated or deleted; corrections are new events. */
export type LedgerEvent = Readonly<{
  id: string;
  day: DayKey;
  at: number;
  kind: LedgerEventKind;
  seconds: number;
  refId?: string;
  reason?: string;
}>;

/** Everything a pure function needs to create events: no clock or RNG inside core. */
export type EventContext = Readonly<{ day: DayKey; at: number; newId: () => string }>;

const EARNING_KINDS: ReadonlySet<LedgerEventKind> = new Set([
  'base_grant',
  'task_reward',
  'all_done_bonus',
  'math_reward',
]);

const sum = (events: readonly LedgerEvent[]): number =>
  events.reduce((total, e) => total + e.seconds, 0);

export const balance = sum;

export const eventsForDay = (events: readonly LedgerEvent[], day: DayKey): LedgerEvent[] =>
  events.filter((e) => e.day === day);

export const earnedSeconds = (dayEvents: readonly LedgerEvent[]): number =>
  sum(dayEvents.filter((e) => EARNING_KINDS.has(e.kind)));

export const sumKind = (events: readonly LedgerEvent[], kind: LedgerEventKind): number =>
  sum(events.filter((e) => e.kind === kind));

/** Borrowed seconds not yet repaid. Repay events carry negative seconds. */
export const outstandingBorrowSeconds = (events: readonly LedgerEvent[]): number =>
  Math.max(0, sumKind(events, 'unlock_borrow') + sumKind(events, 'borrow_repay'));

/** Idempotent union by event id. Inputs are not mutated. */
export function mergeEvents(
  existing: readonly LedgerEvent[],
  incoming: readonly LedgerEvent[],
): { events: LedgerEvent[]; added: LedgerEvent[] } {
  const seen = new Set(existing.map((e) => e.id));
  const added = incoming.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  return { events: [...existing, ...added], added };
}
