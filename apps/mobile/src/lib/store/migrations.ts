import type { SqlDb } from './sql';

/** One entry per schema version; never edit a shipped entry, append a new one. */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE outbox (id TEXT PRIMARY KEY, at INTEGER NOT NULL, event TEXT NOT NULL);
   CREATE TABLE dead_letters (id TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, buried_at INTEGER NOT NULL);
   CREATE TABLE ledger (id TEXT PRIMARY KEY, at INTEGER NOT NULL, event TEXT NOT NULL);
   CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // 2: math practice (P4c-1)
  `CREATE TABLE math_progress (topic_id TEXT PRIMARY KEY, progress TEXT NOT NULL);
   CREATE TABLE math_items (item_key TEXT PRIMARY KEY, rating REAL NOT NULL);
   CREATE TABLE math_attempts (id TEXT PRIMARY KEY, day TEXT NOT NULL, at INTEGER NOT NULL,
     attempt TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE math_seen (problem_key TEXT PRIMARY KEY, at INTEGER NOT NULL);`,
  // 3: worked examples, mock exams and the word-problem bank (P4c-2)
  `CREATE TABLE math_examples (topic_id TEXT PRIMARY KEY, at INTEGER NOT NULL);
   CREATE TABLE mock_results (id TEXT PRIMARY KEY, day TEXT NOT NULL, level TEXT NOT NULL,
     score REAL NOT NULL, result TEXT NOT NULL);
   CREATE TABLE math_bank (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, topic_id TEXT NOT NULL,
     difficulty INTEGER NOT NULL, problem TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0);`,
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
