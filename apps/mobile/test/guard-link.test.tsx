import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { AppProvider, useApp } from '@/lib/app';
import { fakeGuard, PAIRED, testServices } from './support/fakes';

function Forget() {
  const { forgetPairing } = useApp();
  return (
    <Pressable testID="forget" onPress={() => void forgetPairing()}>
      <Text>Forget</Text>
    </Pressable>
  );
}

test('a paired phone hands the guard its token; forgetting the pairing takes it back', async () => {
  const { guard, calls } = fakeGuard();
  const services = await testServices({}, PAIRED, { guard });
  render(
    <AppProvider load={async () => services}>
      <Forget />
    </AppProvider>,
  );
  await waitFor(() => expect(calls.linked).toEqual([['https://api.test', PAIRED.device_token]]));
  expect(calls.unlinked).toBe(0);

  fireEvent.press(screen.getByTestId('forget'));
  await waitFor(() => expect(calls.unlinked).toBe(1));
  expect(calls.linked).toHaveLength(1);
});

test('an unpaired phone leaves the guard without a token', async () => {
  const { guard, calls } = fakeGuard();
  const services = await testServices({}, {}, { guard });
  render(
    <AppProvider load={async () => services}>
      <Forget />
    </AppProvider>,
  );
  await waitFor(() => expect(calls.unlinked).toBe(1));
  expect(calls.linked).toEqual([]);
});

test('a guard that fails to link does not stop the app, and the log names only the error', async () => {
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const { guard } = fakeGuard({
    link: async () => {
      throw new TypeError('boom');
    },
  });
  const services = await testServices({}, PAIRED, { guard });
  render(
    <AppProvider load={async () => services}>
      <Forget />
    </AppProvider>,
  );
  expect(await screen.findByTestId('forget')).toBeTruthy();
  await waitFor(() =>
    expect(errors).toHaveBeenCalledWith(
      JSON.stringify({ event: 'guard_link_failed', name: 'TypeError' }),
    ),
  );
  expect(JSON.stringify(errors.mock.calls)).not.toContain(PAIRED.device_token);
  errors.mockRestore();
});
