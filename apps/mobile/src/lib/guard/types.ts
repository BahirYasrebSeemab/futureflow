import type { SpendSession } from './spend';

export type GuardStatus = Readonly<{
  /** False where the native module isn't built in (Expo Go, tests). */
  available: boolean;
  /** The accessibility service is switched on. */
  enabled: boolean;
}>;

/** The native guard (spec §7): it enforces the balance on blocked apps and counts time spent. */
export interface Guard {
  status(): Promise<GuardStatus>;
  setBlockedApps(packages: readonly string[], blockGames: boolean): Promise<void>;
  /** Time spent and not yet committed; an open session is cut at now. */
  pendingSpend(): Promise<SpendSession[]>;
  /** Sessions up to `watermark` are recorded as events; `balanceSeconds` already counts them. */
  commit(watermark: number, balanceSeconds: number): Promise<void>;
  openSettings(): Promise<void>;
}

/** Social apps blocked by default, with the names the Guard screen shows. Games are blocked too. */
export const BLOCKED_APPS: readonly (readonly [string, string])[] = [
  ['com.instagram.android', 'Instagram'],
  ['com.instagram.barcelona', 'Threads'],
  ['com.zhiliaoapp.musically', 'TikTok'],
  ['com.ss.android.ugc.trill', 'TikTok'],
  ['com.google.android.youtube', 'YouTube'],
  ['com.facebook.katana', 'Facebook'],
  ['com.snapchat.android', 'Snapchat'],
  ['com.twitter.android', 'X'],
  ['com.reddit.frontpage', 'Reddit'],
];

/** Where there is no native guard: nothing is enforced and nothing is counted. */
export const noGuard: Guard = {
  status: async () => ({ available: false, enabled: false }),
  setBlockedApps: async () => {},
  pendingSpend: async () => [],
  commit: async () => {},
  openSettings: async () => {},
};
