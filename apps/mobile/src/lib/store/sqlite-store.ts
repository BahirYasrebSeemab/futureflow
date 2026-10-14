import { LedgerEventSchema, TodaySchema } from '@futureflow/contracts';
import type { LedgerEvent } from '@futureflow/core';
import { z } from 'zod';
import type { SqlDb } from './sql';
import type { LocalStore, SavedToday, SyncReport } from './types';

const SavedTodaySchema = z.object({ today: TodaySchema, savedAt: z.number().int() });
const SyncReportSchema = z.object({
  status: z.enum(['ok', 'offline', 'server_error', 'unauthorized', 'invalid_response']),
  pushed: z.number().int(),
  buried: z.number().int(),
  pulled: z.number().int(),
  at: z.number().int(),
});

const KEY = { cursor: 'ledger_cursor', today: 'today', lastSync: 'last_sync' } as const;
const TABLES = ['outbox', 'dead_letters', 'ledger', 'kv'] as const;

const toEvents = (rows: readonly { event: string }[]): LedgerEvent[] =>
  rows.map((row) => JSON.parse(row.event) as LedgerEvent);

/** Bulk writes pass one JSON parameter through json_each, as the API does with D1. */
export function sqliteStore(db: SqlDb): LocalStore {
  const getKv = async (key: string): Promise<string | null> =>
    (await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key))?.value ??
    null;
  const setKv = (key: string, value: string) =>
    db.runAsync(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  // Saved values may come from an older app version: anything that no longer parses reads as absent.
  const readJson = async <T>(key: string, schema: z.ZodType<T>): Promise<T | null> => {
    const raw = await getKv(key);
    if (raw === null) return null;
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
  const inList = (ids: readonly string[]) => JSON.stringify(ids);

  return {
    async enqueue(events) {
      const valid = events.map((event) => LedgerEventSchema.parse(event));
      await db.runAsync(
        `INSERT OR IGNORE INTO outbox (id, at, event)
         SELECT value ->> '$.id', value ->> '$.at', value FROM json_each(?)`,
        JSON.stringify(valid),
      );
    },
    pending: async (limit = -1) =>
      toEvents(
        await db.getAllAsync<{ event: string }>(
          'SELECT event FROM outbox ORDER BY at, id LIMIT ?',
          limit,
        ),
      ),
    async settle(ids) {
      await db.runAsync(
        'DELETE FROM outbox WHERE id IN (SELECT value FROM json_each(?))',
        inList(ids),
      );
    },
    async bury(ids, reason, at) {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT OR REPLACE INTO dead_letters (id, event, reason, buried_at)
           SELECT id, event, ?, ? FROM outbox WHERE id IN (SELECT value FROM json_each(?))`,
          reason,
          at,
          inList(ids),
        );
        await db.runAsync(
          'DELETE FROM outbox WHERE id IN (SELECT value FROM json_each(?))',
          inList(ids),
        );
      });
    },
    async counts() {
      const row = await db.getFirstAsync<{ pending: number; dead: number }>(
        'SELECT (SELECT COUNT(*) FROM outbox) AS pending, (SELECT COUNT(*) FROM dead_letters) AS dead',
      );
      return { pending: row?.pending ?? 0, dead: row?.dead ?? 0 };
    },
    async applyPage(events, next) {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT OR IGNORE INTO ledger (id, at, event)
           SELECT value ->> '$.id', value ->> '$.at', value FROM json_each(?)`,
          JSON.stringify(events),
        );
        await setKv(KEY.cursor, String(next));
      });
    },
    cursor: async () => Number((await getKv(KEY.cursor)) ?? 0),
    confirmed: async () =>
      toEvents(await db.getAllAsync<{ event: string }>('SELECT event FROM ledger ORDER BY at, id')),
    async saveToday(saved: SavedToday) {
      await setKv(KEY.today, JSON.stringify(saved));
    },
    savedToday: () => readJson(KEY.today, SavedTodaySchema),
    async saveSync(report: SyncReport) {
      await setKv(KEY.lastSync, JSON.stringify(report));
    },
    lastSync: () => readJson(KEY.lastSync, SyncReportSchema),
    async reset() {
      await db.withTransactionAsync(async () => {
        for (const table of TABLES) await db.execAsync(`DELETE FROM ${table}`);
      });
    },
  };
}
