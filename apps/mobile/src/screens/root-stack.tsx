import { Stack } from 'expo-router';
import { useApp } from '@/lib/app';

/** Unpaired phones can only reach pairing; paired phones never see it. */
export function RootStack() {
  const { session } = useApp();
  const paired = session.status === 'paired';
  return (
    <Stack>
      <Stack.Protected guard={paired}>
        <Stack.Screen name="index" options={{ title: 'Today' }} />
        <Stack.Screen name="diagnostics" options={{ title: 'Diagnostics' }} />
      </Stack.Protected>
      <Stack.Protected guard={!paired}>
        <Stack.Screen name="pair" options={{ title: 'Pair this phone', headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
