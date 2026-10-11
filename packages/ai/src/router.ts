import { err, ok, type Result } from '@mflow/core';
import { z } from 'zod';
import type {
  Answers,
  JudgeProvider,
  JudgeState,
  Questions,
  TalkProvider,
  TalkRequest,
} from './types';

export type Importance = 'essential' | 'flourish';
export type AiError = 'ai_unavailable';

/** Daily request counts per provider: D1 in the API, memory in tests. */
export interface UsageCounter {
  used(provider: string, day: string): Promise<number>;
  add(provider: string, day: string): Promise<void>;
}

export type Limited<P> = Readonly<{ provider: P; dailyLimit: number }>;

export type AiConfig = Readonly<{
  talk: readonly Limited<TalkProvider>[];
  judge: readonly Limited<JudgeProvider>[];
  usage: UsageCounter;
  /** The budget day (UTC date) for the counters. */
  day: () => string;
}>;

/** Past this share of a provider's daily limit, only essential calls (plans, verification) go through. */
export const FLOURISH_SHARE = 0.8;

export interface Ai {
  talkText(
    req: Readonly<{ system: string; prompt: string; importance: Importance }>,
  ): Promise<Result<string, AiError>>;
  talkJson<T>(
    req: Readonly<{ system: string; prompt: string; schema: z.ZodType<T>; importance: Importance }>,
  ): Promise<Result<T, AiError>>;
  judge(state: JudgeState, questions: Questions): Promise<Result<Answers, AiError>>;
}

export function memoryUsage(): UsageCounter {
  const counts = new Map<string, number>();
  const key = (provider: string, day: string) => `${day}|${provider}`;
  return {
    async used(provider, day) {
      return counts.get(key(provider, day)) ?? 0;
    },
    async add(provider, day) {
      counts.set(key(provider, day), (counts.get(key(provider, day)) ?? 0) + 1);
    },
  };
}

/** The zod schema as plain JSON Schema for a provider (the `$schema` URI removed). */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(z.toJSONSchema(schema) as Record<string, unknown>).filter(
      ([k]) => k !== '$schema',
    ),
  );
}

const unfence = (text: string): string =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

/** Parses and validates; the error names paths and rules only, so it is safe to show the model. */
function parseJson<T>(text: string, schema: z.ZodType<T>): Result<T, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(unfence(text));
  } catch {
    return err('the reply was not valid JSON');
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  return err(
    parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
  );
}

const REPAIR_NOTE = 'Your previous reply did not match the required JSON schema. Problems: ';

export function createAi(config: AiConfig): Ai {
  async function admit(name: string, limit: number, importance: Importance): Promise<boolean> {
    const day = config.day();
    const cap = importance === 'flourish' ? Math.floor(limit * FLOURISH_SHARE) : limit;
    if ((await config.usage.used(name, day)) >= cap) return false;
    await config.usage.add(name, day);
    return true;
  }

  async function call(entry: Limited<TalkProvider>, importance: Importance, req: TalkRequest) {
    if (!(await admit(entry.provider.name, entry.dailyLimit, importance))) return null;
    return entry.provider.talk(req);
  }

  return {
    async talkText({ system, prompt, importance }) {
      for (const entry of config.talk) {
        const res = await call(entry, importance, { system, prompt });
        if (res?.ok) return ok(res.value);
      }
      return err('ai_unavailable');
    },

    async talkJson({ system, prompt, schema, importance }) {
      const jsonSchema = jsonSchemaOf(schema);
      for (const entry of config.talk) {
        const first = await call(entry, importance, { system, prompt, jsonSchema });
        if (!first?.ok) continue;
        const parsed = parseJson(first.value, schema);
        if (parsed.ok) return parsed;
        const repairPrompt = `${prompt}\n\n${REPAIR_NOTE}${parsed.error}. Reply again with JSON only.`;
        const second = await call(entry, importance, { system, prompt: repairPrompt, jsonSchema });
        if (!second?.ok) continue;
        const repaired = parseJson(second.value, schema);
        if (repaired.ok) return repaired;
      }
      return err('ai_unavailable');
    },

    async judge(state, questions) {
      for (const entry of config.judge) {
        if (!(await admit(entry.provider.name, entry.dailyLimit, 'essential'))) continue;
        const res = await entry.provider.judge(state, questions);
        if (res.ok) return ok(res.value);
      }
      return err('ai_unavailable');
    },
  };
}
