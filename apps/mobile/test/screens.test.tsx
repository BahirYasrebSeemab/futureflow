import {
  act,
  fireEvent,
  renderRouter,
  screen,
  testRouter,
  waitFor,
} from 'expo-router/testing-library';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import type { ApiResult, Today } from '@/lib/api/client';
import { AppProvider, type AppServices } from '@/lib/app';
import { saveHome } from '@/lib/away';
import { StartupError } from '@/lib/config';
import { DiagnosticsScreen } from '@/screens/diagnostics';
import { PairScreen } from '@/screens/pair';
import { PlanScreen } from '@/screens/plan';
import { AwayScreen } from '@/screens/away';
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
      plan: PlanScreen,
      away: AwayScreen,
    },
    { initialUrl },
  );
}

/** Presses the named button of the latest Alert. */
function answerAlert(label: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  act(() => buttons.find((b) => b.text === label)?.onPress?.());
}

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

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
  expect(screen.getByText('Earned today 0 min')).toBeTruthy();
  expect(screen.getByText('Daily allowance 1 h 06 min')).toBeTruthy();
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
      idle: async () => undefined,
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
      idle: async () => undefined,
      sync: async () => {
        throw new TypeError('boom');
      },
    },
  };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mount(ready(services));
  expect(await screen.findByText("Can't load today")).toBeTruthy();
});

test('a storage failure while pairing shows an error and frees the button', async () => {
  const services = await testServices({
    pair: async () => ({ ok: true, data: { deviceId: PAIRED.device_id } }),
  });
  const broken: AppServices = {
    ...services,
    secrets: {
      ...services.secrets,
      set: async () => {
        throw new Error('keystore');
      },
    },
  };
  mount(ready(broken));
  fireEvent.changeText(await screen.findByTestId('setup-code'), 'setup-code-0123456789');
  fireEvent.press(screen.getByTestId('pair-button'));
  expect(
    await screen.findByText('Could not save the pairing on this phone. Try again.'),
  ).toBeTruthy();
  expect(screen.getByTestId('pair-button')).toBeEnabled();
});

test('an answer the app does not understand says to update the app', async () => {
  const services = await testServices(
    { today: async () => ({ ok: false, error: { kind: 'invalid_response' } }) },
    PAIRED,
  );
  mount(ready(services));
  expect(await screen.findByText(/Update the app/)).toBeTruthy();
});

test('Diagnostics frees its button when loading fails after a sync', async () => {
  const services = await testServices({}, PAIRED);
  let calls = 0;
  const flaky: AppServices = {
    ...services,
    store: {
      ...services.store,
      counts: async () => {
        calls++;
        if (calls > 1) throw new Error('disk');
        return services.store.counts();
      },
    },
  };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mount(ready(flaky), '/diagnostics');
  fireEvent.press(await screen.findByTestId('sync-now'));
  await waitFor(() => expect(screen.getByText('Sync now')).toBeTruthy());
  expect(screen.getByTestId('sync-now')).toBeEnabled();
});

test('coming back to Today from another screen syncs again', async () => {
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
  fireEvent.press(screen.getByTestId('diagnostics-link'));
  expect(await screen.findByText('Waiting to send')).toBeTruthy();
  act(() => testRouter.back());
  await waitFor(() => expect(syncs).toBe(2));
});

test("Today's Plan button opens the Plan screen", async () => {
  const services = await testServices({}, PAIRED);
  mount(ready(services));
  fireEvent.press(await screen.findByTestId('open-plan'));
  expect(await screen.findByText('Plan today')).toBeTruthy();
});

test('a confirmed bad day shrinks the tasks to their 2-minute versions', async () => {
  let record: Today['dayRecord'] = null;
  const declareBadDay = jest.fn(async (day: string) => {
    record = { day, kind: 'bad' };
    return { ok: true as const, data: record };
  });
  const services = await testServices(
    { today: async () => ({ ok: true, data: sampleToday({ dayRecord: record }) }), declareBadDay },
    PAIRED,
  );
  mount(ready(services));
  fireEvent.press(await screen.findByTestId('bad-day'));
  answerAlert('Yes, bad day');
  expect(await screen.findByText('Bad day: 2-minute versions count')).toBeTruthy();
  expect(screen.getAllByText('One problem')).toHaveLength(2);
  expect(screen.getAllByText('2-minute version')).toHaveLength(2);
  expect(declareBadDay).toHaveBeenCalledWith('2026-10-14');
  expect(screen.queryByTestId('bad-day')).toBeNull();
});

test('cancelling the bad day sends nothing; a used week says so', async () => {
  const declareBadDay = jest.fn(async () => ({
    ok: false as const,
    error: {
      kind: 'rejected' as const,
      status: 409,
      code: 'bad_day_limit_reached',
      message: 'x',
    },
  }));
  const services = await testServices({ declareBadDay }, PAIRED);
  mount(ready(services));
  fireEvent.press(await screen.findByTestId('bad-day'));
  answerAlert('Cancel');
  expect(declareBadDay).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('bad-day'));
  answerAlert('Yes, bad day');
  expect(await screen.findByText("This week's bad day is already used.")).toBeTruthy();
});

test('declaring a bad day offline says it needs a connection', async () => {
  const services = await testServices({}, PAIRED);
  mount(ready(services));
  fireEvent.press(await screen.findByTestId('bad-day'));
  answerAlert('Yes, bad day');
  expect(await screen.findByText('Declaring a day needs a connection.')).toBeTruthy();
});

test('an away day excuses the tasks not kept', async () => {
  const today = sampleToday();
  const kept = today.plan!.tasks[0]!.id;
  const services = await testServices(
    {
      today: async () => ({
        ok: true,
        data: {
          ...today,
          dayRecord: {
            day: today.day,
            kind: 'away',
            away: { place: 'Montreal', keptTaskIds: [kept], verified: 'pending' },
          },
        },
      }),
    },
    PAIRED,
  );
  mount(ready(services));
  expect(await screen.findByText('Away: Montreal')).toBeTruthy();
  expect(screen.getByText('Excused')).toBeTruthy();
  expect(screen.getByText('Passed')).toBeTruthy();
  expect(screen.queryByTestId('bad-day')).toBeNull();
});

test("Today's Away button opens the Away screen", async () => {
  const services = await testServices({}, PAIRED);
  mount(ready(services));
  fireEvent.press(await screen.findByTestId('open-away'));
  expect(await screen.findByText('Going away')).toBeTruthy();
});

function pendingToday() {
  const t = sampleToday();
  const id = t.plan!.tasks[1]!.id;
  const data: Today = {
    ...t,
    verdicts: [
      ...t.verdicts,
      {
        day: t.day,
        taskId: id,
        outcome: 'pending',
        confidence: 0.6,
        by: 'judge',
        evidenceIds: [],
        suggestion: 'pass',
      },
    ],
  };
  return { id, data };
}

test('a pending task can be confirmed done after a warning', async () => {
  const { id, data } = pendingToday();
  const decideVerdict = jest.fn(async () => ({
    ok: true as const,
    data: {
      day: data.day,
      taskId: id,
      outcome: 'pass' as const,
      confidence: 1,
      by: 'owner' as const,
      evidenceIds: [],
    },
  }));
  const services = await testServices(
    { today: async () => ({ ok: true, data }), decideVerdict },
    PAIRED,
  );
  mount(ready(services));
  expect(await screen.findByText('The checker thinks: done')).toBeTruthy();
  expect(screen.getByText('Waiting for your answer')).toBeTruthy();
  fireEvent.press(screen.getByTestId(`did-it-${id}`));
  answerAlert('Yes, I did it');
  await waitFor(() =>
    expect(decideVerdict).toHaveBeenCalledWith(id, { day: data.day, outcome: 'pass' }),
  );
});

test('cancel sends nothing', async () => {
  const { id, data } = pendingToday();
  const decideVerdict = jest.fn(async () => offline);
  const services = await testServices(
    { today: async () => ({ ok: true, data }), decideVerdict },
    PAIRED,
  );
  mount(ready(services));
  fireEvent.press(await screen.findByTestId(`not-done-${id}`));
  answerAlert('Cancel');
  expect(decideVerdict).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId(`not-done-${id}`));
  answerAlert('Not done');
  await waitFor(() =>
    expect(decideVerdict).toHaveBeenCalledWith(id, { day: data.day, outcome: 'fail' }),
  );
});

test('an already decided task says so', async () => {
  const { id, data } = pendingToday();
  const services = await testServices(
    {
      today: async () => ({ ok: true, data }),
      decideVerdict: async () => ({
        ok: false,
        error: { kind: 'rejected', status: 409, code: 'verdict_not_pending', message: 'x' },
      }),
    },
    PAIRED,
  );
  mount(ready(services));
  fireEvent.press(await screen.findByTestId(`did-it-${id}`));
  answerAlert('Yes, I did it');
  expect(await screen.findByText('This task was already decided.')).toBeTruthy();
});

test('a pending task in a draft plan or on an excused day has no answer buttons', async () => {
  const { id, data } = pendingToday();
  const draft: Today = { ...data, plan: { ...data.plan!, status: 'draft' } };
  const services = await testServices({ today: async () => ({ ok: true, data: draft }) }, PAIRED);
  mount(ready(services));
  expect(await screen.findByText('Fractions practice')).toBeTruthy();
  expect(screen.queryByTestId(`did-it-${id}`)).toBeNull();
});

test('an away day is measured after the sync, with the fresh day', async () => {
  type Sent = { ok: true; data: { day: string; kind: 'away' } };
  const sendAwayVerdict = jest.fn<Promise<Sent>, [string, unknown]>(async () => ({
    ok: true,
    data: { day: '2026-10-14', kind: 'away' },
  }));
  const awayRecord = {
    day: '2026-10-14',
    kind: 'away' as const,
    away: { place: 'Montreal', keptTaskIds: [], verified: 'pending' as const },
  };
  const services = await testServices(
    {
      today: async () => ({ ok: true, data: sampleToday({ dayRecord: awayRecord }) }),
      sendAwayVerdict,
    },
    PAIRED,
    { locator: { coarse: async () => ({ lat: 45.5, lon: -73.56 }) } }, // Montreal
  );
  await saveHome(services.secrets, { lat: 43.65, lon: -79.38 }); // Toronto
  await services.store.saveAwayWindow({
    id: '01920000-0000-7000-8000-0000000000e1',
    from: '2026-10-14',
    to: '2026-10-14',
  });
  // The saved snapshot is from yesterday, before the sync brings today's away day.
  await services.store.saveToday({ today: sampleToday({ day: '2026-10-13' }), savedAt: 0 });
  mount(ready(services));
  await waitFor(() => expect(sendAwayVerdict).toHaveBeenCalledTimes(1));
  expect(sendAwayVerdict.mock.calls[0]![1]).toEqual({
    day: '2026-10-14',
    verified: 'yes',
    distanceKm: 500,
  });
});

test('after a cancelled away day the Bad day button is back', async () => {
  const services = await testServices(
    {
      today: async () => ({
        ok: true,
        data: sampleToday({ dayRecord: { day: '2026-10-14', kind: 'normal' } }),
      }),
    },
    PAIRED,
  );
  mount(ready(services));
  expect(await screen.findByTestId('bad-day')).toBeTruthy();
});
