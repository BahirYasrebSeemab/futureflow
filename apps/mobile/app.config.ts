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
  },
  extra: { allowCleartext: isE2E },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    ['expo-build-properties', { android: { usesCleartextTraffic: isE2E } }],
  ],
};

export default config;
