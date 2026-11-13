import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { useApp } from '@/lib/app';
import { DARK, LIGHT, navTheme } from '@/theme';

/**
 * Unpaired phones can only reach pairing; paired phones never see it. The navigation theme comes
 * from the palette, so headers, the tab bar and the screen behind transitions follow dark mode.
 */
export function RootStack() {
  const { session } = useApp();
  const paired = session.status === 'paired';
  const dark = useColorScheme() === 'dark';
  const c = dark ? DARK : LIGHT;
  return (
    <ThemeProvider value={navTheme(c, dark)}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Protected guard={paired}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Today' }} />
          <Stack.Screen name="diagnostics" options={{ title: 'Diagnostics' }} />
          <Stack.Screen name="away" options={{ title: 'Away' }} />
          <Stack.Screen name="math-placement" options={{ title: 'Placement' }} />
          <Stack.Screen name="mocks" options={{ title: 'Mock exams' }} />
          <Stack.Screen name="mock" options={{ title: 'Mock exam' }} />
          <Stack.Screen name="reading" options={{ title: 'Reading' }} />
          <Stack.Screen name="unlock" options={{ title: 'Emergency unlock' }} />
          <Stack.Screen name="blocked-apps" options={{ title: 'Blocked apps' }} />
          <Stack.Screen name="roadmap" options={{ title: 'Roadmap' }} />
          <Stack.Screen name="github" options={{ title: 'GitHub' }} />
          <Stack.Screen name="guard" options={{ title: 'Guard' }} />
        </Stack.Protected>
        <Stack.Protected guard={!paired}>
          <Stack.Screen name="pair" options={{ title: 'Pair this phone', headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
