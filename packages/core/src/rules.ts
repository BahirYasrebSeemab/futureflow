/** Every tunable number of the system. Amounts are integer seconds. */
export type Rules = Readonly<{
  dayBoundaryHour: number;
  nightlyReminderHour: number;
  baseSeconds: number;
  dailyCapSeconds: number;
  mathSecondsPerProblem: number;
  mathDailyCapSeconds: number;
  choiceRewardFactor: number;
  allDoneBonusSeconds: number;
  planMinTasks: number;
  planMaxTasks: number;
  unlockMinReasonLength: number;
  unlockWaitSeconds: number;
  unlockGrantSeconds: number;
  unlockMaxPerDay: number;
  badDaysPerWeek: number;
  unverifiedAwayPerMonth: number;
  judgeConfidenceThreshold: number;
  heartbeatSeconds: number;
}>;

const MINUTE = 60;

export const DEFAULT_RULES: Rules = Object.freeze({
  dayBoundaryHour: 4,
  nightlyReminderHour: 21,
  baseSeconds: 15 * MINUTE,
  dailyCapSeconds: 120 * MINUTE,
  mathSecondsPerProblem: 3 * MINUTE,
  mathDailyCapSeconds: 45 * MINUTE,
  choiceRewardFactor: 0.5,
  allDoneBonusSeconds: 15 * MINUTE,
  planMinTasks: 3,
  planMaxTasks: 5,
  unlockMinReasonLength: 20,
  unlockWaitSeconds: 10 * MINUTE,
  unlockGrantSeconds: 10 * MINUTE,
  unlockMaxPerDay: 2,
  badDaysPerWeek: 1,
  unverifiedAwayPerMonth: 2,
  judgeConfidenceThreshold: 0.75,
  heartbeatSeconds: 15 * MINUTE,
});
