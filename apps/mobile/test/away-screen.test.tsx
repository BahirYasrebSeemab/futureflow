import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { act } from 'expo-router/testing-library';
import type { Api, ApiResult, Plan } from '@/lib/api/client';
import { AppProvider, type AppServices } from '@/lib/app';
import { readHome, saveHome } from '@/lib/away';
import type { Locator } from '@/lib/location';
import { AwayScreen } from '@/screens/away';
import { DiagnosticsScreen } from '@/screens/diagnostics';
import { PlanScreen } from '@/screens/plan';
import { RootStack } from '@/screens/root-stack';
import { TabsLayout } from '@/screens/tabs';
import { TodayScreen } from '@/screens/today';
import { PAIRED, sampleToday, testServices } from './support/fakes';

const TORONTO = { lat: 43.6532, lon: -79.3832 };
const base = sampleToday().plan!;
const tomorrowPlan: Plan = { ...base, day: '2026-10-15' };
const offline: ApiResult<never> = { ok: false, error: { kind: 'network' } };

async function openAway(api: Partial<Api>, locator?: Locator): Promise<AppServices> {
  const services = await testServices(api, PAIRED, locator ? { locator } : {});
  await services.syncer.sync(); // saves the snapshot: today is 2026-10-14
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': TodayScreen,
      away: AwayScreen,
      '(tabs)/plan': PlanScreen,
      diagnostics: DiagnosticsScreen,
    },
    { initialUrl: '/away' },
  );
  return services;
}

const declared = (body: { id: string }) => ({
  ok: true as const,
  data: { id: body.id, days: [{ day: '2026-10-15', kind: 'away' as const }] },
});

test('declares a window with the kept tasks and saves it on the phone', async () => {
  const declareAway = jest.fn(async (body: { id: string }) => declared(body));
  const services = await openAway({
    getPlan: async (day) => ({ ok: true, data: day === '2026-10-15' ? tomorrowPlan : null }),
    declareAway,
  });
  fireEvent.press(await screen.findByTestId('start-1'));
  fireEvent.press(screen.getByTestId('days-plus'));
  expect(screen.getByTestId('days-count')).toHaveTextContent('2');
  fireEvent.changeText(screen.getByTestId('place'), 'Montreal');
  fireEvent.press(await screen.findByTestId('keep-0'));
  fireEvent.press(screen.getByTestId('declare-away'));
  await waitFor(() => expect(declareAway).toHaveBeenCalled());
  const body = declareAway.mock.calls[0]![0];
  expect(body).toEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    from: '2026-10-15',
    to: '2026-10-16',
    place: 'Montreal',
    keptTaskIds: [base.tasks[0]!.id],
  });
  await waitFor(async () =>
    expect(await services.store.awayWindows()).toEqual([
      { id: body.id, from: '2026-10-15', to: '2026-10-16' },
    ]),
  );
  expect(await screen.findByTestId('balance')).toBeTruthy();
});

test('a retried declaration reuses the same id', async () => {
  const declareAway = jest
    .fn()
    .mockImplementationOnce(async () => offline)
    .mockImplementation(async (body: { id: string }) => declared(body));
  await openAway({ declareAway });
  fireEvent.changeText(await screen.findByTestId('place'), 'Montreal');
  fireEvent.press(screen.getByTestId('declare-away'));
  expect(await screen.findByText('Declaring away needs a connection.')).toBeTruthy();
  fireEvent.press(screen.getByTestId('declare-away'));
  await waitFor(() => expect(declareAway).toHaveBeenCalledTimes(2));
  expect(declareAway.mock.calls[1]![0].id).toBe(declareAway.mock.calls[0]![0].id);
});

test('setting home stores the location only on the phone', async () => {
  const sendAwayVerdict = jest.fn();
  const services = await openAway({ sendAwayVerdict }, { coarse: async () => TORONTO });
  expect(await screen.findByText(/Set your home first/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('set-home'));
  expect(await screen.findByText('Home is set')).toBeTruthy();
  expect(await readHome(services.secrets)).toEqual(TORONTO);
  expect(sendAwayVerdict).not.toHaveBeenCalled();
});

test('no location fix says so and keeps home unset', async () => {
  await openAway({}, { coarse: async () => null });
  fireEvent.press(await screen.findByTestId('set-home'));
  expect(await screen.findByText('Could not get your location.')).toBeTruthy();
});

test('the place is required before declaring', async () => {
  await openAway({});
  expect(await screen.findByTestId('declare-away')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('place'), '   ');
  expect(screen.getByTestId('declare-away')).toBeDisabled();
});

test('the day count stays between 1 and 30', async () => {
  await openAway({});
  fireEvent.press(await screen.findByTestId('days-minus'));
  expect(screen.getByTestId('days-count')).toHaveTextContent('1');
  for (let i = 0; i < 40; i++) fireEvent.press(screen.getByTestId('days-plus'));
  expect(screen.getByTestId('days-count')).toHaveTextContent('30');
});

function answerAlert(label: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  act(() => buttons.find((b) => b.text === label)?.onPress?.());
}

test('moving an existing home asks first, and Cancel keeps it', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const services = await testServices({}, PAIRED, { locator: { coarse: async () => TORONTO } });
  await saveHome(services.secrets, { lat: 1, lon: 1 });
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
      away: AwayScreen,
      '(tabs)/plan': PlanScreen,
      diagnostics: DiagnosticsScreen,
    },
    { initialUrl: '/away' },
  );
  fireEvent.press(await screen.findByTestId('set-home'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
  answerAlert('Cancel');
  await act(async () => undefined);
  expect(await readHome(services.secrets)).toEqual({ lat: 1, lon: 1 });
  fireEvent.press(screen.getByTestId('set-home'));
  answerAlert('Move home');
  await waitFor(async () => expect(await readHome(services.secrets)).toEqual(TORONTO));
});

test('kept tasks are named for their day, and the screen warns about being home', async () => {
  await openAway({
    getPlan: async (day) => ({ ok: true, data: day === '2026-10-15' ? tomorrowPlan : null }),
  });
  fireEvent.press(await screen.findByTestId('start-1'));
  expect(await screen.findByText('Keep these tasks on Tomorrow')).toBeTruthy();
  fireEvent.press(screen.getByTestId('days-plus'));
  expect(screen.getByText('On the other days every task is excused.')).toBeTruthy();
  expect(screen.getByText(/Before 8 pm only being away counts/)).toBeTruthy();
});
