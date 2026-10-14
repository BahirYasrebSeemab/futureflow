import { err, type Result } from '@futureflow/core';
import { z } from 'zod';
import { parseAnswers } from './answers';
import { postJson } from './http';
import type { Answers, FetchLike, JudgeProvider, ProviderError } from './types';

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_DEFAULT_MODEL = 'jev-latest';

const JevResponseSchema = z.object({ answers: z.unknown() });

/** TypeSafe's Jev: typed, calibrated decisions. Paid per input token; used only to judge. */
export function jevJudge(opts: {
  apiKey: string;
  fetch: FetchLike;
  model?: string;
}): JudgeProvider {
  return {
    name: 'jev',
    async judge(state, questions): Promise<Result<Answers, ProviderError>> {
      const res = await postJson(
        opts.fetch,
        JEV_URL,
        { authorization: `Bearer ${opts.apiKey}` },
        { model: opts.model ?? JEV_DEFAULT_MODEL, state, questions },
      );
      if (!res.ok) return res;
      const body = JevResponseSchema.safeParse(res.value);
      return body.success ? parseAnswers(body.data.answers, questions) : err('invalid_output');
    },
  };
}
