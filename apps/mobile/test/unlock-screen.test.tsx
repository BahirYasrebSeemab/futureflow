import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppProvider, type AppServices } from '@/lib/app';
import type { Guard } from '@/lib/guard/types';
import { RootStack } from '@/screens/root-stack';
import { UnlockScreen } from '@/screens/unlock';
import { fakeGuard, ledgerEvent, PAIRED, testServices } from './support/fakes';

const REASON = 'my sister needs the group chat';
const TEN_MIN = 600_000;

async function open(guard?: Guard, prepare?: (s: AppServices) => Promise<void>) {
  const services = await testServices({}, PAIRED, guard === undefined ? {} : { guard });
  await prepare?.(services);
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      unlock: UnlockScreen,
    },
    { initialUrl: '/unlock' },
  );
  return services;
}

test('a reason of 20 characters starts the 10-minute wait, kept in the store', async () => {
  const { guard } = fakeGuard();
  const services = await open(guard);
  const start = await screen.findByTestId('unlock-start');
  fireEvent.changeText(screen.getByTestId('unlock-reason'), 'too short');
  expect(start).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('unlock-reason'), REASON);
  fireEvent.press(screen.getByTestId('unlock-start'));
  expect(await screen.findByTestId('unlock-countdown')).toHaveTextContent('10:00');
  expect((await services.store.unlockWait())?.reason).toBe(REASON);
  expect(screen.queryByTestId('unlock-confirm')).toBeNull();
});

test('after the wait: the unlock is queued, the guard gets 10 minutes, and the wait is cleared', async () => {
  const { guard, calls, tick } = fakeGuard();
  const services = await open(guard);
  fireEvent.changeText(await screen.findByTestId('unlock-reason'), REASON);
  fireEvent.press(screen.getByTestId('unlock-start'));
  await screen.findByTestId('unlock-countdown');
  tick(TEN_MIN);
  fireEvent.press(await screen.findByTestId('unlock-confirm', {}, { timeout: 3000 }));

  expect(await screen.findByTestId('unlock-done')).toHaveTextContent(/10 min unlocked/);
  expect(screen.getByText(/tomorrow's earnings/)).toBeTruthy();
  const queued = [...(await services.store.pending()), ...(await services.store.confirmed())];
  const event = queued.find((e) => e.kind === 'unlock_borrow');
  expect(event).toMatchObject({ seconds: 600, reason: REASON });
  expect(calls.grants).toEqual([[event?.id, 600]]);
  expect(await services.store.unlockWait()).toBeNull();
});

test('leaving and coming back keeps the wait running, not restarted', async () => {
  const { guard, tick } = fakeGuard();
  await open(guard, async (s) => {
    await s.store.saveUnlockWait({ reason: REASON, startedAt: 0, startElapsed: 0, bootId: '1' });
  });
  tick(4 * 60_000);
  expect(await screen.findByTestId('unlock-countdown', {}, { timeout: 3000 })).toHaveTextContent(
    '6:00',
  );
});

test('a reboot starts the wait again', async () => {
  const { guard, reboot } = fakeGuard();
  const services = await open(guard, async (s) => {
    await s.store.saveUnlockWait({ reason: REASON, startedAt: 0, startElapsed: 0, bootId: '1' });
  });
  reboot();
  expect(
    await screen.findByText(/restarted, so the wait starts again/, {}, { timeout: 3000 }),
  ).toBeTruthy();
  await waitFor(async () => expect((await services.store.unlockWait())?.bootId).toBe('2'));
  expect(screen.getByTestId('unlock-countdown')).toHaveTextContent('10:00');
});

test('after two unlocks today there is no form, only the limit', async () => {
  const { guard } = fakeGuard();
  await open(guard, async (s) => {
    const today = '2026-10-14';
    await s.store.enqueue(
      [1, 2].map((n) => ({
        ...ledgerEvent(n),
        day: today,
        kind: 'unlock_borrow' as const,
        seconds: 600,
      })),
    );
  });
  expect(await screen.findByTestId('unlock-limit')).toHaveTextContent(/both emergency unlocks/);
  expect(screen.queryByTestId('unlock-reason')).toBeNull();
});

test('a wait can be cancelled', async () => {
  const { guard } = fakeGuard();
  const services = await open(guard);
  fireEvent.changeText(await screen.findByTestId('unlock-reason'), REASON);
  fireEvent.press(screen.getByTestId('unlock-start'));
  fireEvent.press(await screen.findByTestId('unlock-cancel'));
  expect(await screen.findByTestId('unlock-reason')).toBeTruthy();
  expect(await services.store.unlockWait()).toBeNull();
});

test('without the native guard the screen says unlocks need the Android app', async () => {
  await open();
  expect(await screen.findByText(/needs the Android app/)).toBeTruthy();
  expect(screen.queryByTestId('unlock-reason')).toBeNull();
});

test('in debt, the screen says how much of the unlock the debt takes', async () => {
  const { guard } = fakeGuard();
  await open(guard, async (s) => {
    await s.store.enqueue([{ ...ledgerEvent(1), kind: 'usage_spend' as const, seconds: -240 }]);
  });
  expect(await screen.findByTestId('unlock-debt')).toHaveTextContent(
    'You owe 4 min, so this unlock leaves you 6 min.',
  );
});

test('without debt there is no debt note', async () => {
  const { guard } = fakeGuard();
  await open(guard);
  expect(await screen.findByTestId('unlock-reason')).toBeTruthy();
  expect(screen.queryByTestId('unlock-debt')).toBeNull();
});
