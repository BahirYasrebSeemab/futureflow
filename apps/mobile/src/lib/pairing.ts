import type { Api } from './api/client';
import type { SecretStore } from './secrets';
import type { LocalStore } from './store/types';

export const TOKEN_KEY = 'device_token';
export const DEVICE_ID_KEY = 'device_id';

const MIN_CODE = 16;
const MAX_CODE = 128;
const MAX_NAME = 64;

export type Session = { status: 'paired'; deviceId: string } | { status: 'unpaired' };

export type PairDeps = Readonly<{
  api: Pick<Api, 'pair'>;
  secrets: SecretStore;
  newToken: () => string;
  utcOffsetMinutes: () => number;
}>;

export type PairOutcome = { ok: true; deviceId: string } | { ok: false; message: string };

const MESSAGES = {
  codeLength: `The setup code is ${MIN_CODE} to ${MAX_CODE} characters.`,
  badName: `Give this phone a name of up to ${MAX_NAME} characters.`,
  offline: "Can't reach the server. Check the connection and try again.",
  invalid: 'The server sent an answer this app does not understand. Update the app.',
} as const;

export async function readSession(secrets: SecretStore): Promise<Session> {
  const [deviceId, token] = await Promise.all([secrets.get(DEVICE_ID_KEY), secrets.get(TOKEN_KEY)]);
  return deviceId !== null && token !== null
    ? { status: 'paired', deviceId }
    : { status: 'unpaired' };
}

/**
 * The token is invented here and saved BEFORE the request, so a retry after a lost answer sends the
 * same token and the server recognises the phone (see the pair route).
 */
export async function pairDevice(
  deps: PairDeps,
  input: { code: string; deviceName: string },
): Promise<PairOutcome> {
  const code = input.code.trim();
  const deviceName = input.deviceName.trim();
  if (code.length < MIN_CODE || code.length > MAX_CODE) {
    return { ok: false, message: MESSAGES.codeLength };
  }
  if (deviceName.length === 0 || deviceName.length > MAX_NAME) {
    return { ok: false, message: MESSAGES.badName };
  }

  let token = await deps.secrets.get(TOKEN_KEY);
  if (token === null) {
    token = deps.newToken();
    await deps.secrets.set(TOKEN_KEY, token);
  }
  const result = await deps.api.pair({
    code,
    token,
    deviceName,
    utcOffsetMinutes: deps.utcOffsetMinutes(),
  });
  if (result.ok) {
    await deps.secrets.set(DEVICE_ID_KEY, result.data.deviceId);
    return { ok: true, deviceId: result.data.deviceId };
  }
  switch (result.error.kind) {
    case 'network':
      return { ok: false, message: MESSAGES.offline };
    case 'invalid_response':
      return { ok: false, message: MESSAGES.invalid };
    case 'server':
    case 'rejected':
      return { ok: false, message: result.error.message };
  }
}

/**
 * After the server forgets this phone: drop the credentials and the server's copy. Unsent events
 * stay: the ledger belongs to the one owner, so they are still owed after pairing again.
 */
export async function forgetPairing(secrets: SecretStore, store: LocalStore): Promise<void> {
  await store.clearServerCopy();
  await secrets.remove(DEVICE_ID_KEY);
  await secrets.remove(TOKEN_KEY);
}
