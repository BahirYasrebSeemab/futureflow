import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';
import type { ApiResult, Today } from '@/lib/api/client';
import { AppProvider, type AppServices } from '@/lib/app';
import { StartupError } from '@/lib/config';
import { DiagnosticsScreen } from '@/screens/diagnostics';
import { PairScreen } from '@/screens/pair';
import { RootStack } from '@/screens/root-stack';
import { TodayScreen } from '@/screens/today';
import { ledgerEvent, PAIRED, sampleToday, testServices } from './support/fakes';

function mount(load: () => Promise<AppServices>, initialUrl = '/') {
  return renderRouter(
    {
      _layout: () => (
        <AppProvider load={load}>
          <RootStack />
        </AppProvider>
      ),
      index: TodayScreen,
      pair: PairScreen,
      diagnostics: DiagnosticsScreen,
    },
    { initialUrl },
  );
}

const ready = (services: AppServices) => async () => services;
const offline: ApiResult<never> = { ok: false, error: { kind: 'network' } };
const unauthorized: ApiResult<never> = {
  ok: false,
  error: { kind: 'rejected', status: 401, code: 'unauthorized', message: 'x' },
};

test('an unpaired phone lands on pairing; a good code opens Today', async () => {
  const grant = ledgerEvent(1, { kind: 'base_grant', seconds: 3900 });
  const services = await testServices({
    pair: async () => ({ ok: true, data: { deviceId: PAIRED.device_id } }),
    pullLedger: async (since) => ({
      ok: true,
      data: since === 0 ? { events: [grant], next: 1 } : { events: [], next: since },
    }),
  });
  mount(ready(services));
  expect(await screen.findByText('Pair this phone')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('setup-code'), 'setup-code-0123456789');
  fireEvent.press(screen.getByTestId('pair-button'));
  expect(await screen.findByTestId('balance')).toHaveTextContent('1 h 05 min');
});

test('a refused code shows the reason inline and keeps the draft', async () => {
  const services = await testServices({
    pair: async () => ({
      ok: false,
      error: {
        kind: 'rejected',
        status: 401,
        code: 'invalid_code',
        message: 'The setup code is wrong.',
      },
    }),
  });
  mount(ready(services));
  fireEvent.changeText(await screen.findByTestId('setup-code'), 'setup-code-0123456789');
  fireEvent.press(screen.getByTestId('pair-button'));
  expect(await screen.findByText('The setup code is wrong.')).toBeTruthy();
  expect(screen.getByTestId('setup-code')).toHaveProp('value', 'setup-code-0123456789');
  expect(screen.getByTestId('pair-button')).toBeEnabled();
});

test('Today shows the balance, earned time, tasks and their verdicts', async () => {
  const services = await testServices({}, PAIRED);
  await services.store.applyPage([ledgerEvent(1, { kind: 'base_grant', seconds: 3960 })], 1, true);
  mount(ready(services));
  expect(await screen.findByTestId('balance')).toHaveTextContent('1 h 06 min');
  expect(await screen.findByText('Fractions practice')).toBeTruthy();
  expect(screen.getByText('Earned today 25 min')).toBeTruthy();
  expect(screen.getByText('Wednesday 14 October')).toBeTruthy();
  expect(screen.getByText('Passed')).toBeTruthy();
  expect(screen.getByText('Not checked yet')).toBeTruthy();
});

test('a day without a plan says so instead of showing an empty list', async () => {
  const services = await testServices(
    { today: async () => ({ ok: true, data: sampleToday({ plan: null }) }) },
    PAIRED,
  );
  mount(ready(services));
  expect(await screen.findByText('No plan for today')).toBeTruthy();
});

test('first load offline shows Retry, and Retry loads', async () => {
  let reply: ApiResult<Today> = offline;
  const services = await testServices({ today: async () => reply }, PAIRED);
  mount(ready(services));
  expect(await screen.findByText("Can't load today")).toBeTruthy();
  reply = { ok: true, data: sampleToday() };
  fireEvent.press(screen.getByTestId('retry'));
  expect(await screen.findByText('Fractions practice')).toBeTruthy();
});

test('a first sync that stops before the ledger is pulled shows Retry, not a balance', async () => {
  const services = await testServices({ pullLedger: async () => offline }, PAIRED);
  mount(ready(services));
  expect(await screen.findByText("Can't load today")).toBeTruthy();
  expect(screen.queryByTestId('balance')).toBeNull();
});

test('offline after a good sync keeps the saved day with a banner', async () => {
  let reply: ApiResult<Today> = { ok: true, data: sampleToday() };
  const services = await testServices({ today: async () => reply }, PAIRED);
  await services.syncer.sync();
  reply = offline;
  mount(ready(services));
  expect(await screen.findByText(/^Offline\. Showing what was saved at/)).toBeTruthy();
  expect(screen.getByText('Fractions practice')).toBeTruthy();
});

test('a forgotten phone (401) offers Pair again, keeping unsent events', async () => {
  const services = await testServices(
    { pushEvents: async () => unauthorized, today: async () => unauthorized },
    PAIRED,
  );
  await services.store.enqueue([ledgerEvent(1)]);
  mount(ready(services));
  expect(await screen.findByText(/new setup code/)).toBeTruthy();
  fireEvent.press(screen.getByText('Pair again'));
  expect(await screen.findByText('Pair this phone')).toBeTruthy();
  expect(await services.store.counts()).toEqual({ pending: 1, dead: 0 });
  expect(await services.secrets.get('device_token')).toBeNull();
});

test('Diagnostics shows the queue and syncs on demand', async () => {
  let syncs = 0;
  const services = await testServices(
    {
      today: async () => {
        syncs++;
        return { ok: true, data: sampleToday() };
      },
    },
    PAIRED,
  );
  await services.store.enqueue([ledgerEvent(1), ledgerEvent(2)]);
  mount(ready(services), '/diagnostics');
  expect(await screen.findByText('Waiting to send')).toBeTruthy();
  expect(screen.getByTestId('pending-count')).toHaveTextContent('2');
  fireEvent.press(screen.getByTestId('sync-now'));
  await waitFor(() => expect(screen.getByTestId('pending-count')).toHaveTextContent('0'));
  expect(syncs).toBe(1);
});

test('a failed startup shows the reason on a full screen', async () => {
  const load = async (): Promise<AppServices> => {
    throw new StartupError(
      'This build has no server address. Set EXPO_PUBLIC_API_URL and rebuild.',
    );
  };
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mount(load);
  expect(
    await screen.findByText(
      'This build has no server address. Set EXPO_PUBLIC_API_URL and rebuild.',
    ),
  ).toBeTruthy();
  expect(errors).toHaveBeenCalledWith(
    JSON.stringify({ event: 'startup_failed', name: 'StartupError' }),
  );
});

test('an unexpected startup failure shows a generic reason', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mount(async () => {
    throw new Error('disk I/O error at /data/user/0/private');
  });
  expect(await screen.findByText(/could not open its storage/)).toBeTruthy();
  expect(screen.queryByText(/private/)).toBeNull();
});

test('returning to the app syncs again', async () => {
  const listen = jest.spyOn(AppState, 'addEventListener');
  let syncs = 0;
  const services = await testServices(
    {
      today: async () => {
        syncs++;
        return { ok: true, data: sampleToday() };
      },
    },
    PAIRED,
  );
  mount(ready(services));
  expect(await screen.findByText('Fractions practice')).toBeTruthy();
  const onChange = listen.mock.calls.at(-1)?.[1] as (state: AppStateStatus) => void;
  await act(async () => onChange('background'));
  await act(async () => onChange('active'));
  await waitFor(() => expect(syncs).toBe(2));
});

test('a sync that crashes keeps the saved day and logs only the error name', async () => {
  const base = await testServices({}, PAIRED);
  await base.store.saveToday({ today: sampleToday(), savedAt: base.now() });
  await base.store.applyPage([], 0, true);
  const services: AppServices = {
    ...base,
    syncer: {
      sync: async () => {
        throw new TypeError('private detail');
      },
    },
  };
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mount(ready(services));
  expect(await screen.findByText('Fractions practice')).toBeTruthy();
  await waitFor(() =>
    expect(errors).toHaveBeenCalledWith(
      JSON.stringify({ event: 'sync_failed', name: 'TypeError' }),
    ),
  );
  expect(JSON.stringify(errors.mock.calls)).not.toContain('private detail');
});

test('a sync that crashes on first launch ends in Retry, not an endless spinner', async () => {
  const base = await testServices({}, PAIRED);
  const services: AppServices = {
    ...base,
    syncer: {
      sync: async () => {
        throw new TypeError('boom');
      },
    },
  };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mount(ready(services));
  expect(await screen.findByText("Can't load today")).toBeTruthy();
});
