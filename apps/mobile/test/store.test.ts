import { migrate, SCHEMA_VERSION } from '@/lib/store/migrations';
import { sqliteStore } from '@/lib/store/sqlite-store';
import type { SqlDb } from '@/lib/store/sql';
import { ledgerEvent, NOW, sampleToday } from './support/fakes';
import { nodeSqlDb } from './support/node-sql';

async function open(): Promise<{ db: SqlDb; store: ReturnType<typeof sqliteStore> }> {
  const db = nodeSqlDb();
  await migrate(db);
  return { db, store: sqliteStore(db) };
}

test('migrate creates the schema once and refuses a newer one', async () => {
  const db = nodeSqlDb();
  await migrate(db);
  await migrate(db);
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: SCHEMA_VERSION });
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
  await expect(migrate(db)).rejects.toThrow('newer');
});

test('the outbox returns pending events oldest first and ignores a repeated id', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(2), ledgerEvent(1)]);
  await store.enqueue([ledgerEvent(1)]);
  expect(await store.pending()).toEqual([ledgerEvent(1), ledgerEvent(2)]);
  expect(await store.pending(1)).toEqual([ledgerEvent(1)]);
});

test('enqueue validates every event and writes nothing when one is invalid', async () => {
  const { store } = await open();
  await expect(store.enqueue([ledgerEvent(1), ledgerEvent(2, { seconds: 60 })])).rejects.toThrow();
  expect(await store.counts()).toEqual({ pending: 0, dead: 0 });
});

test('settle removes sent events; bury moves refused ones to dead letters', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(1), ledgerEvent(2), ledgerEvent(3)]);
  await store.settle([ledgerEvent(1).id]);
  await store.bury([ledgerEvent(2).id], 'future_timestamp', NOW);
  expect(await store.pending()).toEqual([ledgerEvent(3)]);
  expect(await store.counts()).toEqual({ pending: 1, dead: 1 });
});

test('applyPage stores confirmed events once and advances the cursor', async () => {
  const { store } = await open();
  expect(await store.cursor()).toBe(0);
  await store.applyPage([ledgerEvent(1), ledgerEvent(2)], 2);
  await store.applyPage([ledgerEvent(2), ledgerEvent(3)], 3);
  expect(await store.confirmed()).toEqual([ledgerEvent(1), ledgerEvent(2), ledgerEvent(3)]);
  expect(await store.cursor()).toBe(3);
});

test('the today snapshot and last sync round-trip; a corrupt snapshot reads as none', async () => {
  const { db, store } = await open();
  expect([await store.savedToday(), await store.lastSync()]).toEqual([null, null]);
  await store.saveToday({ today: sampleToday(), savedAt: NOW });
  expect(await store.savedToday()).toEqual({ today: sampleToday(), savedAt: NOW });
  const report = { status: 'offline' as const, pushed: 0, buried: 0, pulled: 0, at: NOW };
  await store.saveSync(report);
  expect(await store.lastSync()).toEqual(report);
  await db.runAsync(`UPDATE kv SET value = '{"today":1}' WHERE key = 'today'`);
  await db.runAsync(`UPDATE kv SET value = 'not json' WHERE key = 'last_sync'`);
  expect([await store.savedToday(), await store.lastSync()]).toEqual([null, null]);
});

test('reset wipes every table', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(1)]);
  await store.applyPage([ledgerEvent(2)], 1);
  await store.saveToday({ today: sampleToday(), savedAt: NOW });
  await store.reset();
  expect([
    await store.counts(),
    await store.confirmed(),
    await store.cursor(),
    await store.savedToday(),
  ]).toEqual([{ pending: 0, dead: 0 }, [], 0, null]);
});
