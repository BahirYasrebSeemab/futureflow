import type { SqlDb } from './sql';

/** One entry per schema version; never edit a shipped entry, append a new one. */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE outbox (id TEXT PRIMARY KEY, at INTEGER NOT NULL, event TEXT NOT NULL);
   CREATE TABLE dead_letters (id TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, buried_at INTEGER NOT NULL);
   CREATE TABLE ledger (id TEXT PRIMARY KEY, at INTEGER NOT NULL, event TEXT NOT NULL);
   CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SqlDb): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) throw new Error('The local database is from a newer app version.');
  for (let version = current; version < SCHEMA_VERSION; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version] ?? '');
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
