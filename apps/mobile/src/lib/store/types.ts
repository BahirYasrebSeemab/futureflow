import type { LedgerEvent } from '@futureflow/core';
import type { Today } from '../api/client';

export type SavedToday = Readonly<{ today: Today; savedAt: number }>;

export type SyncStatus = 'ok' | 'offline' | 'server_error' | 'unauthorized' | 'invalid_response';

export type SyncReport = Readonly<{
  status: SyncStatus;
  pushed: number;
  buried: number;
  pulled: number;
  at: number;
}>;

/** The phone's own data: unsent events, refused events, the server-confirmed ledger and small values. */
export interface LocalStore {
  /** Validates every event first; writes all or nothing. A repeated id is ignored. */
  enqueue(events: readonly LedgerEvent[]): Promise<void>;
  /** Oldest first; all of them when no limit is given. */
  pending(limit?: number): Promise<LedgerEvent[]>;
  /** The server has these: drop them from the outbox. */
  settle(ids: readonly string[]): Promise<void>;
  /** The server will never take these: move them aside, out of the balance. */
  bury(ids: readonly string[], reason: string, at: number): Promise<void>;
  counts(): Promise<{ pending: number; dead: number }>;
  /** Stores a ledger page and its cursor together. */
  applyPage(events: readonly LedgerEvent[], next: number): Promise<void>;
  cursor(): Promise<number>;
  confirmed(): Promise<LedgerEvent[]>;
  saveToday(saved: SavedToday): Promise<void>;
  savedToday(): Promise<SavedToday | null>;
  saveSync(report: SyncReport): Promise<void>;
  lastSync(): Promise<SyncReport | null>;
  reset(): Promise<void>;
}
