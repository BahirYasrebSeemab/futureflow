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
  /** Oldest first, then in enqueue order (a reward before its repayment); all when no limit. */
  pending(limit?: number): Promise<LedgerEvent[]>;
  /**
   * The server answered: `added` events move into the confirmed ledger (so the balance keeps them
   * even if the pull fails); `ignored` ones are dropped, because the server already holds its own copy.
   */
  settle(added: readonly string[], ignored: readonly string[]): Promise<void>;
  /** The server will never take these: move them aside, out of the balance. */
  bury(ids: readonly string[], reason: string, at: number): Promise<void>;
  counts(): Promise<{ pending: number; dead: number }>;
  /** Stores a ledger page, its cursor and whether the pull reached the end, together. */
  applyPage(events: readonly LedgerEvent[], next: number, complete: boolean): Promise<void>;
  /** True once a pull has reached the end of the server's ledger: only then is the balance known. */
  ledgerComplete(): Promise<boolean>;
  cursor(): Promise<number>;
  confirmed(): Promise<LedgerEvent[]>;
  saveToday(saved: SavedToday): Promise<void>;
  savedToday(): Promise<SavedToday | null>;
  saveSync(report: SyncReport): Promise<void>;
  lastSync(): Promise<SyncReport | null>;
  /** Drops everything that came from the server; keeps unsent and refused events (ADR 0011). */
  clearServerCopy(): Promise<void>;
}
