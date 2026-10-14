import { DatabaseSync } from 'node:sqlite';
import type { SqlDb, SqlParam } from '@/lib/store/sql';

/** The expo-sqlite async API over Node's built-in SQLite, so the real SQL runs in tests. */
export function nodeSqlDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    runAsync: async (sql, ...params: SqlParam[]) => db.prepare(sql).run(...params),
    getAllAsync: async <T>(sql: string, ...params: SqlParam[]) =>
      db.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, ...params: SqlParam[]) =>
      (db.prepare(sql).get(...params) ?? null) as T | null,
    withTransactionAsync: async (task) => {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
