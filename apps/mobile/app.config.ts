import type { ExpoConfig } from 'expo/config';

/** CI's emulator build talks to a local Worker over plain http://10.0.2.2. Store builds never do. */
const isE2E = process.env.E2E === '1';

const config: ExpoConfig = {
  name: 'Future Flow',
  slug: 'futureflow',
  scheme: 'futureflow',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'com.bahiryasreb.futureflow',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Away checks need only a rough position; precise and background location are never requested.
    blockedPermissions: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
    ],
  },
  extra: {
    allowCleartext: isE2E,
    e2eBlockedApps: isE2E ? ['com.android.settings'] : [],
    // The emulator can't sit through the 10-minute unlock wait; store builds leave this unset.
    ...(isE2E ? { e2eUnlockWaitSeconds: 5 } : {}),
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Future Flow checks how far you are from home on away days. Your location never leaves the phone.',
      },
    ],
    ['expo-build-properties', { android: { usesCleartextTraffic: isE2E } }],
  ],
};

export default config;
