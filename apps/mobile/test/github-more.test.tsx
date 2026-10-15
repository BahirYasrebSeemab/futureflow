import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import type { Api } from '@/lib/api/client';
import { AppProvider, type AppServices } from '@/lib/app';
import { CoachScreen } from '@/screens/coach';
import { DiagnosticsScreen } from '@/screens/diagnostics';
import { GithubScreen } from '@/screens/github';
import { MoreScreen } from '@/screens/more';
import { ReadingScreen } from '@/screens/reading';
import { RoadmapScreen } from '@/screens/roadmap';
import { RootStack } from '@/screens/root-stack';
import { TodayScreen } from '@/screens/today';
import { PAIRED, testServices } from './support/fakes';

const TOKEN = 'github_pat_' + 'x'.repeat(40);
const linked = {
  login: 'bahir',
  repos: ['bahir/futureflow'],
  status: 'ok' as const,
  unreadableRepos: [],
};

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

async function open(url: string, api: Partial<Api> = {}): Promise<AppServices> {
  const services = await testServices(api, PAIRED);
  await services.syncer.sync();
  renderRouter(
    {
      _layout: () => (
        <AppProvider load={async () => services}>
          <RootStack />
        </AppProvider>
      ),
      index: TodayScreen,
      github: GithubScreen,
      more: MoreScreen,
      roadmap: RoadmapScreen,
      reading: ReadingScreen,
      coach: CoachScreen,
      diagnostics: DiagnosticsScreen,
    },
    { initialUrl: url },
  );
  return services;
}

test('linking sends the token and repos once, then the token is cleared and never stored', async () => {
  const linkGithub = jest.fn(async () => ({ ok: true as const, data: linked }));
  const services = await open('/github', { linkGithub });
  expect(await screen.findByText(/default branch/)).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('github-token'), TOKEN);
  fireEvent.changeText(screen.getByTestId('github-repos'), 'bahir/futureflow\n');
  fireEvent.press(screen.getByTestId('link-github'));
  await waitFor(() =>
    expect(linkGithub).toHaveBeenCalledWith({ token: TOKEN, repos: ['bahir/futureflow'] }),
  );
  expect(await screen.findByText('Linked as bahir')).toBeTruthy();
  expect(screen.queryByDisplayValue(TOKEN)).toBeNull();
  const kept = JSON.stringify((services.secrets as unknown as { snapshot(): unknown }).snapshot());
  expect(kept).not.toContain(TOKEN);
});

test('a bad repo name blocks linking; a refused token shows the server reason', async () => {
  await open('/github', {
    linkGithub: async () => ({
      ok: false,
      error: {
        kind: 'rejected',
        status: 422,
        code: 'github_token_invalid',
        message: 'GitHub rejected the token. Create a new fine-grained, read-only token.',
      },
    }),
  });
  fireEvent.changeText(await screen.findByTestId('github-token'), TOKEN);
  fireEvent.changeText(screen.getByTestId('github-repos'), 'not a repo');
  expect(screen.getByTestId('link-github')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('github-repos'), 'bahir/futureflow');
  fireEvent.press(screen.getByTestId('link-github'));
  expect(await screen.findByText(/GitHub rejected the token/)).toBeTruthy();
});

test('an invalid link asks to reconnect and lists unreadable repos; unlink asks first', async () => {
  const unlinkGithub = jest.fn(async () => ({ ok: true as const, data: { deleted: true } }));
  await open('/github', {
    getGithubLink: async () => ({
      ok: true,
      // The server reports unreadable repos among the linked ones.
      data: {
        ...linked,
        repos: ['bahir/futureflow', 'bahir/old'],
        status: 'invalid',
        unreadableRepos: ['bahir/old'],
      },
    }),
    unlinkGithub,
  });
  expect(await screen.findByText(/Reconnect GitHub/)).toBeTruthy();
  expect(screen.getByText(/bahir\/old can't be read/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('unlink-github'));
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  act(() => buttons.find((b) => b.text === 'Unlink')?.onPress?.());
  await waitFor(() => expect(unlinkGithub).toHaveBeenCalled());
  expect(await screen.findByTestId('github-token')).toBeTruthy();
});

test('Today opens the coach and More; More lists the settings', async () => {
  await open('/');
  fireEvent.press(await screen.findByTestId('open-more'));
  expect(await screen.findByTestId('more-roadmap')).toBeTruthy();
  fireEvent.press(screen.getByTestId('more-github'));
  expect(await screen.findByText(/default branch/)).toBeTruthy();
});

test('Today has a Coach button', async () => {
  await open('/');
  fireEvent.press(await screen.findByTestId('open-coach'));
  expect(await screen.findByTestId('coach-input')).toBeTruthy();
});
