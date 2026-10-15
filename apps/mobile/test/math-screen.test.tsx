import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { Api, Today } from '@/lib/api/client';
import { AppProvider, type AppServices } from '@/lib/app';
import { answerText, ONTARIO_GRAPH, type TopicProgress } from '@/lib/math/engine';
import { displayAnswer } from '@/lib/math/display';
import { serveProblem } from '@/lib/math/practice';
import { AwayScreen } from '@/screens/away';
import { DiagnosticsScreen } from '@/screens/diagnostics';
import { MathScreen } from '@/screens/math';
import { PlacementScreen } from '@/screens/math/placement';
import { PlanScreen } from '@/screens/plan';
import { RootStack } from '@/screens/root-stack';
import { TodayScreen } from '@/screens/today';
import { ledgerEvent, PAIRED, sampleToday, testServices } from './support/fakes';

const SEED = Math.floor(0.5 * 2 ** 31);
const DAY = '2026-10-14';
const first = () =>
  serveProblem(
    { progress: new Map<string, TopicProgress>(), itemRating: () => undefined },
    DAY,
    SEED,
  )!;

beforeEach(() => {
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
});

async function open(api: Partial<Api> = {}, url = '/math'): Promise<AppServices> {
  const services = await testServices(api, PAIRED);
  await services.syncer.sync(); // saved snapshot: 2026-10-14, plan locked
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      index: TodayScreen,
      math: MathScreen,
      'math-placement': PlacementScreen,
      plan: PlanScreen,
      away: AwayScreen,
      diagnostics: DiagnosticsScreen,
    },
    { initialUrl: url },
  );
  return services;
}

async function startPractice() {
  fireEvent.press(await screen.findByTestId('skip-placement'));
  return screen.findByTestId('problem-prompt');
}

function answer(text: string) {
  fireEvent.changeText(screen.getByTestId('answer-input'), text);
  fireEvent.press(screen.getByTestId('check'));
}

test('first open offers placement or a start from the beginning', async () => {
  await open();
  expect(await screen.findByText('Find your level')).toBeTruthy();
  expect(screen.getByTestId('start-placement')).toBeTruthy();
  expect(screen.getByTestId('skip-placement')).toBeTruthy();
});

test('starting from the beginning serves the first topic', async () => {
  await open();
  expect(await startPractice()).toHaveTextContent(first().problem.prompt);
  expect(screen.getByText(ONTARIO_GRAPH.topics[0]!.title)).toBeTruthy();
});

test('a correct answer with a locked plan earns 3 minutes and is saved', async () => {
  const services = await open();
  await startPractice();
  answer(answerText(first().problem.answer));
  expect(await screen.findByText('Correct')).toBeTruthy();
  expect(screen.getByText('+3 min')).toBeTruthy();
  expect(await services.store.attemptsOn(DAY)).toEqual([
    expect.objectContaining({ correct: true }),
  ]);
  expect(await services.store.pending()).toEqual([
    expect.objectContaining({ kind: 'math_reward', seconds: 180 }),
  ]);
});

test('an unreadable answer asks again and saves nothing', async () => {
  const services = await open();
  await startPractice();
  answer('abc');
  expect(await screen.findByText(/I couldn't read that/)).toBeTruthy();
  expect(screen.getByTestId('answer-input')).toHaveProp('value', 'abc');
  expect(await services.store.attemptsOn(DAY)).toEqual([]);
});

test('a wrong answer shows the right answer and the steps', async () => {
  await open();
  await startPractice();
  answer('-999999');
  expect(
    await screen.findByText(`Not quite. The answer is ${displayAnswer(first().problem)}`),
  ).toBeTruthy();
  expect(screen.getByText(first().problem.steps[0]!)).toBeTruthy();
});

test('a hint marks the answer as earning nothing', async () => {
  await open();
  await startPractice();
  fireEvent.press(screen.getByTestId('hint'));
  expect(await screen.findByText(first().problem.hints[0]!)).toBeTruthy();
  answer(answerText(first().problem.answer));
  expect(await screen.findByText('Earns nothing after a hint')).toBeTruthy();
});

test('showing the answer counts as a wrong attempt', async () => {
  const services = await open();
  await startPractice();
  fireEvent.press(screen.getByTestId('show-answer'));
  expect(await screen.findByText(/^Not quite\. The answer is/)).toBeTruthy();
  expect(await services.store.attemptsOn(DAY)).toEqual([
    expect.objectContaining({ correct: false }),
  ]);
});

test('without a locked plan, a correct answer says how to earn', async () => {
  const draft = sampleToday();
  const today: Today = { ...draft, plan: { ...draft.plan!, status: 'draft' } };
  await open({ today: async () => ({ ok: true, data: today }) });
  await startPractice();
  answer(answerText(first().problem.answer));
  expect(await screen.findByText("Lock today's plan to earn time")).toBeTruthy();
});

test('Next serves another problem', async () => {
  await open();
  await startPractice();
  answer('-999999');
  fireEvent.press(await screen.findByTestId('next'));
  await waitFor(() => expect(screen.getByTestId('answer-input')).toHaveProp('value', ''));
  expect(screen.queryByText(/^Not quite/)).toBeNull();
});

test('a paused placement offers to continue', async () => {
  const services = await testServices({}, PAIRED);
  await services.syncer.sync();
  await services.store.savePlacement({
    state: { low: 0, high: 13, correctAtProbe: 1 },
    done: false,
  });
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      index: TodayScreen,
      math: MathScreen,
      'math-placement': PlacementScreen,
    },
    { initialUrl: '/math' },
  );
  expect(await screen.findByText('Continue the placement test')).toBeTruthy();
});

test('placement refuses to start over existing practice', async () => {
  const services = await testServices({}, PAIRED);
  await services.syncer.sync();
  await services.store.saveMathProgress([
    { topicId: 'fractions', rating: 1100, streak: 2, mastered: false, reviewStage: 0 },
  ]);
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      index: TodayScreen,
      math: MathScreen,
      'math-placement': PlacementScreen,
    },
    { initialUrl: '/math-placement' },
  );
  expect(await screen.findByText(/already started practising/)).toBeTruthy();
  expect(screen.queryByTestId('problem-prompt')).toBeNull();
});

test('Show answer works after an unreadable answer', async () => {
  await open();
  await startPractice();
  answer('abc');
  expect(await screen.findByText(/I couldn't read that/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('show-answer'));
  expect(await screen.findByText(/^Not quite\. The answer is/)).toBeTruthy();
});

test('the result shows even if passing the math task fails', async () => {
  const services = await open({
    decideVerdict: async () => {
      throw new Error('network died');
    },
  });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await services.store.saveAttempt({
    id: '01920000-0000-7000-8000-000000000990',
    day: DAY,
    at: 1,
    topicId: 'fractions',
    difficulty: 3,
    correct: true,
    answerType: 'typed',
  });
  for (let i = 0; i < 9; i++) {
    await services.store.saveAttempt({
      id: `01920000-0000-7000-8000-00000000098${i}`,
      day: DAY,
      at: 2 + i,
      topicId: 'fractions',
      difficulty: 3,
      correct: true,
      answerType: 'typed',
    });
  }
  await startPractice();
  answer(answerText(first().problem.answer));
  expect(await screen.findByText('Correct')).toBeTruthy();
});

test('one answer is never recorded twice', async () => {
  const services = await open();
  await startPractice();
  fireEvent.changeText(screen.getByTestId('answer-input'), answerText(first().problem.answer));
  fireEvent.press(screen.getByTestId('check'));
  fireEvent.press(screen.getByTestId('check'));
  expect(await screen.findByText('Correct')).toBeTruthy();
  expect(await services.store.attemptsOn(DAY)).toHaveLength(1);
});

test('placement: a double tap saves one attempt', async () => {
  const services = await open();
  fireEvent.press(await screen.findByTestId('start-placement'));
  fireEvent.changeText(await screen.findByTestId('answer-input'), '-999999');
  fireEvent.press(screen.getByTestId('check'));
  fireEvent.press(screen.getByTestId('check'));
  await waitFor(async () => expect((await services.store.attemptsOn(DAY)).length).toBe(1));
});

test('placement says it is about 10 problems', async () => {
  await open();
  expect(await screen.findByText(/About 10 problems/)).toBeTruthy();
});

test('placement: wrong answers walk down to the first topic, then practice starts there', async () => {
  const services = await open();
  fireEvent.press(await screen.findByTestId('start-placement'));
  for (let i = 0; i < 10; i++) {
    const done = screen.queryByTestId('go-practice');
    if (done !== null) break;
    fireEvent.changeText(await screen.findByTestId('answer-input'), '-999999');
    fireEvent.press(screen.getByTestId('check'));
    await waitFor(() =>
      expect(
        screen.queryByTestId('go-practice') ?? screen.getByTestId('answer-input'),
      ).toBeTruthy(),
    );
  }
  expect(await screen.findByText(`You start at: ${ONTARIO_GRAPH.topics[0]!.title}`)).toBeTruthy();
  expect(await services.store.placement()).toMatchObject({ done: true });
  expect((await services.store.attemptsOn(DAY)).length).toBeGreaterThan(0);
  fireEvent.press(screen.getByTestId('go-practice'));
  expect(await screen.findByTestId('problem-prompt')).toBeTruthy();
});

test('Today has a Math button and shows a math task’s progress', async () => {
  await open({}, '/');
  expect(await screen.findByText(/of 10 problems/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('open-math'));
  expect(await screen.findByText('Find your level')).toBeTruthy();
});

test('time that pays back borrowed time says so', async () => {
  const services = await open();
  await services.store.applyPage(
    [ledgerEvent(1, { kind: 'unlock_borrow', seconds: 600 })],
    1,
    true,
  );
  await startPractice();
  answer(answerText(first().problem.answer));
  expect(await screen.findByText('+3 min, paid toward borrowed time')).toBeTruthy();
});
