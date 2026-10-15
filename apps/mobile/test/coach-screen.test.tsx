import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { Api, ApiResult } from '@/lib/api/client';
import { AppProvider, type AppServices } from '@/lib/app';
import { CoachScreen } from '@/screens/coach';
import { RootStack } from '@/screens/root-stack';
import { TodayScreen } from '@/screens/today';
import { PAIRED, testServices } from './support/fakes';

const msg = (
  id: string,
  role: 'owner' | 'coach',
  text: string,
  createdAt: number,
  kind: 'chat' | 'review' = 'chat',
) => ({
  id,
  role,
  kind,
  text,
  day: '2026-10-14',
  createdAt,
});
const unavailable: ApiResult<never> = {
  ok: false,
  error: {
    kind: 'server',
    status: 503,
    code: 'coach_unavailable',
    message: 'The coach cannot answer right now.',
  },
};

async function open(api: Partial<Api>, setup?: (s: AppServices) => Promise<void>) {
  const services = await testServices(api, PAIRED);
  await setup?.(services);
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      index: TodayScreen,
      coach: CoachScreen,
    },
    { initialUrl: '/coach' },
  );
  return services;
}

function send(text: string) {
  fireEvent.changeText(screen.getByTestId('coach-input'), text);
  fireEvent.press(screen.getByTestId('coach-send'));
}

test('a reply is shown and cached', async () => {
  const sendCoachMessage = jest.fn(async (body: { id: string; text: string }) => ({
    ok: true as const,
    data: {
      message: msg(body.id, 'owner', body.text, 10),
      reply: msg('r1', 'coach', 'Do the 2-minute version first.', 11),
    },
  }));
  const services = await open({ sendCoachMessage });
  await screen.findByTestId('coach-input');
  send('I keep putting off the math set.');
  expect(await screen.findByText('Do the 2-minute version first.')).toBeTruthy();
  expect((await services.store.coachThread()).map((m) => m.role)).toEqual(['owner', 'coach']);
});

test.each([
  ['503', unavailable],
  ['network', { ok: false, error: { kind: 'network' } } as ApiResult<never>],
])(
  'coach unavailable (%s) shows the crisis line, never AI text, and keeps the message',
  async (_label, reply) => {
    await open({ sendCoachMessage: async () => reply });
    await screen.findByTestId('coach-input');
    send('Everything feels pointless today.');
    expect(await screen.findByTestId('coach-unavailable')).toHaveTextContent(/9-8-8/);
    expect(screen.getByTestId('coach-unavailable')).toHaveTextContent(/9-1-1/);
    expect(screen.getByText('Everything feels pointless today.')).toBeTruthy();
    expect(screen.getByText('Not answered yet')).toBeTruthy();
  },
);

test('retry reuses the id', async () => {
  const sendCoachMessage = jest
    .fn()
    .mockImplementationOnce(async () => unavailable)
    .mockImplementation(async (body: { id: string; text: string }) => ({
      ok: true,
      data: {
        message: msg(body.id, 'owner', body.text, 10),
        reply: msg('r2', 'coach', 'Here now.', 11),
      },
    }));
  await open({ sendCoachMessage });
  await screen.findByTestId('coach-input');
  send('Hello?');
  const first = (await waitFor(() => sendCoachMessage.mock.calls[0]![0])) as { id: string };
  fireEvent.press(await screen.findByTestId(`retry-${first.id}`));
  expect(await screen.findByText('Here now.')).toBeTruthy();
  expect(sendCoachMessage.mock.calls[1]![0]).toEqual({ id: first.id, text: 'Hello?' });
  expect(screen.queryByTestId('coach-unavailable')).toBeNull();
});

test('the thread shows cached messages offline, and nightly reviews are labelled', async () => {
  await open(
    { coachMessages: async () => ({ ok: false, error: { kind: 'network' } }) },
    async (s) => {
      await s.store.saveCoachMessages([
        msg('a', 'owner', 'Earlier question', 1),
        msg('b', 'coach', 'Review of your day', 2, 'review'),
      ]);
    },
  );
  expect(await screen.findByText('Earlier question')).toBeTruthy();
  expect(screen.getByText('Nightly review')).toBeTruthy();
});

test('new messages from the server are pulled and cached with the cursor', async () => {
  const services = await open({
    coachMessages: async (since) => ({
      ok: true,
      data:
        since === 0
          ? { messages: [msg('n1', 'coach', 'Good morning.', 5)], next: 7 }
          : { messages: [], next: since },
    }),
  });
  expect(await screen.findByText('Good morning.')).toBeTruthy();
  await waitFor(async () => expect(await services.store.coachCursor()).toBe(7));
});
