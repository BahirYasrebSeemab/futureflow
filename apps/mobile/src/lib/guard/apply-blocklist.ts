import { DEFAULT_BLOCKLIST_STATE, effectiveBlocklist, type BlocklistState } from './blocklist';
import type { Guard } from './types';
import { currentDayKey } from '../format';
import type { LocalStore } from '../store/types';

/**
 * The day a pending unblock is measured against: the phone's day, but never past the server's day
 * from the last sync, so moving the clock forward doesn't bring an unblock forward.
 */
export async function blocklistDay(store: LocalStore, now: number): Promise<string> {
  const local = currentDayKey(now);
  const server = (await store.savedToday())?.today.day;
  return server !== undefined && server < local ? server : local;
}

/**
 * Gives the guard the blocklist that applies today (a pending unblock whose day came applies now),
 * plus `extra` apps (the emulator build's Settings). Nothing chosen yet means the defaults.
 */
export async function applyBlocklist(
  store: LocalStore,
  guard: Guard,
  today: string,
  extra: readonly string[] = [],
): Promise<BlocklistState> {
  const stored = await store.blocklist();
  const state = effectiveBlocklist(stored ?? DEFAULT_BLOCKLIST_STATE, today);
  if (stored !== null && state !== stored) await store.saveBlocklist(state);
  await guard.setBlockedApps([...state.current.apps, ...extra], state.current.games);
  return state;
}
