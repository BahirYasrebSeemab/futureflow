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
/**
 * Default daily request limit per Gemini model. Free-tier quotas change and are shown per project in
 * AI Studio; set GEMINI_DAILY_LIMIT to at most half of yours (we count per UTC day, Google resets at
 * midnight Pacific).
 */
export const DEFAULT_GEMINI_DAILY_LIMIT = 100;
/** Jev is paid per input token; this caps the worst case at a few cents a day. */
export const DEFAULT_JEV_DAILY_LIMIT = 200;
export const AI_TIMEOUT_MS = 20_000;

/** Global fetch with a timeout. Waiting on the network does not use Worker CPU time. */
export const timeoutFetch: FetchLike = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

/** A positive whole number from a Worker setting, or the default. */
export const dailyLimit = (setting: string | undefined, fallback: number): number => {
  const n = Number(setting);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** One structured line per failed provider call: which provider and why, never prompts or keys. */
const logFailure = (provider: string, error: string): void => {
  console.warn(JSON.stringify({ level: 'warn', event: 'ai_provider_failed', provider, error }));
};

export function aiFromEnv(
  env: Bindings,
  usage: UsageCounter,
  fetchImpl: FetchLike,
  now: () => number,
): Ai {
  const geminiKey = env.GEMINI_API_KEY;
  const geminiLimit = dailyLimit(env.GEMINI_DAILY_LIMIT, DEFAULT_GEMINI_DAILY_LIMIT);
  const talk =
    geminiKey === undefined || geminiKey === ''
      ? []
      : GEMINI_MODELS.map((model) => ({
          provider: geminiTalk({ apiKey: geminiKey, model, fetch: fetchImpl }),
          dailyLimit: geminiLimit,
        }));
  const jevKey = env.JEV_API_KEY;
  const lite = talk[0];
  const judge = [
    ...(jevKey === undefined || jevKey === ''
      ? []
      : [
          {
            provider: jevJudge({ apiKey: jevKey, fetch: fetchImpl }),
            dailyLimit: dailyLimit(env.JEV_DAILY_LIMIT, DEFAULT_JEV_DAILY_LIMIT),
          },
        ]),
    ...(lite === undefined
      ? []
      : [{ provider: geminiJudge(lite.provider), dailyLimit: geminiLimit }]),
  ];
  return createAi({
    talk,
    judge,
    usage,
    day: () => new Date(now()).toISOString().slice(0, 10),
    onFailure: logFailure,
  });
}
