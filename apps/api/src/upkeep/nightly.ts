import { addDays, createDraft, DEFAULT_RULES, editDraft } from '@mflow/core';
import { coachSystem, todayFacts, type CoachFacts } from '../coach/persona';
import type { Deps } from '../env';
import { activeSkills, aiTasks, templateTasks } from '../planning/propose';
import { ownerOf, type Owner } from './owner';
import { guardDay } from './guard';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export type ReviewFacts = CoachFacts &
  Readonly<{
    unlocks: number;
    readingLogs: number;
    math: Readonly<{ attempts: number; correct: number }>;
    phoneOffMinutes: number;
    guardDisabledMinutes: number;
  }>;

/** Spec §6.2: the night review opens at the reminder hour and lasts until the day boundary. */
export function isNightly(now: number, utcOffsetMinutes: number): boolean {
  const hour =
    ((((now + utcOffsetMinutes * MINUTE_MS) % (24 * HOUR_MS)) + 24 * HOUR_MS) % (24 * HOUR_MS)) /
    HOUR_MS;
  return hour >= DEFAULT_RULES.nightlyReminderHour || hour < DEFAULT_RULES.dayBoundaryHour;
}

/** Plain facts, used when the AI is unavailable: the review always arrives. */
export function templateReview(f: ReviewFacts): string {
  const passed = f.tasks.filter((t) => t.outcome === 'pass').length;
  const parts = [
    f.tasks.length === 0
      ? 'No plan was locked today.'
      : `${passed} of ${f.tasks.length} tasks passed.`,
    `You earned ${f.earnedMinutes} min and spent ${f.spentMinutes} min.`,
  ];
  if (f.math.attempts > 0)
    parts.push(`${f.math.correct} of ${f.math.attempts} math problems right.`);
  if (f.readingLogs > 0)
    parts.push(`${f.readingLogs} reading log${f.readingLogs === 1 ? '' : 's'}.`);
  if (f.unlocks > 0) parts.push(`${f.unlocks} emergency unlock${f.unlocks === 1 ? '' : 's'}.`);
  if (f.guardDisabledMinutes > 0)
    parts.push(`The guard was off for ${f.guardDisabledMinutes} min: that counts as a miss.`);
  if (f.phoneOffMinutes > 0)
    parts.push(`The phone was off for ${f.phoneOffMinutes} min (not a miss).`);
  return parts.join(' ');
}

async function reviewFacts(deps: Deps, day: string, offset: number): Promise<ReviewFacts> {
  const events = await deps.repos.ledger.forDay(day);
  const [base, logs, math, guard] = await Promise.all([
    todayFacts(deps, day, events),
    deps.repos.verification.readingForDay(day),
    deps.repos.telemetry.mathSummary(day),
    guardDay(deps, day, offset),
  ]);
  return {
    ...base,
    unlocks: events.filter((e) => e.kind === 'unlock_borrow').length,
    readingLogs: logs.length,
    math,
    phoneOffMinutes: guard.phoneOffMinutes,
    guardDisabledMinutes: guard.guardDisabledMinutes,
  };
}

const describeFacts = (f: ReviewFacts): string =>
  [
    `Day ${f.day}. Tasks: ${f.tasks.map((t) => `${t.title} (${t.outcome})`).join('; ') || 'none locked'}.`,
    `Earned ${f.earnedMinutes} min, spent ${f.spentMinutes} min, ${f.unlocks} emergency unlocks.`,
    `Reading logs: ${f.readingLogs}. Math: ${f.math.correct}/${f.math.attempts} right.`,
    `Guard off ${f.guardDisabledMinutes} min (a miss); phone off ${f.phoneOffMinutes} min (not a miss).`,
  ].join('\n');

/** Once a night: the coach's review of today, then a draft plan for tomorrow if none exists. */
export async function runNightly(
  deps: Deps,
  owner?: Owner | null,
): Promise<{ day: string; review: 'ai' | 'template'; proposed: boolean } | null> {
  const o = await ownerOf(deps, owner);
  if (o === null || !isNightly(deps.now(), o.offset)) return null;
  const { day, offset } = o;
  if (await deps.repos.upkeep.nightlyDone(day)) return null;

  const [facts, roadmap] = await Promise.all([reviewFacts(deps, day, offset), o.roadmap()]);
  const written = await deps.ai.talkText({
    system: coachSystem(roadmap),
    prompt: `Write tonight's review in 3 to 5 short sentences, specific to these facts:\n${describeFacts(facts)}`,
    importance: 'essential',
  });
  await deps.repos.coach.addCoachMessage({
    id: deps.newId(),
    role: 'coach',
    kind: 'review',
    text: written.ok ? written.value.trim() : templateReview(facts),
    day,
    createdAt: deps.now(),
  });

  const tomorrow = addDays(day, 1);
  let proposed = false;
  if (
    (await deps.repos.plans.get(tomorrow)) === null &&
    activeSkills(roadmap, tomorrow).length > 0
  ) {
    const tasks =
      (await aiTasks(deps.ai, roadmap, tomorrow, deps.newId)) ??
      templateTasks(roadmap, tomorrow, deps.newId);
    const draft = editDraft(createDraft(tomorrow, []), tasks);
    if (draft.ok) proposed = await deps.repos.plans.save(draft.value, deps.now());
  }

  await deps.repos.upkeep.markNightly(day, deps.now());
  return { day, review: written.ok ? 'ai' : 'template', proposed };
}
