import { dayKeyFor } from '@futureflow/core';
import { TodaySchema } from '@futureflow/contracts';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { v7 } from 'uuid';
import { space } from '@/theme';

test('workspace packages, ESM uuid and the @ alias load under jest', () => {
  expect(dayKeyFor(Date.UTC(2026, 9, 9, 12), 0, 4)).toBe('2026-10-09');
  expect(TodaySchema.safeParse({}).success).toBe(false);
  expect(v7()).toMatch(/^[0-9a-f-]{36}$/);
  expect(space.md).toBe(16);
});

test('renders React Native components', () => {
  render(<Text>Future Flow</Text>);
  expect(screen.getByText('Future Flow')).toBeTruthy();
});
