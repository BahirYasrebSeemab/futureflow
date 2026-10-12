import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { aiFromEnv, GEMINI_MODELS } from '../src/ai';
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
