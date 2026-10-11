import { describe, expect, it } from 'vitest';
import { GEMINI_BASE_URL, geminiJudge, geminiTalk } from '../src/gemini';
import type { Questions } from '../src/types';
import { fakeFetch, jsonResponse } from './fakes';

/** generateContent response shape (Gemini API docs). */
const reply = (...texts: string[]) =>
  jsonResponse(200, {
    candidates: [
      {
        content: { parts: texts.map((text) => ({ text })), role: 'model' },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 12, totalTokenCount: 16 },
  });

const talkWith = (responses: Parameters<typeof fakeFetch>[0]) => {
  const fake = fakeFetch(responses);
  return {
    fake,
    talk: geminiTalk({ apiKey: 'g-key', model: 'gemini-3.5-flash-lite', fetch: fake.fetch }),
  };
};

describe('geminiTalk', () => {
  it('sends the system instruction and prompt, and joins the text parts', async () => {
    const { fake, talk } = talkWith([reply('Hello', ' there')]);

    const result = await talk.talk({ system: 'Be brief.', prompt: 'Hi' });

    expect(result).toEqual({ ok: true, value: 'Hello there' });
    expect(talk.name).toBe('gemini:gemini-3.5-flash-lite');
    expect(fake.calls[0]).toEqual({
      url: `${GEMINI_BASE_URL}/gemini-3.5-flash-lite:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': 'g-key' },
      body: {
        systemInstruction: { parts: [{ text: 'Be brief.' }] },
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      },
    });
  });

  it('asks for JSON when a schema is given', async () => {
    const { fake, talk } = talkWith([reply('{}')]);
    const jsonSchema = { type: 'object', properties: {} };
    await talk.talk({ system: 's', prompt: 'p', jsonSchema });
    expect(fake.calls[0]?.body).toMatchObject({
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: jsonSchema },
    });
  });

  it.each([
    ['no candidates (blocked)', jsonResponse(200, { promptFeedback: { blockReason: 'SAFETY' } })],
    ['empty text', reply('  ')],
    ['an unexpected shape', jsonResponse(200, { candidates: 'nope' })],
  ])('reports %s as invalid output', async (_label, response) => {
    const { talk } = talkWith([response]);
    expect(await talk.talk({ system: 's', prompt: 'p' })).toEqual({
      ok: false,
      error: 'invalid_output',
    });
  });

  it('passes transport errors through', async () => {
    const { talk } = talkWith([jsonResponse(429, {})]);
    expect(await talk.talk({ system: 's', prompt: 'p' })).toEqual({
      ok: false,
      error: 'rate_limited',
    });
  });
});

describe('geminiJudge', () => {
  const questions: Questions = {
    done: { type: 'noul', instructions: 'Did the commits finish the task?' },
    size: {
      type: 'choice',
      instructions: 'How big is the change?',
      criteria: { small: 's', large: 'l' },
    },
    quality: {
      type: 'score',
      instructions: 'How good is the summary?',
      criteria: ['Poor', 'Fair', 'Good'],
    },
  };

  it('turns Gemini probabilities into Jev-shaped answers', async () => {
    const raw = {
      done: { yes: 0.9 },
      size: { small: 3, large: 1 },
      quality: { '0': 0, '1': 0.5, '2': 0.5 },
    };
    const { fake, talk } = talkWith([reply(JSON.stringify(raw))]);

    const result = await geminiJudge(talk).judge({ diff: '+ fix' }, questions);

    expect(result).toEqual({
      ok: true,
      value: {
        done: { type: 'noul', noul: 0.9 },
        size: {
          type: 'choice',
          choice: 'small',
          confidence: 0.75,
          probabilities: { small: 0.75, large: 0.25 },
        },
        quality: {
          type: 'score',
          score: 1.5,
          confidence: 0.5,
          probabilities: { '0': 0, '1': 0.5, '2': 0.5 },
        },
      },
    });
    expect(geminiJudge(talk).name).toBe(talk.name);
    const sent = JSON.stringify(fake.calls[0]?.body);
    expect(sent).toContain('Did the commits finish the task?');
    expect(sent).toContain('responseJsonSchema');
  });

  it.each([
    [
      'all-zero probabilities',
      { done: { yes: 0.5 }, size: { small: 0, large: 0 }, quality: { '0': 1, '1': 0, '2': 0 } },
    ],
    ['a missing question', { done: { yes: 0.5 }, size: { small: 1, large: 0 } }],
    ['not JSON', 'definitely yes'],
  ])('reports %s as invalid output', async (_label, raw) => {
    const { talk } = talkWith([reply(typeof raw === 'string' ? raw : JSON.stringify(raw))]);
    expect(await geminiJudge(talk).judge('s', questions)).toEqual({
      ok: false,
      error: 'invalid_output',
    });
  });

  it('passes the talk error through', async () => {
    const { talk } = talkWith(['network_error']);
    expect(await geminiJudge(talk).judge('s', questions)).toEqual({
      ok: false,
      error: 'unavailable',
    });
  });
});

describe('geminiJudge edge cases', () => {
  const noul: Questions = {
    urgent: {
      type: 'noul',
      instructions: 'Urgent?',
      criteria: { true: 'Time-sensitive', false: 'Can wait' },
    },
  };

  it('describes yes/no criteria to the model', async () => {
    const { fake, talk } = talkWith([reply('{"urgent":{"yes":0.2}}')]);
    expect(await geminiJudge(talk).judge('s', noul)).toEqual({
      ok: true,
      value: { urgent: { type: 'noul', noul: 0.2 } },
    });
    const prompt = JSON.stringify(fake.calls[0]?.body);
    expect(prompt).toContain('yes: Time-sensitive');
    expect(prompt).toContain('no: Can wait');
  });

  it.each([
    ['a yes/no answer without "yes"', '{"urgent":{"no":0.8}}'],
    ['a yes probability above 1', '{"urgent":{"yes":1.5}}'],
  ])('rejects %s', async (_label, text) => {
    const { talk } = talkWith([reply(text)]);
    expect(await geminiJudge(talk).judge('s', noul)).toEqual({
      ok: false,
      error: 'invalid_output',
    });
  });

  it('treats an option the model left out as probability 0', async () => {
    const choice: Questions = {
      team: { type: 'choice', instructions: 'Team?', criteria: { a: 'A', b: 'B' } },
    };
    const { talk } = talkWith([reply('{"team":{"b":1}}')]);
    expect(await geminiJudge(talk).judge('s', choice)).toEqual({
      ok: true,
      value: {
        team: { type: 'choice', choice: 'b', confidence: 1, probabilities: { a: 0, b: 1 } },
      },
    });
  });
});
