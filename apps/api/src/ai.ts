import {
  createAi,
  geminiJudge,
  geminiTalk,
  jevJudge,
  type Ai,
  type FetchLike,
  type UsageCounter,
} from '@mflow/ai';
import type { Bindings } from './env';

/** Talk order: the cheapest free model first. Free-tier quotas are per project (see AI Studio). */
export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'] as const;
/** Kept well under the free tier, and counted per UTC day (Google resets at midnight Pacific). */
export const GEMINI_DAILY_LIMIT = 500;
/** Jev is paid per input token; this caps the worst case at a few cents a day. */
export const JEV_DAILY_LIMIT = 200;
export const AI_TIMEOUT_MS = 20_000;

/** Global fetch with a timeout. Waiting on the network does not use Worker CPU time. */
export const timeoutFetch: FetchLike = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

export function aiFromEnv(
  env: Bindings,
  usage: UsageCounter,
  fetchImpl: FetchLike,
  now: () => number,
): Ai {
  const geminiKey = env.GEMINI_API_KEY;
  const talk =
    geminiKey === undefined || geminiKey === ''
      ? []
      : GEMINI_MODELS.map((model) => ({
          provider: geminiTalk({ apiKey: geminiKey, model, fetch: fetchImpl }),
          dailyLimit: GEMINI_DAILY_LIMIT,
        }));
  const jevKey = env.JEV_API_KEY;
  const lite = talk[0];
  const judge = [
    ...(jevKey === undefined || jevKey === ''
      ? []
      : [
          { provider: jevJudge({ apiKey: jevKey, fetch: fetchImpl }), dailyLimit: JEV_DAILY_LIMIT },
        ]),
    ...(lite === undefined
      ? []
      : [{ provider: geminiJudge(lite.provider), dailyLimit: GEMINI_DAILY_LIMIT }]),
  ];
  return createAi({ talk, judge, usage, day: () => new Date(now()).toISOString().slice(0, 10) });
}
