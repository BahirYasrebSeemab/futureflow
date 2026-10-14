import { addDays, isoWeekKey } from '@futureflow/core';
import { coachSystem } from '../coach/persona';
import type { Deps } from '../env';
import { ownerOf, type Owner } from './owner';

/** Spec §9.3: chat transcripts are kept 30 days, then summarized and deleted. */
export const RETENTION_DAYS = 30;
/** Past this, chat is deleted even without a summary: privacy wins over memory. */
export const HARD_RETENTION_DAYS = 60;

export async function runWeekly(
  deps: Deps,
  owner?: Owner | null,
): Promise<{ summarized: string | null; deleted: number }> {
  const o = await ownerOf(deps, owner);
  if (o === null) return { summarized: null, deleted: 0 };
  const { day } = o;
  const { coach } = deps.repos;

  // Old chat goes first (retention), then one unsummarized past week is summarized: on any day, so
  // a week missed while the AI was down is caught up before the 60-day limit removes it.
  const deleted = await coach.deleteOld(
    addDays(day, -RETENTION_DAYS),
    addDays(day, -HARD_RETENTION_DAYS),
  );
  let summarized: string | null = null;
  const week = await coach.oldestUnsummarizedWeek(isoWeekKey(day));
  if (week !== null) {
    const messages = await coach.messagesForWeek(week);
    const written = await deps.ai.talkText({
      system: coachSystem(await o.roadmap()),
      prompt: [
        `Summarize week ${week} of our conversation in at most 5 sentences: what I worked on,`,
        'what slipped, and what I said I would change. This summary replaces the transcript.',
        '',
        ...messages.map((m) => `${m.role === 'owner' ? 'Me' : 'You'} (${m.day}): ${m.text}`),
      ].join('\n'),
      importance: 'essential',
    });
    if (written.ok) {
      await coach.saveSummary(week, written.value.trim(), deps.now());
      summarized = week;
    }
  }
  return { summarized, deleted };
}
