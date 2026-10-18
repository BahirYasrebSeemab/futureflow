import { PermissionsAndroid, Platform } from 'react-native';
import UsageGuard, { type UsageGuardNative } from '../../../modules/usage-guard';
import { noGuard, type Guard } from './types';

/** Android 13 made notifications a runtime permission. */
const NOTIFICATION_PERMISSION_SDK = 33;

/** The Kotlin usage-guard module, or `noGuard` where it isn't built in (Expo Go). */
export function nativeGuard(): Guard {
  const native = UsageGuard;
  if (native === null) return noGuard;
  return {
    status: async () => ({ available: true, ...(await native.status()) }),
    setBlockedApps: (packages, blockGames) => native.setBlockedApps([...packages], blockGames),
    pendingSpend: () => native.pendingSpend(),
    commit: (watermark, balanceSeconds, included) =>
      native.commit(watermark, balanceSeconds, [...included]),
    grant: (id, seconds) => native.grant(id, seconds),
    clock: () => native.clock(),
    installedApps: () => native.installedApps(),
    openSettings: (kind) => native.openSettings(kind),
    requestNotifications: () => requestNotifications(native),
    link: (apiUrl, token) => native.link(apiUrl, token),
    unlink: () => native.unlink(),
  };
}

/** The system prompt first; once Android stops asking, the app's notification settings. */
async function requestNotifications(native: UsageGuardNative): Promise<boolean> {
  if (Platform.OS === 'android' && Number(Platform.Version) >= NOTIFICATION_PERMISSION_SDK) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
    if (result === PermissionsAndroid.RESULTS.DENIED) return false;
  }
  if ((await native.status()).notifications) return true;
  await native.openSettings('notifications');
  return false;
}
