import { requireOptionalNativeModule } from 'expo';

export type NativeSpendSession = { seq: number; start: number; ms: number };

export type UsageGuardNative = {
  status(): Promise<{ enabled: boolean }>;
  setBlockedApps(packages: string[], blockGames: boolean): Promise<void>;
  /** Spent time not yet committed; an open session is cut at now. */
  pendingSpend(): Promise<NativeSpendSession[]>;
  /** Sessions up to `watermark` are recorded; `balanceSeconds` already counts them. */
  commit(watermark: number, balanceSeconds: number): Promise<void>;
  openSettings(): Promise<void>;
};

/** Null where the module isn't built in (Expo Go, Jest, iOS). */
export default requireOptionalNativeModule<UsageGuardNative>('UsageGuard');
