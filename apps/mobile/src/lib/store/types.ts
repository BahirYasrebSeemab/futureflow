import type { BankProblem, CoachMessage, MathAttempt } from '@futureflow/contracts';
import type { LedgerEvent } from '@futureflow/core';
import type { MockResult, PlacementState, TopicProgress } from '../math/engine';
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

/** Where the placement test stands; `done` once it finished or was skipped. */
export type PlacementRecord = Readonly<{ state: PlacementState; done: boolean }>;

/** An away window this phone declared: the away check needs its id. */
export type AwayWindowRef = Readonly<{ id: string; from: string; to: string }>;

/** The phone's own data: unsent events, refused events, the server-confirmed ledger and small values. */
export interface LocalStore {
  /** Validates every event first; writes all or nothing. A repeated id is ignored. */
  enqueue(events: readonly LedgerEvent[]): Promise<void>;
  /** Oldest first, then in enqueue order (a reward before its repayment); all when no limit. */
  pending(limit?: number): Promise<LedgerEvent[]>;
  /** Queues the guard's spend events and marks its sessions up to `seq` recorded, together. */
  enqueueSpend(events: readonly LedgerEvent[], seq: number): Promise<void>;
  /** The guard's last recorded session; it stays across re-pairing (it is the phone's own). */
  spendSeq(): Promise<number>;
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
  saveAwayWindow(window: AwayWindowRef): Promise<void>;
  awayWindows(): Promise<AwayWindowRef[]>;
  saveAwayCheck(day: string, at: number): Promise<void>;
  lastAwayCheck(day: string): Promise<number | null>;
  mathProgress(): Promise<Map<string, TopicProgress>>;
  saveMathProgress(items: readonly TopicProgress[]): Promise<void>;
  itemRating(key: string): Promise<number | null>;
  saveItemRating(key: string, rating: number): Promise<void>;
  /** A repeated id is ignored. */
  saveAttempt(attempt: MathAttempt): Promise<void>;
  attemptsOn(day: string): Promise<MathAttempt[]>;
  unsentAttempts(limit?: number): Promise<MathAttempt[]>;
  markAttemptsSent(ids: readonly string[]): Promise<void>;
  hasSeen(problemKey: string): Promise<boolean>;
  markSeen(problemKey: string, at: number): Promise<void>;
  /** A math task this phone already passed (or found decided): never sent again. */
  mathTaskDone(taskId: string): Promise<boolean>;
  markMathTaskDone(taskId: string): Promise<void>;
  exampleSeen(topicId: string): Promise<boolean>;
  markExampleSeen(topicId: string, at: number): Promise<void>;
  /** A repeated id is ignored (one result per finished mock). */
  saveMockResult(id: string, result: MockResult): Promise<void>;
  mockResults(): Promise<MockResult[]>;
  /** Stores a bank page and its cursor together. */
  saveBankProblems(problems: readonly BankProblem[], next: number): Promise<void>;
  bankCursor(): Promise<number>;
  unusedBankProblem(topicId: string, difficulty: number): Promise<BankProblem | null>;
  markBankUsed(id: string): Promise<void>;
  /** Upserts by id; `next` moves the server cursor when given. */
  saveCoachMessages(messages: readonly CoachMessage[], next?: number): Promise<void>;
  coachThread(): Promise<CoachMessage[]>;
  coachCursor(): Promise<number>;
  placement(): Promise<PlacementRecord | null>;
  savePlacement(record: PlacementRecord): Promise<void>;
  /** Drops everything that came from the server; keeps unsent and refused events (ADR 0011). */
  clearServerCopy(): Promise<void>;
}
