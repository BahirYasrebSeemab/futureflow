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
    const rows = events.map((e) => ({ ...e, semanticKey: semanticKey(e) }));
    const { results } = await db
      .prepare(
        `INSERT OR IGNORE INTO ledger_events
           (id, day, at, kind, seconds, ref_id, reason, semantic_key, device_id, received_at)
         SELECT value->>'id', value->>'day', value->>'at', value->>'kind', value->>'seconds',
                value->>'refId', value->>'reason', value->>'semanticKey', ?2, ?3
         FROM json_each(?1)
         RETURNING id`,
      )
      .bind(JSON.stringify(rows), deviceId, receivedAt)
      .all<{ id: string }>();
    return results.map((r) => r.id);
  },

  async page(since, limit) {
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM ledger_events WHERE seq > ?1 ORDER BY seq LIMIT ?2`)
      .bind(since, limit)
      .all<EventRow>();
    return { events: results.map(toEvent), next: results.at(-1)?.seq ?? since };
  },
});
