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

const ONCE_PER_DAY: ReadonlySet<LedgerEventKind> = new Set([
  'base_grant',
  'all_done_bonus',
  'expire',
]);
const ONCE_PER_REF: ReadonlySet<LedgerEventKind> = new Set(['task_reward', 'math_reward']);

/** Business identity: two writers (phone, server) creating "the same" grant share this key. */
function semanticKey(e: LedgerEvent): string | null {
  if (ONCE_PER_DAY.has(e.kind)) return `${e.day}:${e.kind}`;
  if (ONCE_PER_REF.has(e.kind) && e.refId !== undefined) return `${e.kind}:${e.refId}`;
  return null;
}

/**
 * Idempotent union by event id AND by business identity, so a grant created by two
 * writers is kept once. A `borrow_repay` whose reward was dropped is dropped too
 * (rewards precede their repayment, as `earn` emits them). Inputs are not mutated.
 */
export function mergeEvents(
  existing: readonly LedgerEvent[],
  incoming: readonly LedgerEvent[],
): { events: LedgerEvent[]; added: LedgerEvent[] } {
  const seenIds = new Set(existing.map((e) => e.id));
  const seenKeys = new Set(existing.map(semanticKey).filter((k) => k !== null));
  const droppedIds = new Set<string>();

  const added = incoming.filter((e) => {
    if (seenIds.has(e.id)) return false;
    const key = semanticKey(e);
    const orphanRepay = e.kind === 'borrow_repay' && droppedIds.has(e.refId ?? '');
    if ((key !== null && seenKeys.has(key)) || orphanRepay) {
      droppedIds.add(e.id);
      return false;
    }
    seenIds.add(e.id);
    if (key !== null) seenKeys.add(key);
    return true;
  });
  return { events: [...existing, ...added], added };
}
