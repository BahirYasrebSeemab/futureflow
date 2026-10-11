import { err, ok, type Result } from '@mflow/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAi, jsonSchemaOf, memoryUsage, type Limited } from '../src/router';
import type { Answers, JudgeProvider, ProviderError, Questions, TalkProvider } from '../src/types';

const DAY = '2026-10-11';

function scriptedTalk(name: string, replies: Result<string, ProviderError>[]) {
  const prompts: string[] = [];
  const provider: TalkProvider = {
    name,
    async talk(req) {
      prompts.push(req.prompt);
      return replies[Math.min(prompts.length - 1, replies.length - 1)] ?? err('unavailable');
    },
  };
  return { provider, prompts };
}

const limited = <P>(provider: P, dailyLimit = 10): Limited<P> => ({ provider, dailyLimit });
const Plan = z.object({ tasks: z.array(z.string()).min(1) });

describe('talkJson', () => {
  it('returns parsed, schema-checked JSON (fences tolerated) and counts the call', async () => {
    const usage = memoryUsage();
    const a = scriptedTalk('a', [ok('```json\n{"tasks":["ship"]}\n```')]);
    const ai = createAi({ talk: [limited(a.provider)], judge: [], usage, day: () => DAY });

    expect(
      await ai.talkJson({ system: 's', prompt: 'p', schema: Plan, importance: 'essential' }),
    ).toEqual({
      ok: true,
      value: { tasks: ['ship'] },
    });
    expect(await usage.used('a', DAY)).toBe(1);
  });

  it('repairs once on the same provider, naming what was wrong', async () => {
    const a = scriptedTalk('a', [ok('{"tasks":[]}'), ok('{"tasks":["read"]}')]);
    const ai = createAi({
      talk: [limited(a.provider)],
      judge: [],
      usage: memoryUsage(),
      day: () => DAY,
    });

    const result = await ai.talkJson({
      system: 's',
      prompt: 'plan',
      schema: Plan,
      importance: 'essential',
    });

    expect(result).toEqual({ ok: true, value: { tasks: ['read'] } });
    expect(a.prompts).toHaveLength(2);
    expect(a.prompts[1]).toContain('plan');
    expect(a.prompts[1]).toContain('tasks');
  });

  it('moves to the next provider after a failed repair or an error, then gives up', async () => {
    const a = scriptedTalk('a', [ok('prose'), ok('still prose')]);
    const b = scriptedTalk('b', [err('rate_limited')]);
    const c = scriptedTalk('c', [ok('{"tasks":["x"]}')]);
    const ai = createAi({
      talk: [limited(a.provider), limited(b.provider), limited(c.provider)],
      judge: [],
      usage: memoryUsage(),
      day: () => DAY,
    });

    expect(
      (await ai.talkJson({ system: 's', prompt: 'p', schema: Plan, importance: 'essential' })).ok,
    ).toBe(true);
    expect([a.prompts.length, b.prompts.length, c.prompts.length]).toEqual([2, 1, 1]);

    const none = createAi({
      talk: [limited(a.provider)],
      judge: [],
      usage: memoryUsage(),
      day: () => DAY,
    });
    expect(
      await none.talkJson({ system: 's', prompt: 'p', schema: Plan, importance: 'essential' }),
    ).toEqual({
      ok: false,
      error: 'ai_unavailable',
    });
  });

  it('sends the zod schema as JSON Schema without the $schema key', () => {
    expect(jsonSchemaOf(Plan)).toEqual({
      type: 'object',
      properties: { tasks: { type: 'array', items: { type: 'string' }, minItems: 1 } },
      required: ['tasks'],
      additionalProperties: false,
    });
  });
});

describe('budget guard', () => {
  it('skips a provider at its daily limit without calling it', async () => {
    const usage = memoryUsage();
    for (let i = 0; i < 10; i++) await usage.add('a', DAY);
    const a = scriptedTalk('a', [ok('hi')]);
    const ai = createAi({ talk: [limited(a.provider, 10)], judge: [], usage, day: () => DAY });

    expect(await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).toEqual({
      ok: false,
      error: 'ai_unavailable',
    });
    expect(a.prompts).toHaveLength(0);
  });

  it('cuts flourish at 80% of the limit but keeps essential calls going', async () => {
    const usage = memoryUsage();
    for (let i = 0; i < 8; i++) await usage.add('a', DAY);
    const a = scriptedTalk('a', [ok('hi')]);
    const ai = createAi({ talk: [limited(a.provider, 10)], judge: [], usage, day: () => DAY });

    expect((await ai.talkText({ system: 's', prompt: 'p', importance: 'flourish' })).ok).toBe(
      false,
    );
    expect(await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).toEqual({
      ok: true,
      value: 'hi',
    });
  });

  it('counts per day', async () => {
    const usage = memoryUsage();
    for (let i = 0; i < 10; i++) await usage.add('a', '2026-10-10');
    const a = scriptedTalk('a', [ok('hi')]);
    const ai = createAi({ talk: [limited(a.provider, 10)], judge: [], usage, day: () => DAY });
    expect((await ai.talkText({ system: 's', prompt: 'p', importance: 'essential' })).ok).toBe(
      true,
    );
  });
});

describe('judge', () => {
  const questions: Questions = { done: { type: 'noul', instructions: 'Done?' } };
  const answers: Answers = { done: { type: 'noul', noul: 0.9 } };
  const judgeOf = (name: string, result: Result<Answers, ProviderError>) => {
    let calls = 0;
    const provider: JudgeProvider = {
      name,
      async judge() {
        calls += 1;
        return result;
      },
    };
    return { provider, calls: () => calls };
  };

  it('falls back to the next judge and reports ai_unavailable when all fail', async () => {
    const jev = judgeOf('jev', err('unauthorized'));
    const gemini = judgeOf('gemini', ok(answers));
    const ai = createAi({
      talk: [],
      judge: [limited(jev.provider), limited(gemini.provider)],
      usage: memoryUsage(),
      day: () => DAY,
    });

    expect(await ai.judge('state', questions)).toEqual({ ok: true, value: answers });

    const broken = createAi({
      talk: [],
      judge: [limited(jev.provider)],
      usage: memoryUsage(),
      day: () => DAY,
    });
    expect(await broken.judge('state', questions)).toEqual({ ok: false, error: 'ai_unavailable' });
  });

  it('judging is essential: it may use the whole limit', async () => {
    const usage = memoryUsage();
    for (let i = 0; i < 9; i++) await usage.add('gemini', DAY);
    const gemini = judgeOf('gemini', ok(answers));
    const ai = createAi({ talk: [], judge: [limited(gemini.provider, 10)], usage, day: () => DAY });
    expect((await ai.judge('state', questions)).ok).toBe(true);
  });
});
