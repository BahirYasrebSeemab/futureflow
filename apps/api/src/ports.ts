import type { UsageCounter } from '@mflow/ai';
import type { CoachMessage, Heartbeat, MathAttempt, ReadingLog, Roadmap } from '@mflow/contracts';
import type { Beat, DayRecord, GuardGap, LedgerEvent, Plan, Verdict } from '@mflow/core';

export type { CoachMessage } from '@mflow/contracts';

/** Repository ports. Routes depend on these; `adapters/d1` implements them. */

export type Device = Readonly<{ id: string; name: string; utcOffsetMinutes: number }>;

export interface DeviceRepo {
  /** Creates the device and marks the code used, atomically. False if the code or token was used. */
  pair(codeHash: string, device: Device, tokenHash: string, at: number): Promise<boolean>;
  /** A device that is not revoked, or null. */
  findByTokenHash(tokenHash: string): Promise<Device | null>;
  setUtcOffset(deviceId: string, minutes: number): Promise<void>;
  /** The UTC offset of the newest unrevoked device, or null before pairing. */
  latestOffset(): Promise<number | null>;
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
  /** Sum of all events on or before `day`. */
  balanceThrough(day: string): Promise<number>;
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
  mathSummary(day: string): Promise<{ attempts: number; correct: number }>;
}

export interface RoadmapRepo {
  /** The stored roadmap, or empty lists before onboarding. */
  get(): Promise<Roadmap>;
  /** Replaces identities, skills and milestones in one transaction. */
  replace(roadmap: Roadmap, at: number): Promise<void>;
}

export type GithubLink = Readonly<{
  login: string;
  tokenSealed: string;
  repos: readonly string[];
  status: 'ok' | 'invalid';
  /** Linked repositories the token could not read on the last run (403/404). */
  unreadableRepos: readonly string[];
}>;

export type CommitFile = Readonly<{
  filename: string;
  additions: number;
  deletions: number;
  patch?: string;
}>;

export type CommitEvidence = Readonly<{
  sha: string;
  repo: string;
  day: string;
  committedAt: string;
  message: string;
  additions: number;
  deletions: number;
  files: readonly CommitFile[];
}>;

export type StoredVerdict = Verdict & Readonly<{ day: string; suggestion?: 'pass' | 'fail' }>;

export interface VerificationRepo {
  link(): Promise<GithubLink | null>;
  /** Upserts the link and resets every repository cursor to `since` (ISO 8601). */
  saveLink(link: GithubLink, at: number, since: string): Promise<void>;
  setLinkStatus(status: GithubLink['status'], at: number): Promise<void>;
  setUnreadable(repos: readonly string[], at: number): Promise<void>;
  deleteLink(): Promise<void>;
  cursor(repo: string): Promise<string | null>;
  setCursor(repo: string, since: string): Promise<void>;
  /** Cursors of these repositories (missing ones are absent), in one query. */
  cursors(repos: readonly string[]): Promise<Map<string, string>>;
  /** Stores new commits and moves cursors in one transaction. */
  saveCollected(
    commits: readonly CommitEvidence[],
    cursors: readonly Readonly<{ repo: string; since: string }>[],
    at: number,
  ): Promise<void>;
  knownShas(shas: readonly string[]): Promise<Set<string>>;
  addCommits(commits: readonly CommitEvidence[], at: number): Promise<void>;
  /** The day's commits, newest first. */
  commitsForDay(day: string): Promise<CommitEvidence[]>;
  readingForDay(day: string): Promise<ReadingLog[]>;
  verdictsForDay(day: string): Promise<StoredVerdict[]>;
  /** Upserts by (day, task); a stored `pass` is final and is never overwritten. */
  saveVerdict(verdict: StoredVerdict, at: number): Promise<void>;
}

export interface CoachRepo {
  /** False when a message with this id is already stored (a retried send). */
  addOwnerMessage(message: CoachMessage): Promise<boolean>;
  replyTo(ownerMessageId: string): Promise<CoachMessage | null>;
  addCoachMessage(message: CoachMessage): Promise<void>;
  page(since: number, limit: number): Promise<{ messages: CoachMessage[]; next: number }>;
  /** Messages on or after `sinceDay`, oldest first, at most `limit` (the newest ones). */
  recent(sinceDay: string, limit: number): Promise<CoachMessage[]>;
  /** True when the nightly review for `day` is already written. */
  hasReview(day: string): Promise<boolean>;
  latestSummary(): Promise<string | null>;
  hasSummary(week: string): Promise<boolean>;
  saveSummary(week: string, text: string, at: number): Promise<void>;
  messagesForWeek(week: string): Promise<CoachMessage[]>;
  /** Deletes messages before `beforeDay` whose week is summarized, and all before `hardBeforeDay`. */
  deleteOld(beforeDay: string, hardBeforeDay: string): Promise<number>;
}

export interface UpkeepRepo {
  nightlyDone(day: string): Promise<boolean>;
  markNightly(day: string, at: number): Promise<void>;
  devices(): Promise<string[]>;
  /** Gaps of any device that overlap [from, to): a gap can span several days. */
  gapsBetween(from: number, to: number): Promise<GuardGap[]>;
  /** Heartbeats from the device's cursor (inclusive), in one query. */
  beatsFromCursor(deviceId: string, limit: number): Promise<{ seq: number; beat: Beat }[]>;
  /** Stores gaps and moves the device's cursor in one transaction. */
  saveGaps(deviceId: string, gaps: readonly GuardGap[], seq: number, at: number): Promise<void>;
}

export type Repos = Readonly<{
  devices: DeviceRepo;
  ledger: LedgerRepo;
  plans: PlanRepo;
  days: DayRepo;
  telemetry: TelemetryRepo;
  roadmap: RoadmapRepo;
  aiUsage: UsageCounter;
  verification: VerificationRepo;
  coach: CoachRepo;
  upkeep: UpkeepRepo;
}>;
