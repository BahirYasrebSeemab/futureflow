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
        <Stack.Screen name="plan" options={{ title: 'Plan' }} />
        <Stack.Screen name="away" options={{ title: 'Away' }} />
        <Stack.Screen name="math" options={{ title: 'Math' }} />
        <Stack.Screen name="math-placement" options={{ title: 'Placement' }} />
        <Stack.Screen name="mocks" options={{ title: 'Mock exams' }} />
        <Stack.Screen name="mock" options={{ title: 'Mock exam' }} />
        <Stack.Screen name="reading" options={{ title: 'Reading' }} />
        <Stack.Screen name="coach" options={{ title: 'Coach' }} />
        <Stack.Screen name="roadmap" options={{ title: 'Roadmap' }} />
        <Stack.Screen name="github" options={{ title: 'GitHub' }} />
        <Stack.Screen name="more" options={{ title: 'More' }} />
      </Stack.Protected>
      <Stack.Protected guard={!paired}>
        <Stack.Screen name="pair" options={{ title: 'Pair this phone', headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
