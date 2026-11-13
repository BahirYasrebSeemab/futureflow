import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { Button } from '@/components/button';
import { PressableScale } from '@/components/pressable-scale';

jest.mock('@/lib/haptics', () => ({
  haptics: { tap: jest.fn(), success: jest.fn(), warn: jest.fn() },
}));

test('a press calls onPress; a disabled button ignores it', () => {
  const onPress = jest.fn();
  const { rerender } = render(<Button testID="b" label="Go" onPress={onPress} />);
  fireEvent.press(screen.getByTestId('b'));
  expect(onPress).toHaveBeenCalledTimes(1);
  rerender(<Button testID="b" label="Go" onPress={onPress} disabled />);
  fireEvent.press(screen.getByTestId('b'));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('b')).toBeDisabled();
});

test('the layout style sizes the pressable itself, so it can flex inside a row', () => {
  render(
    <PressableScale testID="p" onPress={() => undefined} containerStyle={{ flex: 1 }}>
      <Text>Tile</Text>
    </PressableScale>,
  );
  expect(StyleSheet.flatten(screen.getByTestId('p').props.style)).toMatchObject({ flex: 1 });
});
