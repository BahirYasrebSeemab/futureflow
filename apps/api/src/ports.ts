import type { UsageCounter } from '@mflow/ai';
import type { Heartbeat, MathAttempt, ReadingLog, Roadmap } from '@mflow/contracts';
import type { DayRecord, LedgerEvent, Plan } from '@mflow/core';

/** Repository ports. Routes depend on these; `adapters/d1` implements them. */

export type Device = Readonly<{ id: string; name: string; utcOffsetMinutes: number }>;

export interface DeviceRepo {
  /** Creates the device and marks the code used, atomically. False if the code or token was used. */
  pair(codeHash: string, device: Device, tokenHash: string, at: number): Promise<boolean>;
  /** A device that is not revoked, or null. */
  findByTokenHash(tokenHash: string): Promise<Device | null>;
  setUtcOffset(deviceId: string, minutes: number): Promise<void>;
}

export interface LedgerRepo {
  /** Stored events that share an id or a business key (`semanticKey`) with the candidates. */
  findMatching(ids: readonly string[], keys: readonly string[]): Promise<LedgerEvent[]>;
  /** Inserts in order, skipping ids or business keys already stored; returns the ids written. */
  insert(
    events: readonly LedgerEvent[],
    deviceId: string | null,
    receivedAt: number,
  ): Promise<string[]>;
  /** Events after the cursor `since`, in server order; `next` is the cursor to send next time. */
  page(since: number, limit: number): Promise<{ events: LedgerEvent[]; next: number }>;
  forDay(day: string): Promise<LedgerEvent[]>;
  /** Balance = sum of all events; borrowed time not yet repaid (never negative). */
  totals(): Promise<{ balance: number; outstandingBorrow: number }>;
}

export interface PlanRepo {
  get(day: string): Promise<Plan | null>;
  /** Upserts a plan; a stored locked plan is never overwritten (returns false). */
  save(plan: Plan, at: number): Promise<boolean>;
}

export type AwayWindow = Readonly<{
  id: string;
  place: string;
  from: string;
  to: string;
  keptTaskIds: readonly string[];
}>;

/** A day record plus where it came from and what the phone measured (km, rounded to 10). */
export type DayEntry = Readonly<{ record: DayRecord; windowId?: string; distanceKm?: number }>;

export interface DayRepo {
  between(from: string, to: string): Promise<DayRecord[]>;
  entry(day: string): Promise<DayEntry | null>;
  /** Upserts the entries (and inserts the window, if given) in one transaction. */
  save(entries: readonly DayEntry[], at: number, window?: AwayWindow): Promise<void>;
  window(id: string): Promise<AwayWindow | null>;
}

export interface TelemetryRepo {
  addHeartbeat(deviceId: string, beat: Heartbeat, receivedAt: number): Promise<void>;
  /** False when a log with this id is already stored (it is never overwritten). */
  addReading(deviceId: string, log: ReadingLog, at: number): Promise<boolean>;
  /** Inserts attempts whose id is new; returns the ids written, in order. */
  addAttempts(
    deviceId: string,
    attempts: readonly MathAttempt[],
    receivedAt: number,
  ): Promise<string[]>;
}

export interface RoadmapRepo {
  /** The stored roadmap, or empty lists before onboarding. */
  get(): Promise<Roadmap>;
  /** Replaces identities, skills and milestones in one transaction. */
  replace(roadmap: Roadmap, at: number): Promise<void>;
}

export type Repos = Readonly<{
  devices: DeviceRepo;
  ledger: LedgerRepo;
  plans: PlanRepo;
  days: DayRepo;
  telemetry: TelemetryRepo;
  roadmap: RoadmapRepo;
  aiUsage: UsageCounter;
}>;
