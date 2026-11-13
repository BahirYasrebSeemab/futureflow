import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { AppProvider, type AppServices } from '@/lib/app';
import { answerText, ONTARIO_GRAPH } from '@/lib/math/engine';
import { startMock } from '@/lib/math/mocks';
import { MockScreen } from '@/screens/math/mock';
import { MockListScreen } from '@/screens/math/mock-list';
import { RootStack } from '@/screens/root-stack';
import { TabsLayout } from '@/screens/tabs';
import { TodayScreen } from '@/screens/today';
import { NOW, PAIRED, testServices } from './support/fakes';

const SEED = Math.floor(0.5 * 2 ** 31);
const L2_TOPICS = ONTARIO_GRAPH.topics.filter((t) => t.level === 'L2').map((t) => t.id);

beforeEach(() => {
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

async function open(url: string, setup?: (s: AppServices) => Promise<void>) {
  const base = await testServices({}, PAIRED);
  await base.syncer.sync();
  const clock = { now: NOW };
  const services: AppServices = { ...base, now: () => clock.now };
  await setup?.(services);
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': TodayScreen,
      mocks: MockListScreen,
      mock: MockScreen,
    },
    { initialUrl: url },
  );
  return { services, clock };
}

test('the list shows each level and Gate A progress, with the best score', async () => {
  await open('/mocks', async (s) => {
    await s.store.saveMockResult('m1', {
      day: '2026-10-13',
      level: 'L2',
      score: 0.82,
      topicIds: L2_TOPICS,
      problemCount: L2_TOPICS.length * 5,
    });
  });
  expect(await screen.findByTestId('mock-L0')).toBeTruthy();
  expect(screen.getByTestId('mock-L2')).toHaveTextContent(/Best: 82%/);
  expect(
    screen.getByText('Gate A: 1 of 2 passing L2 mocks (75%+), on different days'),
  ).toBeTruthy();
});

test('a mock gives no feedback until the end; time up scores unanswered as wrong', async () => {
  const { services, clock } = await open('/mock?level=L0');
  const exam = startMock('L0', SEED, NOW);
  expect(await screen.findByText(`Question 1 of ${exam.problems.length}`)).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('answer-input'), answerText(exam.problems[0]!.answer));
  fireEvent.press(screen.getByTestId('mock-next'));
  expect(await screen.findByText(`Question 2 of ${exam.problems.length}`)).toBeTruthy();
  expect(screen.queryByText(/Correct|Not quite/)).toBeNull();
  clock.now = exam.endsAt + 1;
  fireEvent.changeText(screen.getByTestId('answer-input'), answerText(exam.problems[1]!.answer));
  fireEvent.press(screen.getByTestId('mock-next'));
  expect(
    await screen.findByText(`You scored 1 of ${exam.problems.length}`, { exact: false }),
  ).toBeTruthy();
  await waitFor(async () => expect(await services.store.mockResults()).toHaveLength(1));
});

test('an unreadable answer asks again and does not advance', async () => {
  await open('/mock?level=L0');
  fireEvent.changeText(await screen.findByTestId('answer-input'), 'abc');
  fireEvent.press(screen.getByTestId('mock-next'));
  expect(await screen.findByText(/I couldn't read that/)).toBeTruthy();
  expect(screen.getByText(/^Question 1 of/)).toBeTruthy();
});

test('leaving a mock saves nothing', async () => {
  const { services } = await open('/');
  await screen.findByTestId('balance');
  act(() => router.push('/mock?level=L0'));
  fireEvent.changeText(await screen.findByTestId('answer-input'), '1');
  fireEvent.press(screen.getByTestId('mock-next'));
  act(() => router.back());
  // Leaving asks first; only "Leave" leaves, and nothing is saved.
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  act(() => buttons.find((b) => b.text === 'Leave')?.onPress?.());
  expect(await screen.findByTestId('balance')).toBeTruthy();
  expect(await services.store.mockResults()).toEqual([]);
});

test('after a mock, the list shows the new score', async () => {
  const { clock } = await open('/mocks');
  fireEvent.press(await screen.findByTestId('mock-L0'));
  const exam = startMock('L0', SEED, NOW);
  fireEvent.changeText(
    await screen.findByTestId('answer-input'),
    answerText(exam.problems[0]!.answer),
  );
  clock.now = exam.endsAt + 1;
  fireEvent.press(screen.getByTestId('mock-next'));
  expect(await screen.findByText(/^You scored/)).toBeTruthy();
  act(() => router.back());
  await waitFor(() => expect(screen.getByTestId('mock-L0')).toHaveTextContent(/Best: 0%/));
});
