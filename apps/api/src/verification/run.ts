import {
  allPassed,
  dayKeyFor,
  DEFAULT_RULES,
  earn,
  requiredTasks,
  resolveDecision,
  sumKind,
  type Decision,
  type EarnRequest,
  type LedgerEvent,
  type Plan,
  type RequiredTask,
  type Verdict,
} from '@mflow/core';
import type { Deps } from '../env';
import { appendEvents } from '../ledger/append';
import type { StoredVerdict } from '../ports';
import { collectGithub, type CollectStatus } from './github';
import { judgeGithub, judgeReading } from './judge';

export type VerificationRun = Readonly<{ day: string; github: CollectStatus; judged: number }>;

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** The owner's current day: the newest device's offset and the 04:00 boundary. */
export async function ownerDay(deps: Deps): Promise<{ day: string; offset: number }> {
  const offset = (await deps.repos.devices.latestOffset()) ?? 0;
  return { day: dayKeyFor(deps.now(), offset, DEFAULT_RULES.dayBoundaryHour), offset };
}

/** For this long after the boundary, yesterday stays open: late-night commits, morning confirmations. */
export const GRACE_HOURS = 12;
const HOUR_MS = 60 * 60 * 1000;

/** The days that can still be verified or decided: today, plus yesterday inside the grace window. */
export function openDays(now: number, utcOffsetMinutes: number): string[] {
  const boundary = DEFAULT_RULES.dayBoundaryHour;
  const today = dayKeyFor(now, utcOffsetMinutes, boundary);
  const graceDay = dayKeyFor(now - GRACE_HOURS * HOUR_MS, utcOffsetMinutes, boundary);
  return graceDay === today ? [today] : [graceDay, today];
}

export async function requiredFor(deps: Deps, plan: Plan): Promise<RequiredTask[]> {
  const [entry, roadmap] = await Promise.all([
    deps.repos.days.entry(plan.day),
    deps.repos.roadmap.get(),
  ]);
  const rest = new Map<string, number>();
  for (const s of roadmap.skills) if (s.restWeekday !== undefined) rest.set(s.id, s.restWeekday);
  return requiredTasks(plan, entry?.record, rest);
}

/** A pending verdict with no judgment yet: the owner may decide it, and the judge retries. */
const placeholder = (day: string, taskId: string): StoredVerdict => ({
  day,
  taskId,
  outcome: 'pending',
  confidence: 0,
  by: 'judge',
  evidenceIds: [],
});

/** Without automatic decisions every judge verdict waits for the owner, carrying its suggestion. */
export function gate(
  verdict: Verdict,
  decision: Decision,
  day: string,
  autoDecide: boolean,
): StoredVerdict {
  const suggestion = decision.pass ? 'pass' : 'fail';
  if (verdict.outcome === 'pending' || !autoDecide)
    return { ...verdict, day, outcome: 'pending', suggestion };
  return { ...verdict, day };
}

/** Pays each passed task's reward, then the all-done bonus. Idempotent through core and the ledger. */
export async function settle(
  deps: Deps,
  plan: Plan,
  required: readonly RequiredTask[],
): Promise<void> {
  const { ledger, verification } = deps.repos;
  const now = deps.now();
  const verdicts = await verification.verdictsForDay(plan.day);
  let events: LedgerEvent[] = await ledger.forDay(plan.day);
  let { outstandingBorrow } = await ledger.totals();
  const ctx = { day: plan.day, at: now, newId: deps.newId };

  const pay = async (req: EarnRequest): Promise<void> => {
    const earned = earn(events, req, ctx, DEFAULT_RULES, {
      planLocked: plan.status === 'locked',
      outstandingBorrow,
    });
    if (!earned.ok) return;
    await appendEvents(ledger, earned.value, null, now);
    events = [...events, ...earned.value];
    outstandingBorrow = Math.max(0, outstandingBorrow + sumKind(earned.value, 'borrow_repay'));
  };

  const passed = new Set(verdicts.filter((v) => v.outcome === 'pass').map((v) => v.taskId));
  for (const r of required) {
    if (passed.has(r.taskId))
      await pay({ kind: 'task_reward', taskId: r.taskId, seconds: r.version.seconds });
  }
  if (allPassed(required, verdicts)) await pay({ kind: 'all_done_bonus' });
}

/** Collect evidence, judge what changed, pay what passed. Safe to run any number of times. */
export async function runVerification(deps: Deps): Promise<VerificationRun> {
  const { day, offset } = await ownerDay(deps);
  const github = await collectGithub(deps, offset);
  let judged = 0;
  for (const open of openDays(deps.now(), offset)) judged += await verifyDay(deps, open, github);
  return { day, github, judged };
}

/** Judges one day's changed evidence and settles it; returns how many tasks were judged. */
async function verifyDay(deps: Deps, day: string, github: CollectStatus): Promise<number> {
  const plan = await deps.repos.plans.get(day);
  if (plan === null || plan.status !== 'locked') return 0;

  const store = deps.repos.verification;
  const required = await requiredFor(deps, plan);
  const [verdicts, commits, logs] = await Promise.all([
    store.verdictsForDay(day),
    store.commitsForDay(day),
    store.readingForDay(day),
  ]);

  let judged = 0;
  for (const r of required) {
    const task = plan.tasks.find((t) => t.id === r.taskId);
    if (task === undefined || (task.verifier !== 'github' && task.verifier !== 'reading')) continue;
    const previous = verdicts.find((v) => v.taskId === r.taskId);
    if (previous?.outcome === 'pass') continue;
    const ids = task.verifier === 'github' ? commits.map((c) => c.sha) : logs.map((l) => l.id);
    // Spec §13.1: a dead GitHub token makes GitHub tasks pending, so the owner can still decide.
    const unreadable = task.verifier === 'github' && github === 'invalid_token';
    if (ids.length === 0) {
      if (unreadable && previous === undefined)
        await store.saveVerdict(placeholder(day, r.taskId), deps.now());
      continue;
    }
    if (previous !== undefined && sameIds(previous.evidenceIds, ids)) continue;

    const decision =
      task.verifier === 'github'
        ? await judgeGithub(deps.ai, r.version, commits)
        : await judgeReading(deps.ai, r.version, logs);
    if (decision === null) {
      // Spec §13.1: all AI unavailable → pending. Its empty evidence list never matches, so the
      // next run asks the judge again; meanwhile the owner can decide by hand.
      if (previous === undefined) await store.saveVerdict(placeholder(day, r.taskId), deps.now());
      continue;
    }
    const resolved = resolveDecision(r.taskId, ids, decision, 'judge', DEFAULT_RULES);
    await store.saveVerdict(
      gate(resolved, decision, day, deps.settings.judgeAutoDecide),
      deps.now(),
    );
    judged += 1;
  }

  await settle(deps, plan, required);
  return judged;
}
