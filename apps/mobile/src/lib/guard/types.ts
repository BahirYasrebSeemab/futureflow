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
  /** Usage access: lets the guard find time it missed in Android's usage log. */
  usageAccess: boolean;
}>;

/** The phone's monotonic clock: unlock waits are measured on it (spec §6.5). */
export type GuardClock = Readonly<{ elapsed: number; bootId: string }>;

/** A launcher app, for the picker. Never sent anywhere. */
export type InstalledApp = Readonly<{ package: string; label: string }>;

export type GuardSettings = 'accessibility' | 'notifications' | 'battery' | 'autostart' | 'usage';

/** The native guard (spec §7): it enforces the balance on blocked apps and counts time spent. */
export interface Guard {
  status(): Promise<GuardStatus>;
  setBlockedApps(packages: readonly string[], blockGames: boolean): Promise<void>;
  /** Sites blocked in the browsers whose address bar the guard reads. Never sent anywhere. */
  setBlockedDomains(domains: readonly string[]): Promise<void>;
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

/**
 * Known social apps, with the names the Guard screen shows and their sites, which are blocked in
 * Chrome, Brave and Edge for as long as the app is. All but `UNBLOCKED_BY_DEFAULT` are blocked by
 * default, and games too.
 */
export const BLOCKED_APPS: readonly (readonly [string, string, readonly string[]])[] = [
  ['com.instagram.android', 'Instagram', ['instagram.com', 'instagr.am']],
  ['com.instagram.barcelona', 'Threads', ['threads.net', 'threads.com']],
  ['com.zhiliaoapp.musically', 'TikTok', ['tiktok.com']],
  ['com.ss.android.ugc.trill', 'TikTok', ['tiktok.com']],
  ['com.google.android.youtube', 'YouTube', ['youtube.com', 'youtu.be', 'youtube-nocookie.com']],
  ['com.facebook.katana', 'Facebook', ['facebook.com', 'fb.com', 'fb.watch']],
  ['com.snapchat.android', 'Snapchat', ['snapchat.com']],
  ['com.twitter.android', 'X', ['x.com', 'twitter.com']],
  ['com.reddit.frontpage', 'Reddit', ['reddit.com', 'redd.it']],
];

/** Known apps left free by default: the owner learns on YouTube. The picker can still block it. */
export const UNBLOCKED_BY_DEFAULT: readonly string[] = ['com.google.android.youtube'];

/**
 * Browsers whose address bar the guard can't read: blocked like apps by default, so they cost
 * earned time (Chrome, Brave and Edge are judged by the site instead). Unblock them in the picker.
 */
export const OTHER_BROWSERS: readonly (readonly [string, string])[] = [
  ['org.mozilla.firefox', 'Firefox'],
  ['com.opera.browser', 'Opera'],
  ['com.opera.mini.native', 'Opera Mini'],
  ['com.sec.android.app.sbrowser', 'Samsung Internet'],
  ['com.mi.globalbrowser', 'Mi Browser'],
  ['com.android.browser', 'Browser'],
  ['com.duckduckgo.mobile.android', 'DuckDuckGo'],
  ['com.UCMobile.intl', 'UC Browser'],
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
    usageAccess: false,
  }),
  setBlockedApps: async () => {},
  setBlockedDomains: async () => {},
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
