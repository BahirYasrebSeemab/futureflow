import { describe, expect, it } from 'vitest';
import { parseAnswers } from '../src/answers';
import { postJson } from '../src/http';
import type { Questions } from '../src/types';
import { fakeFetch, jsonResponse } from './fakes';

const questions: Questions = {
  urgent: { type: 'noul', instructions: 'Is it urgent?' },
  team: { type: 'choice', instructions: 'Which team?', criteria: { billing: 'b', technical: 't' } },
  mood: {
    type: 'score',
    instructions: 'How angry?',
    criteria: ['Calm', 'Frustrated', 'Very angry'],
  },
};

// Shapes copied from the Jev docs (Cloudflare model page, jev-1.13.0).
const valid = {
  urgent: { type: 'noul', noul: 0.95 },
  team: {
    type: 'choice',
    choice: 'billing',
    confidence: 0.8,
    probabilities: { billing: 0.87, technical: 0.13 },
  },
  mood: {
    type: 'score',
    score: 1.04,
    confidence: 0.94,
    legend: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
    probabilities: { '0': 0, '1': 0.96, '2': 0.04 },
  },
};

describe('parseAnswers', () => {
  it('accepts answers that fit their questions and drops extra fields', () => {
    const result = parseAnswers(valid, questions);
    expect(result.ok && result.value.mood).toEqual({
      type: 'score',
      score: 1.04,
      confidence: 0.94,
      probabilities: { '0': 0, '1': 0.96, '2': 0.04 },
    });
  });

  it.each([
    ['a missing question', { ...valid, urgent: undefined }],
    ['a choice that is not an option', { ...valid, team: { ...valid.team, choice: 'sales' } }],
    ['a score outside the scale', { ...valid, mood: { ...valid.mood, score: 2.5 } }],
    [
      'a wrong answer type',
      { ...valid, urgent: { type: 'choice', choice: 'x', confidence: 1, probabilities: {} } },
    ],
    ['a probability above 1', { ...valid, urgent: { type: 'noul', noul: 1.2 } }],
    ['not an object', 'yes'],
  ])('rejects %s', (_label, raw) => {
    expect(parseAnswers(raw, questions)).toEqual({ ok: false, error: 'invalid_output' });
  });
});

describe('postJson', () => {
  const call = (responses: Parameters<typeof fakeFetch>[0]) => {
    const fake = fakeFetch(responses);
    return { fake, result: postJson(fake.fetch, 'https://x.test/v1', { auth: 'k' }, { a: 1 }) };
  };

  it('posts JSON with the given headers and parses the reply', async () => {
    const { fake, result } = call([jsonResponse(200, { b: 2 })]);
    expect(await result).toEqual({ ok: true, value: { b: 2 } });
    expect(fake.calls[0]).toEqual({
      url: 'https://x.test/v1',
      headers: { 'content-type': 'application/json', auth: 'k' },
      body: { a: 1 },
    });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [404, 'unavailable'],
  ] as const)('maps HTTP %i to %s', async (status, error) => {
    expect(await call([jsonResponse(status, {})]).result).toEqual({ ok: false, error });
  });

  it('maps a network failure to unavailable and a non-JSON body to invalid_output', async () => {
    expect(await call(['network_error']).result).toEqual({ ok: false, error: 'unavailable' });
    expect(await call([{ status: 200, body: '<html>' }]).result).toEqual({
      ok: false,
      error: 'invalid_output',
    });
  });
});
