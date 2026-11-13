import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { Api, ApiResult } from '@/lib/api/client';
import { AppProvider } from '@/lib/app';
import { ReadingScreen } from '@/screens/reading';
import { RootStack } from '@/screens/root-stack';
import { TabsLayout } from '@/screens/tabs';
import { TodayScreen } from '@/screens/today';
import { PAIRED, testServices } from './support/fakes';

const offline: ApiResult<never> = { ok: false, error: { kind: 'network' } };

async function open(api: Partial<Api>) {
  const services = await testServices(api, PAIRED);
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': TodayScreen,
      reading: ReadingScreen,
    },
    { initialUrl: '/reading' },
  );
  return services;
}

async function fill() {
  fireEvent.changeText(await screen.findByTestId('reading-title'), 'Clean Code');
  fireEvent.press(screen.getByTestId('source-book'));
  fireEvent.changeText(screen.getByTestId('reading-pages'), '20');
  fireEvent.changeText(screen.getByTestId('reading-summary'), 'Names should reveal intent.');
}

test('a valid log is sent with what you learned', async () => {
  const sendReading = jest.fn(async (log: { id: string }) => ({
    ok: true as const,
    data: { id: log.id, created: true },
  }));
  await open({ sendReading });
  await fill();
  fireEvent.press(screen.getByTestId('submit-reading'));
  await waitFor(() => expect(sendReading).toHaveBeenCalled());
  expect(sendReading.mock.calls[0]![0]).toEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    day: '2026-10-14',
    title: 'Clean Code',
    source: 'book',
    pages: 20,
    summary: 'Names should reveal intent.',
  });
  expect(await screen.findByText(/^Saved\. It's checked tonight/)).toBeTruthy();
});

test('submit waits for a title, pages or minutes, and a summary', async () => {
  await open({});
  fireEvent.changeText(await screen.findByTestId('reading-title'), 'Clean Code');
  expect(screen.getByTestId('submit-reading')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('reading-minutes'), '30');
  expect(screen.getByTestId('submit-reading')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('reading-summary'), 'Learned a thing.');
  expect(screen.getByTestId('submit-reading')).toBeEnabled();
  fireEvent.changeText(screen.getByTestId('reading-minutes'), '0');
  expect(screen.getByTestId('submit-reading')).toBeDisabled();
});

test('a retried reading log reuses its id', async () => {
  const sendReading = jest
    .fn()
    .mockImplementationOnce(async () => offline)
    .mockImplementation(async (log: { id: string }) => ({
      ok: true,
      data: { id: log.id, created: true },
    }));
  await open({ sendReading });
  await fill();
  fireEvent.press(screen.getByTestId('submit-reading'));
  expect(await screen.findByText('Saving needs a connection.')).toBeTruthy();
  expect(screen.getByTestId('reading-title')).toHaveProp('value', 'Clean Code');
  fireEvent.press(screen.getByTestId('submit-reading'));
  await waitFor(() => expect(sendReading).toHaveBeenCalledTimes(2));
  expect(sendReading.mock.calls[1]![0].id).toBe(sendReading.mock.calls[0]![0].id);
});

test('reading done yesterday is logged for yesterday', async () => {
  const sendReading = jest.fn(async (log: { id: string }) => ({
    ok: true as const,
    data: { id: log.id, created: true },
  }));
  await open({ sendReading });
  await fill();
  fireEvent.press(screen.getByTestId('read-yesterday'));
  fireEvent.press(screen.getByTestId('submit-reading'));
  await waitFor(() => expect(sendReading).toHaveBeenCalled());
  expect(sendReading.mock.calls[0]![0]).toMatchObject({ day: '2026-10-13' });
});
