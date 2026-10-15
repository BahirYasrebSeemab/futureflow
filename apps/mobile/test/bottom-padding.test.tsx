import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useBottomPadding } from '@/components/bottom-padding';

function Probe() {
  const style = useBottomPadding();
  return <Text>{String(style.paddingBottom)}</Text>;
}

test('scrolling screens end above the system navigation bar', () => {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 24, left: 0, right: 0, bottom: 48 },
      }}
    >
      <Probe />
    </SafeAreaProvider>,
  );
  expect(screen.getByText('80')).toBeTruthy(); // 48 dp bar + 32 dp breathing room
});
