import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppProvider } from '@/lib/app';
import type { Guard } from '@/lib/guard/types';
import { GuardScreen } from '@/screens/guard';
import { MoreScreen } from '@/screens/more';
import { RootStack } from '@/screens/root-stack';
import { TodayScreen } from '@/screens/today';
import { fakeGuard, PAIRED, testServices } from './support/fakes';

async function open(url: string, guard?: Guard) {
  const services = await testServices({}, PAIRED, guard === undefined ? {} : { guard });
  await services.syncer.sync();
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      index: TodayScreen,
      more: MoreScreen,
      guard: GuardScreen,
    },
    { initialUrl: url },
  );
}

test('the guard is on: the screen says so and lists what it blocks', async () => {
  await open('/guard', fakeGuard({ enabled: true }).guard);
  expect(await screen.findByTestId('guard-status')).toHaveTextContent('The guard is on');
  expect(screen.getByText(/Instagram/)).toBeTruthy();
  expect(screen.getByText(/Games/)).toBeTruthy();
  // Honest about what leaves: each session's length and time, never which app.
  expect(screen.getByText(/the minutes you spent and when are sent/)).toBeTruthy();
  expect(screen.queryByTestId('guard-enable')).toBeNull();
});

test('the guard is off: turning it on opens the settings, with the restricted-setting help', async () => {
  const { guard, calls } = fakeGuard({ enabled: false });
  await open('/guard', guard);
  expect(await screen.findByTestId('guard-status')).toHaveTextContent('The guard is off');
  expect(screen.getByText(/Allow restricted settings/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('guard-enable'));
  await waitFor(() => expect(calls.opened).toBe(1));
});

test('without the native module the screen says it needs the Android app', async () => {
  await open('/guard');
  expect(await screen.findByTestId('guard-status')).toHaveTextContent(
    'The guard needs the Android app',
  );
});

test('More opens the guard', async () => {
  await open('/more', fakeGuard().guard);
  fireEvent.press(await screen.findByTestId('more-guard'));
  expect(await screen.findByTestId('guard-status')).toBeTruthy();
});

test('Today warns when the guard is off, and not when it is on or missing', async () => {
  await open('/', fakeGuard({ enabled: false }).guard);
  expect(await screen.findByText('The guard is off')).toBeTruthy();
  fireEvent.press(screen.getByTestId('open-guard'));
  expect(await screen.findByTestId('guard-status')).toBeTruthy();
});

test.each([
  ['on', fakeGuard({ enabled: true }).guard],
  ['missing', undefined],
])('Today shows no guard warning when the guard is %s', async (_label, guard) => {
  await open('/', guard);
  expect(await screen.findByTestId('balance')).toBeTruthy();
  expect(screen.queryByTestId('open-guard')).toBeNull();
});
