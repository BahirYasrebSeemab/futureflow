import { addDays, isoWeekKey } from '@futureflow/core';
import { DEFAULT_REGISTRY } from '@futureflow/math-engine/generators';
import type { Difficulty } from '@futureflow/math-engine/types';
import type { Deps } from '../env';
import type { BankCounts } from '../ports';
import type { Owner } from '../upkeep/owner';
import { isStoryable, seedFor, WORD_TOPICS } from './word-check';
import { makeWordProblem, type WordResult } from './word-problem';

export const PER_TOPIC = 3;
export const PER_WEEK = 12;
/** Accepted, pending and rejected: caps the AI spend on stories that keep failing the checks. */
export const MAX_ATTEMPTS = 24;
/** One hard topic (say, trigonometry whose stories keep dropping a number) cannot use the week up. */
export const MAX_TOPIC_ATTEMPTS = 2 * PER_TOPIC;
export const RECENT_DAYS = 14;
/** Seeds tried to find an exercise that makes a fair story (a positive number answer). */
export const MAX_SEED_TRIES = 16;
const DIFFICULTY_CYCLE: readonly Difficulty[] = [2, 3, 4];

export type BankJob = Readonly<{
  week: string;
  topicId: string;
  difficulty: Difficulty;
  n: number;
}>;

/** The next problem to make this week, or null when the bank is full or nothing fits. */
export function nextJob(
  week: string,
  topics: readonly string[],
  counts: BankCounts,
): BankJob | null {
  if (counts.kept >= PER_WEEK || counts.attempted >= MAX_ATTEMPTS) return null;
  const topicId = topics.find(
    (t) =>
      WORD_TOPICS.includes(t) &&
      (counts.keptByTopic.get(t) ?? 0) < PER_TOPIC &&
      (counts.attemptedByTopic.get(t) ?? 0) < MAX_TOPIC_ATTEMPTS,
  );
  if (topicId === undefined) return null;
  const kept = counts.keptByTopic.get(topicId) ?? 0;
  return {
    week,
    topicId,
    difficulty: DIFFICULTY_CYCLE[kept % DIFFICULTY_CYCLE.length] ?? 3,
    n: counts.attemptedByTopic.get(topicId) ?? 0,
  };
}

/** The first deterministic seed whose exercise makes a fair story, or null. */
export function storyableSeed(job: BankJob): number | null {
  const generator = DEFAULT_REGISTRY.get(job.topicId);
  if (generator === undefined) return null;
  for (let k = 0; k < MAX_SEED_TRIES; k++) {
    const seed = seedFor(job.week, job.topicId, `${job.n}.${k}`);
    if (isStoryable(generator.generate(seed, job.difficulty).answer)) return seed;
  }
  return null;
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
  if (job === null) return null;
  const seed = storyableSeed(job);
  if (seed === null) return 'skipped';
  return makeWordProblem(deps, { week, topicId: job.topicId, difficulty: job.difficulty, seed });
}
