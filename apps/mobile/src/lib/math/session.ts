import type { AppServices } from '../app';
import { currentDayKey, formatDuration } from '../format';
import { DIFFICULTIES, nextTopic, ONTARIO_GRAPH } from './engine';
import { type Graded, itemKey, serveProblem, type Served } from './practice';
import { mathReward } from './rewards';
import { checkMathTasks } from './tasks';

export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);

/** The next problem for the owner: reviews first, then the next topic, in the target band. */
export async function nextProblem(
  services: AppServices,
  seed = randomSeed(),
): Promise<Served | null> {
  const today = currentDayKey(services.now());
  const progress = await services.store.mathProgress();
  const topicId = nextTopic(ONTARIO_GRAPH, progress, today);
  if (topicId === null) return null;
  const keys = DIFFICULTIES.map((d) => itemKey(topicId, d));
  const ratings = new Map<string, number | null>();
  for (const key of keys) ratings.set(key, await services.store.itemRating(key));
  return serveProblem(
    { progress, itemRating: (key) => ratings.get(key) ?? undefined },
    today,
    seed,
    topicId,
  );
}

const NO_REWARD: Readonly<Record<string, string>> = {
  too_easy: 'Too easy to earn time',
  used_hints: 'Earns nothing after a hint',
  repeat: 'Already seen, so no time',
  plan_not_locked: "Lock today's plan to earn time",
  cap_reached: "Today's math time is used up",
  not_today: 'Open Today to sync, then try again to earn time',
  already_granted: 'Already paid',
};

/**
 * Saves a graded answer (progress, item rating, attempt, seen) and pays its time if it earns.
 * Returns the reward line for a correct answer, or null after a wrong one.
 */
export async function recordGraded(
  services: AppServices,
  served: Served,
  graded: Exclude<Graded, { outcome: 'unreadable' }>,
): Promise<string | null> {
  const { store } = services;
  const now = services.now();
  await store.saveMathProgress([graded.progress]);
  await store.saveItemRating(graded.itemKey, graded.itemRating);
  await store.saveAttempt(graded.attempt);
  await store.markSeen(served.key, now);

  const saved = await store.savedToday();
  const currentDay = currentDayKey(now);
  let line: string | null = null;
  if (graded.outcome === 'correct') {
    if (!graded.earns) {
      line = NO_REWARD[graded.reason ?? ''] ?? null;
    } else if (saved === null) {
      line = NO_REWARD.not_today ?? null;
    } else {
      const [confirmed, pending] = await Promise.all([store.confirmed(), store.pending()]);
      const reward = mathReward({
        confirmed,
        pending,
        day: saved.today.day,
        currentDay,
        planLocked: saved.today.plan?.status === 'locked',
        attemptId: graded.attempt.id,
        answerType: graded.attempt.answerType,
        at: now,
        newId: () => services.ids.newId(now),
      });
      if ('seconds' in reward) {
        await store.enqueue(reward.events);
        line = `+${formatDuration(reward.seconds)}`;
      } else {
        line = NO_REWARD[reward.reason] ?? null;
      }
    }
  }
  if (saved !== null) await checkMathTasks(services, saved.today, currentDay);
  return line;
}
