import { addDays, isoWeekKey } from '@mflow/core';
import type { Difficulty } from '@mflow/math-engine/types';
import type { Deps } from '../env';
import type { Owner } from '../upkeep/owner';
import { seedFor, WORD_TOPICS } from './word-check';
import { makeWordProblem, type WordJob, type WordResult } from './word-problem';

export const PER_TOPIC = 3;
export const PER_WEEK = 12;
/** Accepted plus rejected: caps the AI spend on stories that keep failing the checks. */
export const MAX_ATTEMPTS = 24;
export const RECENT_DAYS = 14;
const DIFFICULTY_CYCLE: readonly Difficulty[] = [2, 3, 4];

type Counts = Readonly<{
  accepted: number;
  attempted: number;
  byTopic: ReadonlyMap<string, number>;
}>;

/** The next problem to make this week, or null when the bank is full or nothing fits. */
export function nextJob(week: string, topics: readonly string[], counts: Counts): WordJob | null {
  if (counts.accepted >= PER_WEEK || counts.attempted >= MAX_ATTEMPTS) return null;
  const topicId = topics.find(
    (t) => WORD_TOPICS.includes(t) && (counts.byTopic.get(t) ?? 0) < PER_TOPIC,
  );
  if (topicId === undefined) return null;
  const n = counts.attempted;
  return {
    week,
    topicId,
    difficulty: DIFFICULTY_CYCLE[(counts.byTopic.get(topicId) ?? 0) % DIFFICULTY_CYCLE.length] ?? 3,
    seed: seedFor(week, topicId, n),
  };
}

/** One word problem per upkeep tick, for the topics the owner practised recently. */
export async function runBankStep(deps: Deps, owner: Owner | null): Promise<WordResult | null> {
  if (owner === null) return null;
  const week = isoWeekKey(owner.day);
  const [topics, counts] = await Promise.all([
    deps.repos.telemetry.recentTopics(addDays(owner.day, -RECENT_DAYS)),
    deps.repos.bank.weekCounts(week),
  ]);
  const job = nextJob(week, topics, counts);
  return job === null ? null : makeWordProblem(deps, job);
}
