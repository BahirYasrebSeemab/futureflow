import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import type { Api, ApiResult, Plan } from '@/lib/api/client';
import { AppProvider } from '@/lib/app';
import { PlanScreen } from '@/screens/plan';
import { RootStack } from '@/screens/root-stack';
import { TodayScreen } from '@/screens/today';
import { PAIRED, sampleToday, testServices } from './support/fakes';

const TOMORROW = '2026-10-15';
const base = sampleToday().plan!;
const proposed: Plan = { day: TOMORROW, status: 'draft', tasks: base.tasks };
const threeTasks: Plan = {
  ...proposed,
  tasks: [...proposed.tasks, { ...proposed.tasks[0]!, id: '01920000-0000-7000-8000-00000000a003' }],
};
const offline: ApiResult<never> = { ok: false, error: { kind: 'network' } };
const planFor =
  (plan: Plan): Api['getPlan'] =>
  async (day) => ({ ok: true, data: day === TOMORROW ? plan : null });

async function openPlan(api: Partial<Api>) {
  const services = await testServices(api, PAIRED);
  await services.syncer.sync(); // saves the snapshot: today is 2026-10-14
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      index: TodayScreen,
      plan: PlanScreen,
    },
    { initialUrl: '/plan' },
  );
  return services;
}

/** Presses the named button of the latest Alert. */
function answerAlert(label: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  act(() => buttons.find((b) => b.text === label)?.onPress?.());
}

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

test('shows tomorrow empty and proposes a plan', async () => {
  const proposePlan = jest.fn(async () => ({
    ok: true as const,
    data: { plan: proposed, source: 'template' as const },
  }));
  await openPlan({ proposePlan });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  expect(await screen.findByText('No plan yet')).toBeTruthy();
  fireEvent.press(screen.getByTestId('propose'));
  expect(await screen.findByDisplayValue('Fractions practice')).toBeTruthy();
  expect(screen.getByText('From your roadmap')).toBeTruthy();
  expect(proposePlan).toHaveBeenCalledWith(TOMORROW);
});

test('edits are saved with the new values', async () => {
  const savePlan = jest.fn(async (_day: string, tasks: readonly Plan['tasks'][number][]) => ({
    ok: true as const,
    data: { ...proposed, tasks: [...tasks] },
  }));
  await openPlan({ getPlan: planFor(proposed), savePlan });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.changeText(await screen.findByTestId('title-0'), 'Decimals');
  fireEvent.changeText(screen.getByTestId('minutes-0'), '45');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  fireEvent.press(screen.getByTestId('save-plan'));
  await waitFor(() => expect(savePlan).toHaveBeenCalled());
  expect(savePlan.mock.calls[0]![1][0]).toMatchObject({
    full: { title: 'Decimals', seconds: 2700 },
  });
  await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
});

test('lock needs 3 tasks', async () => {
  await openPlan({ getPlan: planFor(proposed) });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  expect(await screen.findByText('A plan needs 3 to 5 tasks to lock.')).toBeTruthy();
  expect(screen.getByTestId('lock-plan')).toBeDisabled();
});

test('lock saves unsaved edits first, and a failed save locks nothing', async () => {
  const lockPlan = jest.fn(async () => offline);
  await openPlan({ getPlan: planFor(threeTasks), savePlan: async () => offline, lockPlan });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.changeText(await screen.findByTestId('title-0'), 'Decimals');
  fireEvent.press(screen.getByTestId('lock-plan'));
  answerAlert('Lock');
  expect(await screen.findByText('Planning needs a connection.')).toBeTruthy();
  expect(lockPlan).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('Decimals')).toBeTruthy();
});

test('a confirmed lock shows the plan as locked and read-only', async () => {
  const locked: Plan = {
    ...threeTasks,
    status: 'locked',
    lockedAt: Date.UTC(2026, 9, 14, 21, 40),
  };
  const lockPlan = jest.fn(async () => ({ ok: true as const, data: locked }));
  await openPlan({ getPlan: planFor(threeTasks), lockPlan });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.press(await screen.findByTestId('lock-plan'));
  answerAlert('Cancel');
  expect(lockPlan).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('lock-plan'));
  answerAlert('Lock');
  expect(await screen.findByText(/^Locked at/)).toBeTruthy();
  expect(screen.queryByTestId('title-0')).toBeNull();
  expect(screen.getAllByText('Fractions practice').length).toBeGreaterThan(0);
});

test('adding a task picks a skill from the roadmap', async () => {
  const identity = '01920000-0000-7000-8000-00000000c001';
  const roadmap = {
    identities: [{ id: identity, title: 'Engineer', why: 'Build things' }],
    skills: [
      {
        id: '01920000-0000-7000-8000-00000000b001',
        identityId: identity,
        name: 'Reading',
        rubric: 'Read daily',
        verifier: 'reading' as const,
      },
    ],
    milestones: [],
  };
  await openPlan({
    getPlan: planFor(proposed),
    getRoadmap: async () => ({ ok: true, data: roadmap }),
  });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.press(await screen.findByTestId('add-task'));
  fireEvent.press(await screen.findByText('Reading'));
  expect(await screen.findByTestId('title-2')).toBeTruthy();
  expect(screen.getByText('Give the task a title.')).toBeTruthy();
  expect(screen.getByTestId('save-plan')).toBeDisabled();
  fireEvent.press(screen.getByTestId('remove-2'));
  expect(screen.queryByTestId('title-2')).toBeNull();
});

test('unsaved edits block switching day until discarded', async () => {
  await openPlan({ getPlan: planFor(proposed) });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.changeText(await screen.findByTestId('title-0'), 'Decimals');
  expect(screen.getByTestId('plan-today')).toBeDisabled();
  fireEvent.press(screen.getByTestId('discard'));
  expect(await screen.findByDisplayValue('Fractions practice')).toBeTruthy();
  expect(screen.getByTestId('plan-today')).toBeEnabled();
});

test('server refusals show their meaning', async () => {
  await openPlan({
    proposePlan: async () => ({
      ok: false,
      error: { kind: 'rejected', status: 422, code: 'nothing_to_plan', message: 'x' },
    }),
  });
  fireEvent.press(await screen.findByTestId('plan-tomorrow'));
  fireEvent.press(await screen.findByTestId('propose'));
  expect(await screen.findByText('Add skills to your roadmap first.')).toBeTruthy();
});

test('loading the plan offline says planning needs a connection', async () => {
  await openPlan({ getPlan: async () => offline });
  expect(await screen.findByText('Planning needs a connection.')).toBeTruthy();
});
