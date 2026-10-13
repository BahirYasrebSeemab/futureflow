import { addDays, isoWeekKey, weekdayOf } from '@mflow/core';
import { coachSystem } from '../coach/persona';
import type { Deps } from '../env';
import { ownerDay } from '../verification/run';

/** Spec §9.3: chat transcripts are kept 30 days, then summarized and deleted. */
export const RETENTION_DAYS = 30;
/** Past this, chat is deleted even without a summary: privacy wins over memory. */
export const HARD_RETENTION_DAYS = 60;
const MONDAY = 1;

export async function runWeekly(
  deps: Deps,
): Promise<{ summarized: string | null; deleted: number }> {
  if ((await deps.repos.devices.latestOffset()) === null) return { summarized: null, deleted: 0 };
  const { day } = await ownerDay(deps);
  const { coach } = deps.repos;

  let summarized: string | null = null;
  const lastWeek = isoWeekKey(addDays(day, -7));
  if (weekdayOf(day) === MONDAY && !(await coach.hasSummary(lastWeek))) {
    const messages = await coach.messagesForWeek(lastWeek);
    if (messages.length > 0) {
      const written = await deps.ai.talkText({
        system: coachSystem(await deps.repos.roadmap.get()),
        prompt: [
          `Summarize week ${lastWeek} of our conversation in at most 5 sentences: what I worked on,`,
          'what slipped, and what I said I would change. This summary replaces the transcript.',
          '',
          ...messages.map((m) => `${m.role === 'owner' ? 'Me' : 'You'} (${m.day}): ${m.text}`),
        ].join('\n'),
        importance: 'essential',
      });
      if (written.ok) {
        await coach.saveSummary(lastWeek, written.value.trim(), deps.now());
        summarized = lastWeek;
      }
    }
  }

  const deleted = await coach.deleteOld(
    addDays(day, -RETENTION_DAYS),
    addDays(day, -HARD_RETENTION_DAYS),
  );
  return { summarized, deleted };
}
