import * as Haptics from 'expo-haptics';
import { haptics } from '@/lib/haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

beforeEach(() => jest.clearAllMocks());

test('a tap asks for a light impact, a success for the success notification', () => {
  jest.mocked(Haptics.impactAsync).mockResolvedValue(undefined);
  jest.mocked(Haptics.notificationAsync).mockResolvedValue(undefined);
  haptics.tap();
  haptics.success();
  expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
});

test('a failing or throwing haptic never breaks the tap', async () => {
  jest.mocked(Haptics.impactAsync).mockRejectedValue(new Error('no vibrator'));
  jest.mocked(Haptics.notificationAsync).mockImplementation(() => {
    throw new Error('native module missing');
  });
  expect(() => haptics.tap()).not.toThrow();
  expect(() => haptics.warn()).not.toThrow();
  await Promise.resolve();
});
