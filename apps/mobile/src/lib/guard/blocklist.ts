import { addDays, type DayKey } from '@futureflow/core';
import { BLOCKED_APPS, OTHER_BROWSERS } from './types';

/** Which apps the guard blocks, and whether games are blocked too. Never leaves the phone. */
export type Blocklist = Readonly<{ apps: readonly string[]; games: boolean }>;

/** What applies now, and a loosening waiting for its day. */
export type BlocklistState = Readonly<{
  current: Blocklist;
  pending: (Blocklist & Readonly<{ from: DayKey }>) | null;
  /** 2 once the other browsers were added (lists saved before that have none). */
  version?: number;
}>;

export const BLOCKLIST_VERSION = 2;

export const DEFAULT_BLOCKLIST: Blocklist = {
  apps: [...new Set([...BLOCKED_APPS.map(([pkg]) => pkg), ...OTHER_BROWSERS.map(([pkg]) => pkg)])],
  games: true,
};

/** The sites of the blocked apps: blocked in readable browsers exactly while the app is. */
export const blockedDomains = (list: Blocklist): string[] => [
  ...new Set(
    BLOCKED_APPS.filter(([pkg]) => list.apps.includes(pkg)).flatMap(([, , domains]) => domains),
  ),
];

export const DEFAULT_BLOCKLIST_STATE: BlocklistState = {
  current: DEFAULT_BLOCKLIST,
  pending: null,
  version: BLOCKLIST_VERSION,
};

const union = (a: readonly string[], b: readonly string[]) => [
  ...a,
  ...b.filter((p) => !a.includes(p)),
];

/**
 * Lists saved before the unreadable browsers were blocked get them, once (blocking more applies at
 * once). After that an owner's unblock of one sticks.
 */
export function upgradeBlocklist(state: BlocklistState): BlocklistState {
  if ((state.version ?? 1) >= BLOCKLIST_VERSION) return state;
  const browsers = OTHER_BROWSERS.map(([pkg]) => pkg);
  return {
    current: { ...state.current, apps: union(state.current.apps, browsers) },
    pending:
      state.pending === null
        ? null
        : { ...state.pending, apps: union(state.pending.apps, browsers) },
    version: BLOCKLIST_VERSION,
  };
}

const same = (a: Blocklist, b: Blocklist) =>
  a.games === b.games && a.apps.length === b.apps.length && a.apps.every((p) => b.apps.includes(p));

/** A pending change applies from its day (the 04:00 boundary is in the day key). */
export function effectiveBlocklist(state: BlocklistState, today: DayKey): BlocklistState {
  const { pending } = state;
  if (pending === null || today < pending.from) return state;
  return {
    current: { apps: pending.apps, games: pending.games },
    pending: null,
    version: state.version,
  };
}

/**
 * Blocking more applies at once; anything that unblocks waits for the next day, so an impulse
 * can't open Instagram tonight. Asking for what already applies cancels a pending change.
 */
export function changeBlocklist(
  state: BlocklistState,
  next: Blocklist,
  today: DayKey,
): BlocklistState {
  const { current } = effectiveBlocklist(state, today);
  const tightened: Blocklist = {
    apps: [...current.apps, ...next.apps.filter((p) => !current.apps.includes(p))],
    games: current.games || next.games,
  };
  return {
    version: state.version,
    current: tightened,
    pending: same(tightened, next)
      ? null
      : { apps: [...next.apps], games: next.games, from: addDays(today, 1) },
  };
}
