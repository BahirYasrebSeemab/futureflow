import { addDays, dayKeyFor, DEFAULT_RULES, type DayKey } from '@mflow/core';
import type { Device } from '../ports';

/** Events stamped further ahead than this are refused: the phone clock is wrong or tampered with. */
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/** The device's current day key: its UTC offset and the 04:00 boundary. */
export const deviceToday = (device: Device, now: number): DayKey =>
  dayKeyFor(now, device.utcOffsetMinutes, DEFAULT_RULES.dayBoundaryHour);

/** True when `day` is between `before` days before and `after` days after `today`. */
export const isWithinDays = (day: DayKey, today: DayKey, before: number, after: number): boolean =>
  day >= addDays(today, -before) && day <= addDays(today, after);
