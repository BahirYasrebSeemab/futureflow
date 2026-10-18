import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppProvider, type AppServices } from '@/lib/app';
import { currentDayKey } from '@/lib/format';
import type { Guard } from '@/lib/guard/types';
import { BlockedAppsScreen } from '@/screens/blocked-apps';
import { GuardScreen } from '@/screens/guard';
import { RootStack } from '@/screens/root-stack';
import { fakeGuard, NOW, PAIRED, testServices } from './support/fakes';

const INSTALLED = [
  { package: 'com.duolingo', label: 'Duolingo' },
  { package: 'com.instagram.android', label: 'Instagram' },
  { package: 'com.king.candycrush', label: 'Candy Crush' },
];

async function open(url: string, guard: Guard, prepare?: (s: AppServices) => Promise<void>) {
  const services = await testServices({}, PAIRED, { guard });
  await prepare?.(services);
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      guard: GuardScreen,
      'blocked-apps': BlockedAppsScreen,
    },
    { initialUrl: url },
  );
  return services;
}

const lastBlocked = (calls: { blocked: [string[], boolean][] }) => calls.blocked.at(-1);

test('installed apps are listed with the known social apps first, switched as they are blocked', async () => {
  const { guard } = fakeGuard({ installed: INSTALLED });
  await open('/blocked-apps', guard);
  const rows = await screen.findAllByTestId(/^block-app-/);
  expect(rows.map((r) => r.props.testID)).toEqual([
    'block-app-com.instagram.android',
    'block-app-com.king.candycrush',
    'block-app-com.duolingo',
  ]);
  expect(screen.getByTestId('block-app-com.instagram.android').props.value).toBe(true);
  expect(screen.getByTestId('block-app-com.duolingo').props.value).toBe(false);
  expect(screen.getByTestId('block-games').props.value).toBe(true);
});

test('blocking another app applies at once', async () => {
  const { guard, calls } = fakeGuard({ installed: INSTALLED });
  const services = await open('/blocked-apps', guard);
  fireEvent(await screen.findByTestId('block-app-com.duolingo'), 'valueChange', true);
  await waitFor(() => expect(lastBlocked(calls)?.[0]).toContain('com.duolingo'));
  expect((await services.store.blocklist())?.pending).toBeNull();
  expect(screen.queryByTestId('blocklist-pending')).toBeNull();
});

test('unblocking an app or games waits for tomorrow, and says so', async () => {
  const { guard, calls } = fakeGuard({ installed: INSTALLED });
  const services = await open('/blocked-apps', guard);
  fireEvent(await screen.findByTestId('block-app-com.instagram.android'), 'valueChange', false);
  await waitFor(() =>
    expect(screen.getByTestId('blocklist-pending')).toHaveTextContent(/Instagram/),
  );
  fireEvent(screen.getByTestId('block-games'), 'valueChange', false);
  await waitFor(() => expect(screen.getByTestId('blocklist-pending')).toHaveTextContent(/Games/));

  expect(screen.getByTestId('block-app-com.instagram.android').props.value).toBe(false);
  expect(lastBlocked(calls)).toEqual([expect.arrayContaining(['com.instagram.android']), true]);
  const tomorrow = (await services.store.blocklist())?.pending?.from;
  expect(tomorrow).not.toBe(currentDayKey(NOW));
});

test('the Guard screen lists what is blocked now and opens the picker', async () => {
  const { guard } = fakeGuard({ installed: INSTALLED });
  await open('/guard', guard, async (s) => {
    await s.store.saveBlocklist({
      current: { apps: ['com.duolingo', 'com.instagram.android'], games: false },
      pending: null,
    });
  });
  expect(await screen.findByTestId('blocked-names')).toHaveTextContent('Duolingo, Instagram');
  fireEvent.press(screen.getByTestId('change-blocked'));
  expect(await screen.findByTestId('block-games')).toBeTruthy();
});
