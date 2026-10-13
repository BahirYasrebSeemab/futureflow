import { semanticKey, type LedgerEvent } from '@mflow/core';
import type { LedgerRepo } from '../../ports';

type EventRow = {
  seq: number;
  id: string;
  day: string;
  at: number;
  kind: LedgerEvent['kind'];
  seconds: number;
  ref_id: string | null;
  reason: string | null;
};

const COLUMNS = 'seq, id, day, at, kind, seconds, ref_id, reason';

export const toEvent = (r: EventRow): LedgerEvent => ({
  id: r.id,
  day: r.day,
  at: r.at,
  kind: r.kind,
  seconds: r.seconds,
  ...(r.ref_id === null ? {} : { refId: r.ref_id }),
  ...(r.reason === null ? {} : { reason: r.reason }),
});

// D1 allows 100 bound parameters per statement, so bulk values travel as one JSON array.
export const d1Ledger = (db: D1Database): LedgerRepo => ({
  async findMatching(ids, keys) {
    const { results } = await db
      .prepare(
        `SELECT ${COLUMNS} FROM ledger_events
         WHERE id IN (SELECT value FROM json_each(?1))
            OR semantic_key IN (SELECT value FROM json_each(?2))
         ORDER BY seq`,
      )
      .bind(JSON.stringify(ids), JSON.stringify(keys))
      .all<EventRow>();
    return results.map(toEvent);
  },

  async insert(events, deviceId, receivedAt) {
    if (events.length === 0) return [];
    const rows = JSON.stringify(events.map((e) => ({ ...e, semanticKey: semanticKey(e) })));
    const insert = (filter: string) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO ledger_events
             (id, day, at, kind, seconds, ref_id, reason, semantic_key, device_id, received_at)
           SELECT value->>'id', value->>'day', value->>'at', value->>'kind', value->>'seconds',
                  value->>'refId', value->>'reason', value->>'semanticKey', ?2, ?3
           FROM json_each(?1)
           WHERE ${filter}
           RETURNING id`,
        )
        .bind(rows, deviceId, receivedAt);
    // One transaction, two steps: everything else first, then only the repayments whose reward
    // is actually stored. A repayment of a reward dropped as a duplicate (in this batch, an
    // earlier one, or a racing request) is never paid.
    const hasRepay = events.some((e) => e.kind === 'borrow_repay');
    const [first, second] = await db.batch<{ id: string }>([
      insert(`value->>'kind' <> 'borrow_repay'`),
      // Skipped when the batch has no repayments: one D1 statement saved per write.
      ...(hasRepay
        ? [
            insert(
              `value->>'kind' = 'borrow_repay'
         AND EXISTS (SELECT 1 FROM ledger_events r WHERE r.id = value->>'refId')`,
            ),
          ]
        : []),
    ]);
    return [...(first?.results ?? []), ...(second?.results ?? [])].map((r) => r.id);
  },

  async page(since, limit) {
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM ledger_events WHERE seq > ?1 ORDER BY seq LIMIT ?2`)
      .bind(since, limit)
      .all<EventRow>();
    return { events: results.map(toEvent), next: results.at(-1)?.seq ?? since };
  },

  async forDay(day) {
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM ledger_events WHERE day = ?1 ORDER BY seq`)
      .bind(day)
      .all<EventRow>();
    return results.map(toEvent);
  },

  async totals() {
    const row = await db
      .prepare(
        `SELECT COALESCE(SUM(seconds), 0) AS balance,
                COALESCE(SUM(CASE WHEN kind IN ('unlock_borrow', 'borrow_repay')
                                  THEN seconds END), 0) AS borrow
         FROM ledger_events`,
      )
      .first<{ balance: number; borrow: number }>();
    return { balance: row?.balance ?? 0, outstandingBorrow: Math.max(0, row?.borrow ?? 0) };
  },

  async balanceThrough(day) {
    const row = await db
      .prepare('SELECT COALESCE(SUM(seconds), 0) AS balance FROM ledger_events WHERE day <= ?1')
      .bind(day)
      .first<{ balance: number }>();
    return row?.balance ?? 0;
  },
});
