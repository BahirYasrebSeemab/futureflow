import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppProvider } from '@/lib/app';
import type { Guard } from '@/lib/guard/types';
import { GuardScreen } from '@/screens/guard';
import { MoreScreen } from '@/screens/more';
import { RootStack } from '@/screens/root-stack';
import { TabsLayout } from '@/screens/tabs';
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
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': TodayScreen,
      '(tabs)/more': MoreScreen,
      guard: GuardScreen,
    },
    { initialUrl: url },
  );
  return services;
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
  await waitFor(() => expect(calls.settings).toEqual(['accessibility']));
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

test('keep it running: notifications and battery show what is left to do', async () => {
  const { guard, calls } = fakeGuard({
    state: { notifications: false, batteryUnrestricted: false },
  });
  await open('/guard', guard);
  expect(await screen.findByTestId('check-notifications')).toHaveTextContent(/To do/);
  expect(screen.getByTestId('check-battery')).toHaveTextContent(/To do/);
  fireEvent.press(screen.getByTestId('fix-battery'));
  await waitFor(() => expect(calls.settings).toEqual(['battery']));
});

test('allowing notifications asks Android, then shows the new state', async () => {
  const { guard, calls } = fakeGuard({ state: { notifications: false } });
  await open('/guard', guard);
  fireEvent.press(await screen.findByTestId('fix-notifications'));
  await waitFor(() => expect(screen.getByTestId('check-notifications')).toHaveTextContent(/Done/));
  expect(calls.notificationRequests).toBe(1);
  expect(screen.queryByTestId('fix-notifications')).toBeNull();
});

test('items Android reports as done show done, with nothing to press', async () => {
  await open('/guard', fakeGuard().guard);
  expect(await screen.findByTestId('check-notifications')).toHaveTextContent(/Done/);
  expect(screen.getByTestId('check-battery')).toHaveTextContent(/Done/);
  expect(screen.queryByTestId('fix-notifications')).toBeNull();
  expect(screen.queryByTestId('fix-battery')).toBeNull();
});

test('on a Xiaomi phone: Autostart opens its screen, and the owner ticks the steps', async () => {
  const { guard, calls } = fakeGuard({ state: { xiaomi: true } });
  const services = await open('/guard', guard);
  fireEvent.press(await screen.findByTestId('fix-autostart'));
  await waitFor(() => expect(calls.settings).toEqual(['autostart']));
  expect(screen.getByTestId('check-recents')).toHaveTextContent(/To do/);
  fireEvent.press(screen.getByTestId('done-recents'));
  await waitFor(() => expect(screen.getByTestId('check-recents')).toHaveTextContent(/Done/));
  expect(await services.store.guardSteps()).toEqual(['recents']);
});

test('a ticked step can be unticked', async () => {
  const { guard } = fakeGuard({ state: { xiaomi: true } });
  const services = await testServices({}, PAIRED, { guard });
  await services.store.markGuardStep('autostart', true);
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      guard: GuardScreen,
    },
    { initialUrl: '/guard' },
  );
  await waitFor(() => expect(screen.getByTestId('check-autostart')).toHaveTextContent(/Done/));
  fireEvent.press(screen.getByTestId('done-autostart'));
  await waitFor(() => expect(screen.getByTestId('check-autostart')).toHaveTextContent(/To do/));
  expect(await services.store.guardSteps()).toEqual([]);
});

test('other phones get no Xiaomi steps', async () => {
  await open('/guard', fakeGuard().guard);
  expect(await screen.findByTestId('check-battery')).toBeTruthy();
  expect(screen.queryByTestId('check-autostart')).toBeNull();
  expect(screen.queryByTestId('check-recents')).toBeNull();
});

test('on a Xiaomi phone the battery step can be ticked, since MIUI keeps its own setting', async () => {
  const { guard } = fakeGuard({ state: { xiaomi: true, batteryUnrestricted: false } });
  const services = await open('/guard', guard);
  expect(await screen.findByTestId('check-battery')).toHaveTextContent(/To do/);
  fireEvent.press(screen.getByTestId('done-battery'));
  await waitFor(() => expect(screen.getByTestId('check-battery')).toHaveTextContent(/Done/));
  expect(await services.store.guardSteps()).toEqual(['battery']);
});

test('elsewhere the battery step follows Android only', async () => {
  await open('/guard', fakeGuard({ state: { batteryUnrestricted: false } }).guard);
  expect(await screen.findByTestId('check-battery')).toHaveTextContent(/To do/);
  expect(screen.queryByTestId('done-battery')).toBeNull();
});

test('switched on but not running: the screen says so and offers the settings', async () => {
  const { guard, calls } = fakeGuard({ state: { enabled: true, connected: false } });
  await open('/guard', guard);
  expect(await screen.findByTestId('guard-status')).toHaveTextContent("The guard isn't running");
  expect(screen.getByText(/switch FutureFlow guard off and on again/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('guard-enable'));
  await waitFor(() => expect(calls.settings).toEqual(['accessibility']));
});

test("Today warns when the guard is on but isn't running", async () => {
  await open('/', fakeGuard({ state: { enabled: true, connected: false } }).guard);
  expect(await screen.findByText("The guard isn't running")).toBeTruthy();
  expect(screen.getByTestId('open-guard')).toBeTruthy();
});

test('on a Xiaomi phone a battery step Android reports done has nothing to tick', async () => {
  await open('/guard', fakeGuard({ state: { xiaomi: true, batteryUnrestricted: true } }).guard);
  expect(await screen.findByTestId('check-battery')).toHaveTextContent(/Done/);
  expect(screen.queryByTestId('done-battery')).toBeNull();
});

test('usage access shows its state and opens its settings', async () => {
  const { guard, calls } = fakeGuard({ state: { usageAccess: false } });
  await open('/guard', guard);
  expect(await screen.findByTestId('check-usage')).toHaveTextContent(/To do/);
  fireEvent.press(screen.getByTestId('fix-usage'));
  await waitFor(() => expect(calls.settings).toEqual(['usage']));
});

test('the privacy line says sites stay on the phone too', async () => {
  await open('/guard', fakeGuard().guard);
  expect(await screen.findByText(/apps and sites you open stay on this phone/)).toBeTruthy();
});
