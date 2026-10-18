import { requireOptionalNativeModule } from 'expo';

export type NativeSpendSession = { seq: number; start: number; ms: number };

export type NativeGuardStatus = {
  enabled: boolean;
  connected: boolean;
  foreground: boolean;
  notifications: boolean;
  batteryUnrestricted: boolean;
  xiaomi: boolean;
};

export type UsageGuardNative = {
  status(): Promise<NativeGuardStatus>;
  setBlockedApps(packages: string[], blockGames: boolean): Promise<void>;
  /** Spent time not yet committed; an open session is cut at now. */
  pendingSpend(): Promise<NativeSpendSession[]>;
  /** Sessions up to `watermark` are recorded; `balanceSeconds` already counts them. */
  commit(watermark: number, balanceSeconds: number): Promise<void>;
  openSettings(kind: 'accessibility' | 'notifications' | 'battery' | 'autostart'): Promise<void>;
  /** The heartbeat's own copy of the server address and device token, sealed in the Keystore. */
  link(apiUrl: string, token: string): Promise<void>;
  unlink(): Promise<void>;
};

/** Null where the module isn't built in (Expo Go, Jest, iOS). */
export default requireOptionalNativeModule<UsageGuardNative>('UsageGuard');
