import { analyzeBeats, DEFAULT_RULES, overlapMs, parseDayKey, type GuardGap } from '@mflow/core';
import type { Deps } from '../env';

export const MAX_BEATS_PER_RUN = 500;
/** "If the phone was off for a whole day" (spec §6.5), with slack for a few minutes on. */
export const PHONE_OFF_RECLASSIFY_HOURS = 16;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** A day's span in UTC ms: from its 04:00 on the owner's clock to the next day's 04:00. */
export function dayWindow(day: string, utcOffsetMinutes: number): { from: number; to: number } {
  const from =
    parseDayKey(day) + DEFAULT_RULES.dayBoundaryHour * HOUR_MS - utcOffsetMinutes * MINUTE_MS;
  return { from, to: from + 24 * HOUR_MS };
}

export type GuardDay = Readonly<{
  day: string;
  phoneOffMinutes: number;
  guardDisabledMinutes: number;
  gaps: GuardGap[];
}>;

export async function guardDay(
  deps: Deps,
  day: string,
  utcOffsetMinutes: number,
): Promise<GuardDay> {
  const { from, to } = dayWindow(day, utcOffsetMinutes);
  const gaps = await deps.repos.upkeep.gapsBetween(from, to);
  const minutes = (kind: GuardGap['kind']) =>
    Math.round(overlapMs(gaps, kind, from, to) / MINUTE_MS);
  return {
    day,
    phoneOffMinutes: minutes('phone_off'),
    guardDisabledMinutes: minutes('guard_disabled'),
    gaps,
  };
}

/** Turns new heartbeats into stored gaps for every device. Returns how many gaps were found. */
export async function analyzeGuard(deps: Deps): Promise<number> {
  const { upkeep } = deps.repos;
  let found = 0;
  for (const deviceId of await upkeep.devices()) {
    const rows = await upkeep.beatsFromCursor(deviceId, MAX_BEATS_PER_RUN);
    if (rows.length < 2) continue;
    const gaps = analyzeBeats(
      rows.map((r) => r.beat),
      DEFAULT_RULES,
    );
    const last = rows.at(-1);
    if (last !== undefined) await upkeep.saveGaps(deviceId, gaps, last.seq, deps.now());
    found += gaps.length;
  }
  return found;
}
