import type { SpendSession } from './spend';

export type GuardStatus = Readonly<{
  /** False where the native module isn't built in (Expo Go, tests). */
  available: boolean;
  /** The accessibility service is switched on. */
  enabled: boolean;
  /** The service runs in the app's process right now. */
  connected: boolean;
  /** The "N min left" foreground service runs. */
  foreground: boolean;
  notifications: boolean;
  /** Android's battery optimisation leaves the app alone. */
  batteryUnrestricted: boolean;
  /** Xiaomi, Redmi and POCO phones also need Autostart and a lock in recents. */
  xiaomi: boolean;
}>;

/** The phone's monotonic clock: unlock waits are measured on it (spec §6.5). */
export type GuardClock = Readonly<{ elapsed: number; bootId: string }>;

/** A launcher app, for the picker. Never sent anywhere. */
export type InstalledApp = Readonly<{ package: string; label: string }>;

export type GuardSettings = 'accessibility' | 'notifications' | 'battery' | 'autostart';

/** The native guard (spec §7): it enforces the balance on blocked apps and counts time spent. */
export interface Guard {
  status(): Promise<GuardStatus>;
  setBlockedApps(packages: readonly string[], blockGames: boolean): Promise<void>;
  /** Time spent and not yet committed; an open session is cut at now. */
  pendingSpend(): Promise<SpendSession[]>;
  /**
   * Sessions up to `watermark` are recorded as events; `balanceSeconds` already counts them and
   * the unlocks in `included`.
   */
  commit(watermark: number, balanceSeconds: number, included: readonly string[]): Promise<void>;
  /** An emergency unlock's time, known to the guard at once and offline. */
  grant(unlockId: string, seconds: number): Promise<void>;
  /** Null where there is no native guard. */
  clock(): Promise<GuardClock | null>;
  installedApps(): Promise<InstalledApp[]>;
  openSettings(kind: GuardSettings): Promise<void>;
  /** Asks Android to allow notifications; true once they are allowed. */
  requestNotifications(): Promise<boolean>;
  /** The native heartbeat's own copy of where to send and the device token (spec §6.5). */
  link(apiUrl: string, token: string): Promise<void>;
  unlink(): Promise<void>;
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
  status: async () => ({
    available: false,
    enabled: false,
    connected: false,
    foreground: false,
    notifications: false,
    batteryUnrestricted: false,
    xiaomi: false,
  }),
  setBlockedApps: async () => {},
  pendingSpend: async () => [],
  commit: async () => {},
  grant: async () => {},
  clock: async () => null,
  installedApps: async () => [],
  openSettings: async () => {},
  requestNotifications: async () => false,
  link: async () => {},
  unlink: async () => {},
};
