import UsageGuard from '../../../modules/usage-guard';
import { noGuard, type Guard } from './types';

/** The Kotlin usage-guard module, or `noGuard` where it isn't built in (Expo Go). */
export function nativeGuard(): Guard {
  const native = UsageGuard;
  if (native === null) return noGuard;
  return {
    status: async () => ({ available: true, enabled: (await native.status()).enabled }),
    setBlockedApps: (packages, blockGames) => native.setBlockedApps([...packages], blockGames),
    pendingSpend: () => native.pendingSpend(),
    commit: (watermark, balanceSeconds) => native.commit(watermark, balanceSeconds),
    openSettings: () => native.openSettings(),
  };
}
