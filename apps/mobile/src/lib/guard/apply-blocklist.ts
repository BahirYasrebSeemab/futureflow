import { DEFAULT_BLOCKLIST_STATE, effectiveBlocklist, type BlocklistState } from './blocklist';
import type { Guard } from './types';
import type { LocalStore } from '../store/types';

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
