import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { Api, Roadmap } from '@/lib/api/client';
import { AppProvider } from '@/lib/app';
import { RoadmapScreen } from '@/screens/roadmap';
import { RootStack } from '@/screens/root-stack';
import { TabsLayout } from '@/screens/tabs';
import { TodayScreen } from '@/screens/today';
import { PAIRED, testServices } from './support/fakes';

const saved: Roadmap = {
  identities: [{ id: '01920000-0000-7000-8000-00000000c001', title: 'Engineer', why: 'Build' }],
  skills: [
    {
      id: '01920000-0000-7000-8000-00000000b001',
      identityId: '01920000-0000-7000-8000-00000000c001',
      name: 'Coding',
      rubric: 'Ship commits',
      verifier: 'github',
    },
  ],
  milestones: [],
};

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
      roadmap: RoadmapScreen,
    },
    { initialUrl: '/roadmap' },
  );
}

test('an empty roadmap is built and saved with the expected shape', async () => {
  const saveRoadmap = jest.fn(async (r: Roadmap) => ({ ok: true as const, data: r }));
  await open({ saveRoadmap });
  expect(await screen.findByText(/Who do you want to become\?/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('add-identity'));
  fireEvent.changeText(await screen.findByTestId('identity-title-0'), 'Software engineer');
  fireEvent.changeText(screen.getByTestId('identity-why-0'), 'Build things that matter');
  fireEvent.press(screen.getByTestId('add-skill-0'));
  fireEvent.changeText(await screen.findByTestId('skill-name-0'), 'Math');
  fireEvent.changeText(screen.getByTestId('skill-rubric-0'), 'Practice problems');
  fireEvent.press(screen.getByTestId('skill-0-verifier-math'));
  fireEvent.press(screen.getByTestId('skill-0-rest-5'));
  fireEvent.press(screen.getByTestId('add-milestone-0'));
  fireEvent.changeText(await screen.findByTestId('milestone-title-0'), 'Finish L0');
  fireEvent.press(screen.getByTestId('save-roadmap'));
  await waitFor(() => expect(saveRoadmap).toHaveBeenCalled());
  const body = saveRoadmap.mock.calls[0]![0];
  expect(body.identities).toEqual([
    { id: expect.any(String), title: 'Software engineer', why: 'Build things that matter' },
  ]);
  expect(body.skills).toEqual([
    {
      id: expect.any(String),
      identityId: body.identities[0]!.id,
      name: 'Math',
      rubric: 'Practice problems',
      verifier: 'math',
      restWeekday: 5,
    },
  ]);
  expect(body.milestones).toEqual([
    { id: expect.any(String), skillId: body.skills[0]!.id, title: 'Finish L0', done: false },
  ]);
  expect(await screen.findByText('Roadmap saved.')).toBeTruthy();
});

test('problems block saving and are listed', async () => {
  await open({});
  fireEvent.press(await screen.findByTestId('add-identity'));
  expect(await screen.findByText('Give each identity a title.')).toBeTruthy();
  expect(screen.getByTestId('save-roadmap')).toBeDisabled();
});

test('an existing roadmap loads; save waits for a change; offline saving says so', async () => {
  await open({
    getRoadmap: async () => ({ ok: true, data: saved }),
    saveRoadmap: async () => ({ ok: false, error: { kind: 'network' } }),
  });
  expect(await screen.findByDisplayValue('Engineer')).toBeTruthy();
  expect(screen.getByTestId('save-roadmap')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('identity-why-0'), 'Build useful things');
  fireEvent.press(screen.getByTestId('save-roadmap'));
  expect(await screen.findByText('Saving needs a connection.')).toBeTruthy();
});

test('removing an identity removes its skills', async () => {
  await open({ getRoadmap: async () => ({ ok: true, data: saved }) });
  expect(await screen.findByDisplayValue('Coding')).toBeTruthy();
  fireEvent.press(screen.getByTestId('remove-identity-0'));
  expect(screen.queryByDisplayValue('Coding')).toBeNull();
});

test('after a failed load there is no editor to save over the server roadmap', async () => {
  const getRoadmap = jest
    .fn<ReturnType<Api['getRoadmap']>, []>()
    .mockResolvedValueOnce({ ok: false, error: { kind: 'network' } })
    .mockResolvedValueOnce({ ok: true, data: saved });
  await open({ getRoadmap });
  expect(await screen.findByText('Loading the roadmap needs a connection.')).toBeTruthy();
  expect(screen.queryByTestId('add-identity')).toBeNull();
  expect(screen.queryByTestId('save-roadmap')).toBeNull();
  fireEvent.press(screen.getByTestId('retry-roadmap'));
  expect(await screen.findByDisplayValue('Engineer')).toBeTruthy();
});

test('text fields stop at the server limits', async () => {
  await open({});
  fireEvent.press(await screen.findByTestId('add-identity'));
  expect(await screen.findByTestId('identity-title-0')).toHaveProp('maxLength', 80);
  expect(screen.getByTestId('identity-why-0')).toHaveProp('maxLength', 500);
});
