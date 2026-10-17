import type { AppServices } from '../app';
import { currentDayKey, formatDuration } from '../format';
import { verifiedBankProblem } from './bank';
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
  const served = serveProblem(
    { progress, itemRating: (key) => ratings.get(key) ?? undefined },
    today,
    seed,
    topicId,
  );
  if (served === null) return null;
  try {
    return (await fromBank(services, served)) ?? served;
  } catch (error) {
    // The bank is optional: any trouble with it falls back to a generated problem.
    const name = error instanceof Error ? error.name : 'unknown';
    console.error(JSON.stringify({ event: 'bank_serve_failed', name }));
    return served;
  }
}

/** An unused bank word problem for the same topic and difficulty, if it re-verifies on the phone. */
async function fromBank(services: AppServices, served: Served): Promise<Served | null> {
  for (;;) {
    const bank = await services.store.unusedBankProblem(served.topicId, served.difficulty);
    if (bank === null) return null;
    const verified = verifiedBankProblem(bank);
    if (verified === null) {
      await services.store.markBankUsed(bank.id); // never show a problem that doesn't re-verify
      continue;
    }
    return {
      ...served,
      problem: verified.problem,
      story: verified.story,
      seed: bank.seed,
      key: `bank:${bank.id}`,
      bankId: bank.id,
    };
  }
}

const NO_REWARD: Readonly<Record<string, string>> = {
  too_easy: 'Too easy to earn time',
  used_hints: 'Earns nothing after a hint',
  repeat: 'Already seen, so no time',
  plan_not_locked: "Lock today's plan to earn time",
  cap_reached: "Today's earning limit is reached",
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
  if (served.bankId !== undefined) await store.markBankUsed(served.bankId);

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
        const repaid = reward.events.some((e) => e.kind === 'borrow_repay');
        line = repaid
          ? `+${formatDuration(reward.seconds)}, paid toward borrowed time`
          : `+${formatDuration(reward.seconds)}`;
      } else {
        line = NO_REWARD[reward.reason] ?? null;
      }
    }
  }
  if (saved !== null) {
    // In the background: the answer's result must not wait on the network (Today retries too).
    void checkMathTasks(services, saved.today, currentDay).catch((error: unknown) => {
      const name = error instanceof Error ? error.name : 'unknown';
      console.error(JSON.stringify({ event: 'math_tasks_failed', name }));
    });
  }
  return line;
}
