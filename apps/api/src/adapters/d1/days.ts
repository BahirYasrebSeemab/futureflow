import type { DayRecord } from '@futureflow/core';
import { z } from 'zod';
import type { DayEntry, DayRepo } from '../../ports';

type DayRow = {
  day: string;
  kind: DayRecord['kind'];
  away_window_id: string | null;
  place: string | null;
  kept_task_ids_json: string | null;
  verified: 'pending' | 'yes' | 'no' | 'unknown' | null;
  distance_km: number | null;
};

type WindowRow = {
  id: string;
  place: string;
  from_day: string;
  to_day: string;
  kept_task_ids_json: string;
};

const IdsSchema = z.array(z.string());
const parseIds = (json: string): string[] => IdsSchema.parse(JSON.parse(json));

const toRecord = (r: DayRow): DayRecord =>
  r.kind === 'away' && r.place !== null && r.kept_task_ids_json !== null && r.verified !== null
    ? {
        day: r.day,
        kind: 'away',
        away: { place: r.place, keptTaskIds: parseIds(r.kept_task_ids_json), verified: r.verified },
      }
    : { day: r.day, kind: r.kind === 'away' ? 'normal' : r.kind };

const toEntry = (r: DayRow): DayEntry => ({
  record: toRecord(r),
  ...(r.away_window_id === null ? {} : { windowId: r.away_window_id }),
  ...(r.distance_km === null ? {} : { distanceKm: r.distance_km }),
});

const COLUMNS = 'day, kind, away_window_id, place, kept_task_ids_json, verified, distance_km';

export const d1Days = (db: D1Database): DayRepo => ({
  async between(from, to) {
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM day_records WHERE day BETWEEN ?1 AND ?2 ORDER BY day`)
      .bind(from, to)
      .all<DayRow>();
    return results.map(toRecord);
  },

  async entry(day) {
    const row = await db
      .prepare(`SELECT ${COLUMNS} FROM day_records WHERE day = ?1`)
      .bind(day)
      .first<DayRow>();
    return row === null ? null : toEntry(row);
  },

  async save(entries, at, window) {
    const upsert = db.prepare(
      `INSERT INTO day_records (${COLUMNS}, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (day) DO UPDATE SET
         kind = excluded.kind, away_window_id = excluded.away_window_id, place = excluded.place,
         kept_task_ids_json = excluded.kept_task_ids_json, verified = excluded.verified,
         distance_km = excluded.distance_km, updated_at = excluded.updated_at`,
    );
    const statements = entries.map(({ record, windowId, distanceKm }) =>
      upsert.bind(
        record.day,
        record.kind,
        windowId ?? null,
        record.away?.place ?? null,
        record.away === undefined ? null : JSON.stringify(record.away.keptTaskIds),
        record.away?.verified ?? null,
        distanceKm ?? null,
        at,
      ),
    );
    if (window !== undefined) {
      statements.unshift(
        db
          .prepare(
            `INSERT INTO away_windows (id, place, from_day, to_day, kept_task_ids_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
          )
          .bind(
            window.id,
            window.place,
            window.from,
            window.to,
            JSON.stringify(window.keptTaskIds),
            at,
          ),
      );
    }
    await db.batch(statements);
  },

  async window(id) {
    const row = await db
      .prepare(
        'SELECT id, place, from_day, to_day, kept_task_ids_json FROM away_windows WHERE id = ?1',
      )
      .bind(id)
      .first<WindowRow>();
    return row === null
      ? null
      : {
          id: row.id,
          place: row.place,
          from: row.from_day,
          to: row.to_day,
          keptTaskIds: parseIds(row.kept_task_ids_json),
        };
  },
});
