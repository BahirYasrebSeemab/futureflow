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

test('events made in the same millisecond keep the order they were enqueued in', async () => {
  const { store } = await open();
  const at = NOW - 1000;
  const reward = ledgerEvent(9, { at, kind: 'task_reward', seconds: 600, refId: 't1' });
  const repay = ledgerEvent(1, { at, kind: 'borrow_repay', seconds: -300, refId: reward.id });
  await store.enqueue([reward, repay]);
  expect(await store.pending()).toEqual([reward, repay]);
});

test('enqueue validates every event and writes nothing when one is invalid', async () => {
  const { store } = await open();
  await expect(store.enqueue([ledgerEvent(1), ledgerEvent(2, { seconds: 60 })])).rejects.toThrow();
  expect(await store.counts()).toEqual({ pending: 0, dead: 0 });
});

test('settle removes sent events; bury moves refused ones to dead letters', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(1), ledgerEvent(2), ledgerEvent(3)]);
  await store.settle([ledgerEvent(1).id], []);
  await store.bury([ledgerEvent(2).id], 'future_timestamp', NOW);
  expect(await store.pending()).toEqual([ledgerEvent(3)]);
  expect(await store.counts()).toEqual({ pending: 1, dead: 1 });
});

test('settle moves accepted events into the confirmed ledger and drops ignored ones', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(1), ledgerEvent(2)]);
  await store.settle([ledgerEvent(1).id], [ledgerEvent(2).id]);
  expect([await store.pending(), await store.confirmed()]).toEqual([[], [ledgerEvent(1)]]);
});

test('the ledger is complete only after a final page', async () => {
  const { store } = await open();
  expect(await store.ledgerComplete()).toBe(false);
  await store.applyPage([ledgerEvent(1)], 1, false);
  expect(await store.ledgerComplete()).toBe(false);
  await store.applyPage([], 1, true);
  expect(await store.ledgerComplete()).toBe(true);
  await store.applyPage([ledgerEvent(2)], 2, false);
  expect(await store.ledgerComplete()).toBe(false);
});

test('applyPage stores confirmed events once and advances the cursor', async () => {
  const { store } = await open();
  expect(await store.cursor()).toBe(0);
  await store.applyPage([ledgerEvent(1), ledgerEvent(2)], 2, false);
  await store.applyPage([ledgerEvent(2), ledgerEvent(3)], 3, true);
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

test('clearServerCopy keeps unsent and refused events and drops the server copy', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(1), ledgerEvent(2)]);
  await store.bury([ledgerEvent(2).id], 'future_timestamp', NOW);
  await store.applyPage([ledgerEvent(3)], 1, true);
  await store.saveToday({ today: sampleToday(), savedAt: NOW });
  await store.clearServerCopy();
  expect([
    await store.counts(),
    await store.pending(),
    await store.confirmed(),
    await store.cursor(),
    await store.savedToday(),
    await store.ledgerComplete(),
  ]).toEqual([{ pending: 1, dead: 1 }, [ledgerEvent(1)], [], 0, null, false]);
});

test('concurrent writes never nest transactions', async () => {
  const { store } = await open();
  await store.enqueue([ledgerEvent(1), ledgerEvent(2)]);
  await Promise.all([
    store.applyPage([ledgerEvent(3)], 1, true),
    store.clearServerCopy(),
    store.bury([ledgerEvent(2).id], 'future_timestamp', NOW),
    store.settle([ledgerEvent(1).id], []),
  ]);
  expect(await store.counts()).toEqual({ pending: 0, dead: 1 });
});

test('away windows and check times survive clearing the server copy', async () => {
  const { store } = await open();
  const w = { id: '01920000-0000-7000-8000-0000000000e1', from: '2026-10-14', to: '2026-10-15' };
  expect(await store.awayWindows()).toEqual([]);
  await store.saveAwayWindow(w);
  await store.saveAwayWindow(w);
  await store.saveAwayCheck('2026-10-14', NOW);
  await store.applyPage([ledgerEvent(1)], 1, true);
  await store.clearServerCopy();
  expect([
    await store.awayWindows(),
    await store.lastAwayCheck('2026-10-14'),
    await store.lastAwayCheck('2026-10-15'),
    await store.cursor(),
  ]).toEqual([[w], NOW, null, 0]);
});

const attempt = (i: number, day = '2026-10-14') => ({
  id: `01920000-0000-7000-8000-${String(i).padStart(12, '0')}`,
  day,
  at: NOW + i,
  topicId: 'fractions',
  difficulty: 3,
  correct: i % 2 === 0,
  answerType: 'typed' as const,
});

test('math progress and item ratings round-trip and upsert', async () => {
  const { store } = await open();
  const p = { topicId: 'fractions', rating: 1050, streak: 2, mastered: false, reviewStage: 0 };
  await store.saveMathProgress([p]);
  await store.saveMathProgress([{ ...p, streak: 3 }]);
  expect([...(await store.mathProgress()).values()]).toEqual([{ ...p, streak: 3 }]);
  expect(await store.itemRating('fractions:3')).toBeNull();
  await store.saveItemRating('fractions:3', 1180.5);
  expect(await store.itemRating('fractions:3')).toBe(1180.5);
});

test('attempts are kept per day, sent in batches, and survive clearing the server copy', async () => {
  const { store } = await open();
  await store.saveAttempt(attempt(1));
  await store.saveAttempt(attempt(1));
  await store.saveAttempt(attempt(2, '2026-10-13'));
  expect(await store.attemptsOn('2026-10-14')).toEqual([attempt(1)]);
  expect(await store.unsentAttempts()).toEqual([attempt(1), attempt(2, '2026-10-13')]);
  expect(await store.unsentAttempts(1)).toEqual([attempt(1)]);
  await store.markAttemptsSent([attempt(1).id]);
  expect(await store.unsentAttempts()).toEqual([attempt(2, '2026-10-13')]);
  await store.markSeen('fractions:7:3', NOW);
  await store.savePlacement({ state: { low: 3, high: 3, correctAtProbe: 0 }, done: true });
  await store.clearServerCopy();
  expect([
    await store.attemptsOn('2026-10-14'),
    await store.hasSeen('fractions:7:3'),
    await store.hasSeen('fractions:8:3'),
    await store.placement(),
  ]).toEqual([
    [attempt(1)],
    true,
    false,
    { state: { low: 3, high: 3, correctAtProbe: 0 }, done: true },
  ]);
});

test('broken math progress rows are skipped', async () => {
  const { db, store } = await open();
  await db.runAsync("INSERT INTO math_progress (topic_id, progress) VALUES ('x', '{\"bad\":1}')");
  expect((await store.mathProgress()).size).toBe(0);
});

const bankProblem = (n: number, topicId = 'percents', difficulty = 2) => ({
  id: `bank-${n}`,
  topicId,
  difficulty,
  seed: 100 + n,
  story: `Story ${n}?`,
  prompt: `Prompt ${n}?`,
  answer: { type: 'number', value: { num: 1, den: 1 } },
  hints: [],
  steps: [],
  week: '2026-W42',
  createdAt: 1,
});

test('worked examples are remembered per topic and survive clearing the server copy', async () => {
  const { store } = await open();
  expect(await store.exampleSeen('fractions')).toBe(false);
  await store.markExampleSeen('fractions', NOW);
  await store.clearServerCopy();
  expect([await store.exampleSeen('fractions'), await store.exampleSeen('decimals')]).toEqual([
    true,
    false,
  ]);
});

test('mock results round-trip in order', async () => {
  const { store } = await open();
  const r = (day: string, score: number) => ({
    day,
    level: 'L2' as const,
    score,
    topicIds: ['a'],
    problemCount: 40,
  });
  await store.saveMockResult('m1', r('2026-10-13', 0.8));
  await store.saveMockResult('m1', r('2026-10-13', 0.8));
  await store.saveMockResult('m2', r('2026-10-14', 0.6));
  expect(await store.mockResults()).toEqual([r('2026-10-13', 0.8), r('2026-10-14', 0.6)]);
});

test('bank pages advance the cursor; an unused problem is returned until marked used', async () => {
  const { store } = await open();
  expect(await store.bankCursor()).toBe(0);
  await store.saveBankProblems([bankProblem(1), bankProblem(2, 'decimals')], 7);
  await store.saveBankProblems([bankProblem(1)], 7);
  expect(await store.bankCursor()).toBe(7);
  expect((await store.unusedBankProblem('percents', 2))?.id).toBe('bank-1');
  expect(await store.unusedBankProblem('percents', 3)).toBeNull();
  await store.markBankUsed('bank-1');
  expect(await store.unusedBankProblem('percents', 2)).toBeNull();
  expect((await store.unusedBankProblem('decimals', 2))?.story).toBe('Story 2?');
});

test('a broken bank row is set aside and does not block the next one', async () => {
  const { db, store } = await open();
  await store.saveBankProblems([bankProblem(1), bankProblem(2)], 2);
  await db.runAsync("UPDATE math_bank SET problem = 'not json' WHERE id = 'bank-1'");
  expect((await store.unusedBankProblem('percents', 2))?.id).toBe('bank-2');
});

test('pairing again re-downloads the bank from the start', async () => {
  const { store } = await open();
  await store.saveBankProblems([bankProblem(1)], 9);
  await store.clearServerCopy();
  expect(await store.bankCursor()).toBe(0);
});
