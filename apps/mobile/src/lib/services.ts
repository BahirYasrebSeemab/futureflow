import { getRandomBytes } from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';
import type { AppServices } from './app';
import { createApi } from './api/client';
import { parseApiUrl } from './config';
import { makeIds } from './ids';
import { TOKEN_KEY } from './pairing';
import { secureSecrets } from './secrets';
import { migrate } from './store/migrations';
import { sqliteStore } from './store/sqlite-store';
import { createSyncer } from './sync';

/** Production wiring. Native modules only, so it is covered by the emulator run, not Jest. */
export async function createServices(): Promise<AppServices> {
  // Expo inlines only this exact expression at build time.
  const apiUrl = parseApiUrl(process.env.EXPO_PUBLIC_API_URL);
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
  return {
    api,
    store,
    secrets: secureSecrets,
    ids: makeIds(getRandomBytes),
    syncer: createSyncer({ api, store, now }),
    now,
    apiUrl,
  };
}
