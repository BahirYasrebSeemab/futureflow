import type { Ai, FetchLike } from '@mflow/ai';
import type { Device, Repos } from './ports';

/** Worker bindings: the generated `Env` plus secrets, which `wrangler types` cannot see. */
export type Bindings = Env & {
  SETUP_CODE?: string;
  GEMINI_API_KEY?: string;
  JEV_API_KEY?: string;
  /** Optional per-model daily request limits (whole numbers). */
  GEMINI_DAILY_LIMIT?: string;
  JEV_DAILY_LIMIT?: string;
  GITHUB_TOKEN_KEY?: string;
  /** "on" lets confident judge verdicts pass or fail tasks on their own (spec §14). */
  JUDGE_AUTO_DECIDE?: string;
};

/** Everything a handler needs from the outside world, injected so tests control it. */
export type Deps = Readonly<{
  now: () => number;
  newId: () => string;
  repos: Repos;
  /** True when the request may proceed under the rate limit for `key`. */
  limit: (key: string) => Promise<boolean>;
  /** The AI router: Gemini talk, Jev/Gemini judge, budget-guarded. */
  ai: Ai;
  /** Outgoing HTTP (AI providers, GitHub); tests pass a fake. */
  fetch: FetchLike;
  settings: Readonly<{ githubTokenKey?: string; judgeAutoDecide: boolean }>;
}>;

export type AppEnv = { Bindings: Bindings; Variables: { deps: Deps; device: Device } };
