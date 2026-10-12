import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiFromEnv, dailyLimit, GEMINI_MODELS } from '../src/ai';
import { d1AiUsage } from '../src/adapters/d1/ai-usage';
import type { FetchLike } from '@mflow/ai';
import { geminiReply, T0 } from './helpers';

const recording = (reply: (url: string) => ReturnType<typeof geminiReply>) => {
  const urls: string[] = [];
  const fetch: FetchLike = async (url) => {
    urls.push(url);
    return reply(url);
  };
  return { fetch, urls };
};

describe('aiFromEnv', () => {
  it('has no providers without keys', async () => {
    const { fetch, urls } = recording(() => geminiReply('hi'));
    const ai = aiFromEnv({ ...env, GEMINI_API_KEY: undefined }, d1AiUsage(env.DB), fetch, () => T0);
    expect(await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).toEqual({
      ok: false,
      error: 'ai_unavailable',
    });
    expect(urls).toEqual([]);
  });

  it('talks to Gemini Flash-Lite first and counts the call in D1 by UTC day', async () => {
    const { fetch, urls } = recording(() => geminiReply('hello'));
    const usage = d1AiUsage(env.DB);
    const ai = aiFromEnv({ ...env, GEMINI_API_KEY: 'g-key' }, usage, fetch, () => T0);

    expect(await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).toEqual({
      ok: true,
      value: 'hello',
    });
    expect(urls[0]).toContain(`${GEMINI_MODELS[0]}:generateContent`);
    expect(await usage.used(`gemini:${GEMINI_MODELS[0]}`, '2026-10-09')).toBe(1);
  });

  it('falls back to Gemini Flash when Flash-Lite fails', async () => {
    const { fetch, urls } = recording((url) =>
      url.includes(GEMINI_MODELS[0])
        ? { status: 503, text: async () => '{}' }
        : geminiReply('from flash'),
    );
    const ai = aiFromEnv({ ...env, GEMINI_API_KEY: 'g-key' }, d1AiUsage(env.DB), fetch, () => T0);

    expect(await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).toEqual({
      ok: true,
      value: 'from flash',
    });
    expect(urls).toHaveLength(2);
  });

  it('judges with Jev first when its key is set', async () => {
    const { fetch, urls } = recording(() => ({
      status: 200,
      text: async () =>
        JSON.stringify({ model: 'jev-1.13.0', answers: { done: { type: 'noul', noul: 0.9 } } }),
    }));
    const ai = aiFromEnv(
      { ...env, GEMINI_API_KEY: 'g-key', JEV_API_KEY: 'j-key' },
      d1AiUsage(env.DB),
      fetch,
      () => T0,
    );

    const result = await ai.judge('state', { done: { type: 'noul', instructions: 'Done?' } });

    expect(result).toEqual({ ok: true, value: { done: { type: 'noul', noul: 0.9 } } });
    expect(urls).toEqual(['https://api.typesafe.ai/v1/systemone']);
  });

  it('the D1 counter adds up per provider and day', async () => {
    const usage = d1AiUsage(env.DB);
    await usage.add('a', '2026-10-09');
    await usage.add('a', '2026-10-09');
    await usage.add('a', '2026-10-10');
    expect([
      await usage.used('a', '2026-10-09'),
      await usage.used('a', '2026-10-10'),
      await usage.used('b', '2026-10-09'),
    ]).toEqual([2, 1, 0]);
  });
});

describe('limits and failure logs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the daily limit per model from GEMINI_DAILY_LIMIT', async () => {
    const { fetch, urls } = recording(() => geminiReply('hi'));
    const ai = aiFromEnv(
      { ...env, GEMINI_API_KEY: 'g-key', GEMINI_DAILY_LIMIT: '1' },
      d1AiUsage(env.DB),
      fetch,
      () => T0,
    );

    await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' });
    await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' });

    expect(urls.map((u) => u.includes(GEMINI_MODELS[0]))).toEqual([true, false]);
  });

  it('defaults to a conservative limit when the setting is missing or invalid', () => {
    expect([
      dailyLimit(undefined, 100),
      dailyLimit('abc', 100),
      dailyLimit('0', 100),
      dailyLimit('40', 100),
    ]).toEqual([100, 100, 100, 40]);
  });

  it('logs one line per failed provider call: provider and category only', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { fetch } = recording(() => ({
      status: 400,
      text: async () => '{"error":"API_KEY_INVALID"}',
    }));
    const ai = aiFromEnv({ ...env, GEMINI_API_KEY: 'bad-key' }, d1AiUsage(env.DB), fetch, () => T0);

    await ai.talkText({ system: 's', prompt: 'private plan words', importance: 'essential' });

    const lines = log.mock.calls.map(
      (args) => JSON.parse(String(args[0])) as Record<string, unknown>,
    );
    expect(lines).toEqual([
      {
        level: 'warn',
        event: 'ai_provider_failed',
        provider: `gemini:${GEMINI_MODELS[0]}`,
        error: 'unavailable',
      },
      {
        level: 'warn',
        event: 'ai_provider_failed',
        provider: `gemini:${GEMINI_MODELS[1]}`,
        error: 'unavailable',
      },
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private plan words');
    expect(JSON.stringify(log.mock.calls)).not.toContain('bad-key');
  });
});
