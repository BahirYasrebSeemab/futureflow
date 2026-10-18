import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';
import type { AppServices } from './app';
import { createApi } from './api/client';
import { parseApiUrl } from './config';
import { makeIds } from './ids';
import { nativeGuard } from './guard/native';
import { BLOCKED_APPS } from './guard/types';
import { expoLocator } from './location';
import { TOKEN_KEY } from './pairing';
import { secureSecrets } from './secrets';
import { migrate } from './store/migrations';
import { sqliteStore } from './store/sqlite-store';
import { createSyncer } from './sync';

/** Production wiring. Native modules only, so it is covered by the emulator run, not Jest. */
export async function createServices(): Promise<AppServices> {
  // Expo inlines only this exact expression at build time.
  const allowHttp = __DEV__ || Constants.expoConfig?.extra?.allowCleartext === true;
  const apiUrl = parseApiUrl(process.env.EXPO_PUBLIC_API_URL, { allowHttp });
  const db = await openDatabaseAsync('futureflow.db');
  await db.execAsync('PRAGMA journal_mode = WAL');
  await migrate(db);
  const store = sqliteStore(db);
  const api = createApi({
    baseUrl: apiUrl,
    fetch: (input, init) => fetch(input, init),
    getToken: () => secureSecrets.get(TOKEN_KEY),
  });
  const now = () => Date.now();
  const ids = makeIds(getRandomBytes);
  const guard = nativeGuard();
  // CI's emulator also blocks Settings, so the flow can show the shield on an app it always has.
  const extraBlocked: string[] = Constants.expoConfig?.extra?.e2eBlockedApps ?? [];
  try {
    await guard.setBlockedApps([...BLOCKED_APPS.map(([pkg]) => pkg), ...extraBlocked], true);
  } catch (error) {
    // The app must still open; the guard keeps its last list.
    const name = error instanceof Error ? error.name : 'unknown';
    console.error(JSON.stringify({ event: 'guard_setup_failed', name }));
  }
  return {
    api,
    store,
    secrets: secureSecrets,
    ids,
    syncer: createSyncer({ api, store, now, guard: { native: guard, newId: ids.newId } }),
    locator: expoLocator,
    guard,
    now,
    apiUrl,
  };
}
