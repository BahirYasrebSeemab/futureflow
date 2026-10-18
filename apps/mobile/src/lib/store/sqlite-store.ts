import {
  type BankProblem,
  BankProblemSchema,
  type CoachMessage,
  CoachMessageSchema,
  DayKeySchema,
  LedgerEventSchema,
  type MathAttempt,
  MathAttemptSchema,
  TodaySchema,
} from '@futureflow/contracts';
import type { MockResult, TopicProgress } from '../math/engine';
import type { LedgerEvent } from '@futureflow/core';
import { z } from 'zod';
import type { SqlDb } from './sql';
import type {
  AwayWindowRef,
  GuardStep,
  LocalStore,
  PlacementRecord,
  SavedToday,
  SyncReport,
} from './types';

const UnlockWaitSchema = z.object({
  reason: z.string(),
  startedAt: z.number(),
  startElapsed: z.number(),
  bootId: z.string(),
});

const BlocklistSchema = z.object({ apps: z.array(z.string()), games: z.boolean() });
const BlocklistStateSchema = z.object({
  current: BlocklistSchema,
  pending: BlocklistSchema.extend({ from: z.string() }).nullable(),
});

const SavedTodaySchema = z.object({ today: TodaySchema, savedAt: z.number().int() });
const SyncReportSchema = z.object({
  status: z.enum(['ok', 'offline', 'server_error', 'unauthorized', 'invalid_response']),
  pushed: z.number().int(),
  buried: z.number().int(),
  pulled: z.number().int(),
  at: z.number().int(),
});

const AwayWindowsSchema = z.array(z.object({ id: z.uuid(), from: DayKeySchema, to: DayKeySchema }));
const TopicProgressSchema = z.object({
  topicId: z.string(),
  rating: z.number(),
  streak: z.number().int(),
  mastered: z.boolean(),
  reviewStage: z.number().int(),
  nextReviewDay: DayKeySchema.optional(),
});
const PlacementSchema = z.object({
  state: z.object({
    low: z.number().int(),
    high: z.number().int(),
    correctAtProbe: z.number().int(),
  }),
  done: z.boolean(),
});

const mathTaskKey = (taskId: string) => `math_task_passed:${taskId}`;
const awayCheckKey = (day: string) => `away_check:${day}`;

const KEY = {
  cursor: 'ledger_cursor',
  complete: 'ledger_complete',
  today: 'today',
  lastSync: 'last_sync',
  awayWindows: 'away_windows',
  placement: 'placement',
  bankCursor: 'bank_cursor',
  coachCursor: 'coach_cursor',
  spendSeq: 'guard_spend_seq',
  guardSteps: 'guard_steps',
  unlockWait: 'unlock_wait',
  blocklist: 'blocklist',
} as const;
/** What came from the server; the rest of kv (away windows, check times) is the phone's own. */
const SERVER_KEYS = [
  KEY.cursor,
  KEY.complete,
  KEY.today,
  KEY.lastSync,
  KEY.bankCursor,
  KEY.coachCursor,
] as const;

/** expo-sqlite transactions are not exclusive, so writes take turns instead of nesting. */
function createQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

const GUARD_STEPS: readonly GuardStep[] = ['autostart', 'battery', 'recents'];
const readSteps = (raw: string | null): GuardStep[] => {
  let parsed: unknown = [];
  try {
    parsed = raw === null ? [] : JSON.parse(raw);
  } catch {
    // An unreadable value means nothing ticked: the owner ticks again.
  }
  return Array.isArray(parsed) ? GUARD_STEPS.filter((step) => parsed.includes(step)) : [];
};

const toAttempts = (rows: readonly { attempt: string }[]): MathAttempt[] =>
  rows.map((row) => JSON.parse(row.attempt) as MathAttempt);

const toEvents = (rows: readonly { event: string }[]): LedgerEvent[] =>
  rows.map((row) => JSON.parse(row.event) as LedgerEvent);

/** Bulk writes pass one JSON parameter through json_each, as the API does with D1. */
export function sqliteStore(db: SqlDb): LocalStore {
  const write = createQueue();
  const getKv = async (key: string): Promise<string | null> =>
    (await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key))?.value ??
    null;
  const setKv = (key: string, value: string) =>
    db.runAsync(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  const insertOutbox = (events: readonly LedgerEvent[]) =>
    db.runAsync(
      `INSERT OR IGNORE INTO outbox (id, at, event)
       SELECT value ->> '$.id', value ->> '$.at', value FROM json_each(?) ORDER BY key`,
      JSON.stringify(events),
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
    enqueue: (events) =>
      write(async () => {
        const valid = events.map((event) => LedgerEventSchema.parse(event));
        await insertOutbox(valid);
      }),
    enqueueSpend: (events, seq) =>
      write(async () => {
        const valid = events.map((event) => LedgerEventSchema.parse(event));
        await db.withTransactionAsync(async () => {
          await insertOutbox(valid);
          await setKv(KEY.spendSeq, String(seq));
        });
      }),
    spendSeq: async () => Number((await getKv(KEY.spendSeq)) ?? 0),
    guardSteps: async () => readSteps(await getKv(KEY.guardSteps)),
    unlockWait: () => readJson(KEY.unlockWait, UnlockWaitSchema),
    enqueueUnlock: (event) =>
      write(async () => {
        const valid = LedgerEventSchema.parse(event);
        let taken = false;
        await db.withTransactionAsync(async () => {
          if ((await getKv(KEY.unlockWait)) === null) return;
          await insertOutbox([valid]);
          await db.runAsync('DELETE FROM kv WHERE key = ?', KEY.unlockWait);
          taken = true;
        });
        return taken;
      }),
    saveUnlockWait: (wait) =>
      write(async () => {
        if (wait === null) await db.runAsync('DELETE FROM kv WHERE key = ?', KEY.unlockWait);
        else await setKv(KEY.unlockWait, JSON.stringify(wait));
      }),
    blocklist: () => readJson(KEY.blocklist, BlocklistStateSchema),
    saveBlocklist: (state) =>
      write(() => setKv(KEY.blocklist, JSON.stringify(state)).then(() => undefined)),
    markGuardStep: (step, done) =>
      write(async () => {
        const steps = new Set(readSteps(await getKv(KEY.guardSteps)));
        if (done) steps.add(step);
        else steps.delete(step);
        await setKv(KEY.guardSteps, JSON.stringify([...steps].sort()));
      }),
    pending: async (limit = -1) =>
      toEvents(
        await db.getAllAsync<{ event: string }>(
          // rowid, not id: UUIDv7 ids made in the same millisecond are in random order.
          'SELECT event FROM outbox ORDER BY at, rowid LIMIT ?',
          limit,
        ),
      ),
    settle: (added, ignored) =>
      write(async () => {
        await db.withTransactionAsync(async () => {
          await db.runAsync(
            `INSERT OR IGNORE INTO ledger (id, at, event)
           SELECT id, at, event FROM outbox WHERE id IN (SELECT value FROM json_each(?))`,
            inList(added),
          );
          await db.runAsync(
            'DELETE FROM outbox WHERE id IN (SELECT value FROM json_each(?))',
            inList([...added, ...ignored]),
          );
        });
      }),
    bury: (ids, reason, at) =>
      write(async () => {
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
      }),
    async counts() {
      const row = await db.getFirstAsync<{ pending: number; dead: number }>(
        'SELECT (SELECT COUNT(*) FROM outbox) AS pending, (SELECT COUNT(*) FROM dead_letters) AS dead',
      );
      return { pending: row?.pending ?? 0, dead: row?.dead ?? 0 };
    },
    applyPage: (events, next, complete) =>
      write(async () => {
        await db.withTransactionAsync(async () => {
          await db.runAsync(
            `INSERT OR IGNORE INTO ledger (id, at, event)
           SELECT value ->> '$.id', value ->> '$.at', value FROM json_each(?)`,
            JSON.stringify(events),
          );
          await setKv(KEY.cursor, String(next));
          await setKv(KEY.complete, complete ? '1' : '0');
        });
      }),
    ledgerComplete: async () => (await getKv(KEY.complete)) === '1',
    cursor: async () => Number((await getKv(KEY.cursor)) ?? 0),
    confirmed: async () =>
      toEvents(await db.getAllAsync<{ event: string }>('SELECT event FROM ledger ORDER BY at, id')),
    saveToday: (saved: SavedToday) =>
      write(async () => {
        await setKv(KEY.today, JSON.stringify(saved));
      }),
    savedToday: () => readJson(KEY.today, SavedTodaySchema),
    saveSync: (report: SyncReport) =>
      write(async () => {
        await setKv(KEY.lastSync, JSON.stringify(report));
      }),
    lastSync: () => readJson(KEY.lastSync, SyncReportSchema),
    saveAwayWindow: (window: AwayWindowRef) =>
      write(async () => {
        const known = (await readJson(KEY.awayWindows, AwayWindowsSchema)) ?? [];
        if (known.some((w) => w.id === window.id)) return;
        const next = [...known, { id: window.id, from: window.from, to: window.to }];
        await setKv(KEY.awayWindows, JSON.stringify(next));
      }),
    awayWindows: async () => (await readJson(KEY.awayWindows, AwayWindowsSchema)) ?? [],
    saveAwayCheck: (day: string, at: number) =>
      write(async () => {
        await setKv(awayCheckKey(day), String(at));
      }),
    async lastAwayCheck(day: string) {
      const raw = await getKv(awayCheckKey(day));
      return raw === null ? null : Number(raw);
    },
    async mathProgress() {
      const rows = await db.getAllAsync<{ progress: string }>(
        'SELECT progress FROM math_progress ORDER BY topic_id',
      );
      const items = rows.flatMap((row) => {
        try {
          const parsed = TopicProgressSchema.safeParse(JSON.parse(row.progress));
          return parsed.success ? [parsed.data as TopicProgress] : [];
        } catch {
          return [];
        }
      });
      return new Map(items.map((p) => [p.topicId, p]));
    },
    saveMathProgress: (items: readonly TopicProgress[]) =>
      write(async () => {
        // `WHERE true` keeps SQLite from reading ON CONFLICT as a join condition.
        await db.runAsync(
          `INSERT INTO math_progress (topic_id, progress)
           SELECT value ->> '$.topicId', value FROM json_each(?) WHERE true
           ON CONFLICT(topic_id) DO UPDATE SET progress = excluded.progress`,
          JSON.stringify(items),
        );
      }),
    async itemRating(key: string) {
      const row = await db.getFirstAsync<{ rating: number }>(
        'SELECT rating FROM math_items WHERE item_key = ?',
        key,
      );
      return row?.rating ?? null;
    },
    saveItemRating: (key: string, rating: number) =>
      write(async () => {
        await db.runAsync(
          `INSERT INTO math_items (item_key, rating) VALUES (?, ?)
           ON CONFLICT(item_key) DO UPDATE SET rating = excluded.rating`,
          key,
          rating,
        );
      }),
    saveAttempt: (attempt: MathAttempt) =>
      write(async () => {
        const valid = MathAttemptSchema.parse(attempt);
        await db.runAsync(
          'INSERT OR IGNORE INTO math_attempts (id, day, at, attempt) VALUES (?, ?, ?, ?)',
          valid.id,
          valid.day,
          valid.at,
          JSON.stringify(valid),
        );
      }),
    attemptsOn: async (day: string) =>
      toAttempts(
        await db.getAllAsync<{ attempt: string }>(
          'SELECT attempt FROM math_attempts WHERE day = ? ORDER BY at, rowid',
          day,
        ),
      ),
    unsentAttempts: async (limit = -1) =>
      toAttempts(
        await db.getAllAsync<{ attempt: string }>(
          'SELECT attempt FROM math_attempts WHERE sent = 0 ORDER BY at, rowid LIMIT ?',
          limit,
        ),
      ),
    markAttemptsSent: (ids: readonly string[]) =>
      write(async () => {
        await db.runAsync(
          'UPDATE math_attempts SET sent = 1 WHERE id IN (SELECT value FROM json_each(?))',
          inList(ids),
        );
      }),
    hasSeen: async (problemKey: string) =>
      (await db.getFirstAsync(
        'SELECT 1 AS seen FROM math_seen WHERE problem_key = ?',
        problemKey,
      )) !== null,
    markSeen: (problemKey: string, at: number) =>
      write(async () => {
        await db.runAsync(
          'INSERT OR IGNORE INTO math_seen (problem_key, at) VALUES (?, ?)',
          problemKey,
          at,
        );
      }),
    exampleSeen: async (topicId: string) =>
      (await db.getFirstAsync(
        'SELECT 1 AS seen FROM math_examples WHERE topic_id = ?',
        topicId,
      )) !== null,
    markExampleSeen: (topicId: string, at: number) =>
      write(async () => {
        await db.runAsync(
          'INSERT OR IGNORE INTO math_examples (topic_id, at) VALUES (?, ?)',
          topicId,
          at,
        );
      }),
    saveMockResult: (id: string, result: MockResult) =>
      write(async () => {
        await db.runAsync(
          'INSERT OR IGNORE INTO mock_results (id, day, level, score, result) VALUES (?, ?, ?, ?, ?)',
          id,
          result.day,
          result.level,
          result.score,
          JSON.stringify(result),
        );
      }),
    mockResults: async () =>
      (
        await db.getAllAsync<{ result: string }>(
          'SELECT result FROM mock_results ORDER BY day, rowid',
        )
      ).map((row) => JSON.parse(row.result) as MockResult),
    saveBankProblems: (problems: readonly BankProblem[], next: number) =>
      write(async () => {
        await db.withTransactionAsync(async () => {
          for (const p of problems) {
            const valid = BankProblemSchema.parse(p);
            await db.runAsync(
              `INSERT OR IGNORE INTO math_bank (id, seq, topic_id, difficulty, problem)
               VALUES (?, ?, ?, ?, ?)`,
              valid.id,
              next,
              valid.topicId,
              valid.difficulty,
              JSON.stringify(valid),
            );
          }
          await setKv(KEY.bankCursor, String(next));
        });
      }),
    bankCursor: async () => Number((await getKv(KEY.bankCursor)) ?? 0),
    async unusedBankProblem(topicId: string, difficulty: number) {
      for (;;) {
        const row = await db.getFirstAsync<{ id: string; problem: string }>(
          `SELECT id, problem FROM math_bank WHERE topic_id = ? AND difficulty = ? AND used = 0
           ORDER BY seq, rowid LIMIT 1`,
          topicId,
          difficulty,
        );
        if (row === null) return null;
        try {
          const parsed = BankProblemSchema.safeParse(JSON.parse(row.problem));
          if (parsed.success) return parsed.data;
        } catch {
          // fall through: set the broken row aside
        }
        await write(async () => {
          await db.runAsync('UPDATE math_bank SET used = 1 WHERE id = ?', row.id);
        });
      }
    },
    markBankUsed: (id: string) =>
      write(async () => {
        await db.runAsync('UPDATE math_bank SET used = 1 WHERE id = ?', id);
      }),
    saveCoachMessages: (messages: readonly CoachMessage[], next?: number) =>
      write(async () => {
        await db.withTransactionAsync(async () => {
          for (const m of messages) {
            await db.runAsync(
              `INSERT INTO coach_messages (id, created_at, message) VALUES (?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET message = excluded.message`,
              m.id,
              m.createdAt,
              JSON.stringify(m),
            );
          }
          if (next !== undefined) await setKv(KEY.coachCursor, String(next));
        });
      }),
    async coachThread() {
      const rows = await db.getAllAsync<{ message: string }>(
        'SELECT message FROM coach_messages ORDER BY created_at, rowid',
      );
      return rows.flatMap((row) => {
        try {
          const parsed = CoachMessageSchema.safeParse(JSON.parse(row.message));
          return parsed.success ? [parsed.data] : [];
        } catch {
          return [];
        }
      });
    },
    coachCursor: async () => Number((await getKv(KEY.coachCursor)) ?? 0),
    mathTaskDone: async (taskId: string) => (await getKv(mathTaskKey(taskId))) !== null,
    markMathTaskDone: (taskId: string) =>
      write(async () => {
        await setKv(mathTaskKey(taskId), '1');
      }),
    placement: async () =>
      (await readJson(KEY.placement, PlacementSchema)) as PlacementRecord | null,
    savePlacement: (record: PlacementRecord) =>
      write(async () => {
        await setKv(KEY.placement, JSON.stringify(record));
      }),
    clearServerCopy: () =>
      write(async () => {
        await db.withTransactionAsync(async () => {
          await db.execAsync('DELETE FROM ledger');
          await db.execAsync('DELETE FROM coach_messages');
          await db.runAsync(
            'DELETE FROM kv WHERE key IN (SELECT value FROM json_each(?))',
            JSON.stringify(SERVER_KEYS),
          );
        });
      }),
  };
}
