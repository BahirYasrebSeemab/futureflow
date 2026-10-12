import { describe, expect, it } from 'vitest';
import { JEV_URL, jevJudge } from '../src/jev';
import type { Questions } from '../src/types';
import { fakeFetch, jsonResponse } from './fakes';

const questions: Questions = {
  is_urgent: {
    type: 'noul',
    instructions: 'Does this convey urgency?',
    criteria: { true: 'Explicitly time-sensitive', false: 'No urgency expressed' },
  },
  department: {
    type: 'choice',
    instructions: 'Which team should handle this?',
    criteria: { billing: 'Payments', technical: 'Bugs', sales: 'Pricing' },
  },
};

// Response recorded from the Jev docs (Cloudflare model page, jev-1.13.0).
const recorded = {
  model: 'jev-1.13.0',
  answers: {
    is_urgent: { type: 'noul', noul: 0.95 },
    department: {
      type: 'choice',
      choice: 'billing',
      confidence: 0.8,
      probabilities: { billing: 0.87, sales: 0, technical: 0.13 },
    },
  },
  usage: { input_tokens: 426, output_tokens: 73 },
};

describe('jevJudge', () => {
  it('sends state and questions to systemOne with a bearer key and returns the answers', async () => {
    const { fetch, calls } = fakeFetch([jsonResponse(200, recorded)]);
    const result = await jevJudge({ apiKey: 'jev-key', fetch }).judge('Payouts failing', questions);

    expect(result).toEqual({ ok: true, value: recorded.answers });
    expect(calls[0]).toEqual({
      url: JEV_URL,
      headers: { 'content-type': 'application/json', authorization: 'Bearer jev-key' },
      body: { model: 'jev-latest', state: 'Payouts failing', questions },
    });
  });

  it('reports a response without valid answers as invalid output', async () => {
    const { fetch } = fakeFetch([jsonResponse(200, { model: 'jev-1.13.0' })]);
    expect(await jevJudge({ apiKey: 'k', fetch }).judge('s', questions)).toEqual({
      ok: false,
      error: 'invalid_output',
    });
  });

  it('passes transport errors through', async () => {
    const { fetch } = fakeFetch([jsonResponse(401, { error: 'bad key' })]);
    expect(await jevJudge({ apiKey: 'k', fetch }).judge('s', questions)).toEqual({
      ok: false,
      error: 'unauthorized',
    });
  });
});
