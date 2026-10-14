import type { ApiResult } from '@/lib/api/client';
import {
  DEVICE_ID_KEY,
  forgetPairing,
  pairDevice,
  readSession,
  TOKEN_KEY,
  type PairDeps,
} from '@/lib/pairing';
import { migrate } from '@/lib/store/migrations';
import { sqliteStore } from '@/lib/store/sqlite-store';
import { ledgerEvent, memorySecrets } from './support/fakes';
import { nodeSqlDb } from './support/node-sql';

const CODE = 'setup-code-0123456789';
const DEVICE = '01920000-0000-7000-8000-0000000000d1';
const TOKEN_A = 'A'.repeat(43);
const TOKEN_B = 'B'.repeat(43);

function setup(replies: ApiResult<{ deviceId: string }>[]) {
  const secrets = memorySecrets();
  const tokens = [TOKEN_A, TOKEN_B];
  const seen: { token: string; storedToken: string | null; offset: number }[] = [];
  const deps: PairDeps = {
    secrets,
    newToken: () => tokens.shift() ?? 'unexpected',
    utcOffsetMinutes: () => -240,
    api: {
      pair: async (body) => {
        seen.push({
          token: body.token,
          storedToken: await secrets.get(TOKEN_KEY),
          offset: body.utcOffsetMinutes,
        });
        return replies.shift() ?? { ok: false, error: { kind: 'network' } };
      },
    },
  };
  return { deps, secrets, seen };
}

test('saves the new token before calling the server, then the device id on success', async () => {
  const { deps, secrets, seen } = setup([{ ok: true, data: { deviceId: DEVICE } }]);
  expect(await pairDevice(deps, { code: ` ${CODE} `, deviceName: ' My phone ' })).toEqual({
    ok: true,
    deviceId: DEVICE,
  });
  expect(seen).toEqual([{ token: TOKEN_A, storedToken: TOKEN_A, offset: -240 }]);
  expect(secrets.snapshot()).toEqual({ [TOKEN_KEY]: TOKEN_A, [DEVICE_ID_KEY]: DEVICE });
  expect(await readSession(secrets)).toEqual({ status: 'paired', deviceId: DEVICE });
});

test('a retry after a lost answer reuses the saved token', async () => {
  const { deps, seen } = setup([
    { ok: false, error: { kind: 'network' } },
    { ok: true, data: { deviceId: DEVICE } },
  ]);
  expect(await pairDevice(deps, { code: CODE, deviceName: 'P' })).toEqual({
    ok: false,
    message: "Can't reach the server. Check the connection and try again.",
  });
  expect((await pairDevice(deps, { code: CODE, deviceName: 'P' })).ok).toBe(true);
  expect(seen.map((s) => s.token)).toEqual([TOKEN_A, TOKEN_A]);
});

test('server refusals show the server message and keep the token for the next try', async () => {
  const { deps, secrets } = setup([
    {
      ok: false,
      error: {
        kind: 'rejected',
        status: 401,
        code: 'invalid_code',
        message: 'The setup code is wrong.',
      },
    },
    {
      ok: false,
      error: {
        kind: 'server',
        status: 503,
        code: 'pairing_disabled',
        message: 'Pairing is not configured on the server.',
      },
    },
    { ok: false, error: { kind: 'invalid_response' } },
  ]);
  const tries = [];
  for (let i = 0; i < 3; i++) tries.push(await pairDevice(deps, { code: CODE, deviceName: 'P' }));
  expect(tries).toEqual([
    { ok: false, message: 'The setup code is wrong.' },
    { ok: false, message: 'Pairing is not configured on the server.' },
    {
      ok: false,
      message: 'The server sent an answer this app does not understand. Update the app.',
    },
  ]);
  expect(secrets.snapshot()).toEqual({ [TOKEN_KEY]: TOKEN_A });
  expect(await readSession(secrets)).toEqual({ status: 'unpaired' });
});

test.each([
  ['short code', { code: 'short', deviceName: 'P' }, 'The setup code is at least 16 characters.'],
  ['nameless', { code: CODE, deviceName: '   ' }, 'Give this phone a name of up to 64 characters.'],
  [
    'long name',
    { code: CODE, deviceName: 'x'.repeat(65) },
    'Give this phone a name of up to 64 characters.',
  ],
])('refuses a %s without touching the network or the token', async (_label, input, message) => {
  const { deps, secrets, seen } = setup([]);
  expect(await pairDevice(deps, input)).toEqual({ ok: false, message });
  expect([seen, secrets.snapshot()]).toEqual([[], {}]);
});

test('a device id without a token is not a session', async () => {
  expect(await readSession(memorySecrets({ [DEVICE_ID_KEY]: DEVICE }))).toEqual({
    status: 'unpaired',
  });
});

test('forgetPairing removes the secrets and the server copy but keeps unsent events', async () => {
  const secrets = memorySecrets({ [TOKEN_KEY]: TOKEN_A, [DEVICE_ID_KEY]: DEVICE });
  const db = nodeSqlDb();
  await migrate(db);
  const store = sqliteStore(db);
  await store.enqueue([ledgerEvent(1)]);
  await store.applyPage([ledgerEvent(2)], 1, true);
  await forgetPairing(secrets, store);
  expect([secrets.snapshot(), await store.pending(), await store.confirmed()]).toEqual([
    {},
    [ledgerEvent(1)],
    [],
  ]);
});
