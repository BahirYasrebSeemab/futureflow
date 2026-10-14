import { AppProvider } from '@/lib/app';
import { createServices } from '@/lib/services';
import { RootStack } from '@/screens/root-stack';

export default function RootLayout() {
  return (
    <AppProvider load={createServices}>
      <RootStack />
    </AppProvider>
  );
}
