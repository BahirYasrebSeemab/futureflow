import { err, ok, type Result } from '@mflow/core';
import { z } from 'zod';
import { parseAnswers } from './answers';
import { postJson } from './http';
import type {
  Answer,
  Answers,
  FetchLike,
  JudgeProvider,
  ProviderError,
  Question,
  Questions,
  TalkProvider,
} from './types';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const GenerateContentSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ text: z.string().optional() })).optional() })
          .optional(),
      }),
    )
    .optional(),
});

/** Gemini `generateContent` (stateless: nothing is stored server-side). */
export function geminiTalk(opts: {
  apiKey: string;
  model: string;
  fetch: FetchLike;
}): TalkProvider {
  return {
    name: `gemini:${opts.model}`,
    async talk(req) {
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        ...(req.jsonSchema === undefined
          ? {}
          : {
              generationConfig: {
                responseMimeType: 'application/json',
                responseJsonSchema: req.jsonSchema,
              },
            }),
      };
      const res = await postJson(
        opts.fetch,
        `${GEMINI_BASE_URL}/${opts.model}:generateContent`,
        { 'x-goog-api-key': opts.apiKey },
        body,
      );
      if (!res.ok) return res;
      const parsed = GenerateContentSchema.safeParse(res.value);
      const parts = parsed.success ? (parsed.data.candidates?.[0]?.content?.parts ?? []) : [];
      const text = parts.map((p) => p.text ?? '').join('');
      return text.trim() === '' ? err('invalid_output') : ok(text);
    },
  };
}

const JUDGE_SYSTEM = [
  'You are a careful evaluator. Use only the given state; do not assume facts that are not in it.',
  'For every question, give probabilities that honestly reflect how sure you are.',
  'Answer with JSON only, matching the schema.',
].join(' ');

const levelsOf = (q: Question): string[] =>
  q.type === 'choice'
    ? Object.keys(q.criteria)
    : q.type === 'score'
      ? q.criteria.map((_, i) => String(i))
      : [];

const probabilityObject = (keys: readonly string[]) => ({
  type: 'object',
  properties: Object.fromEntries(keys.map((k) => [k, { type: 'number', minimum: 0, maximum: 1 }])),
  required: [...keys],
});

function judgeSchema(questions: Questions): Record<string, unknown> {
  const properties = Object.fromEntries(
    Object.entries(questions).map(([key, q]) => [
      key,
      q.type === 'noul' ? probabilityObject(['yes']) : probabilityObject(levelsOf(q)),
    ]),
  );
  return { type: 'object', properties, required: Object.keys(questions) };
}

function describeQuestion(key: string, q: Question): string {
  const lines = [`- ${key} (${q.type}): ${q.instructions}`];
  if (q.type === 'noul' && q.criteria !== undefined) {
    lines.push(`  yes: ${q.criteria.true}`, `  no: ${q.criteria.false}`);
  }
  if (q.type === 'choice') {
    lines.push(...Object.entries(q.criteria).map(([label, text]) => `  ${label}: ${text}`));
  }
  if (q.type === 'score') lines.push(...q.criteria.map((text, i) => `  ${i}: ${text}`));
  const hint =
    q.type === 'noul'
      ? 'Give "yes": the probability that the answer is yes.'
      : 'Give a probability for every option.';
  return [...lines, `  ${hint}`].join('\n');
}

// Raw weights may not sum to 1 (or even stay below 1): they are normalized; the final answers are checked.
const RawSchema = z.record(z.string(), z.record(z.string(), z.number().min(0)));

function toAnswer(q: Question, raw: Readonly<Record<string, number>> | undefined): Answer | null {
  if (raw === undefined) return null;
  if (q.type === 'noul') return raw.yes === undefined ? null : { type: 'noul', noul: raw.yes };
  const levels = levelsOf(q);
  const total = levels.reduce((sum, k) => sum + (raw[k] ?? 0), 0);
  if (total <= 0) return null;
  const probabilities = Object.fromEntries(levels.map((k) => [k, (raw[k] ?? 0) / total]));
  const best = levels.reduce((a, b) => ((probabilities[b] ?? 0) > (probabilities[a] ?? 0) ? b : a));
  const confidence = probabilities[best] ?? 0;
  if (q.type === 'choice') return { type: 'choice', choice: best, confidence, probabilities };
  const score = levels.reduce((sum, k, i) => sum + i * (probabilities[k] ?? 0), 0);
  return { type: 'score', score, confidence, probabilities };
}

/**
 * The fallback judge: Gemini asked for probabilities, reshaped into Jev's answers. Its confidence
 * is self-reported, not calibrated, so the judge eval set (spec §14) gates auto-pass.
 */
export function geminiJudge(talk: TalkProvider): JudgeProvider {
  return {
    name: talk.name,
    async judge(state, questions): Promise<Result<Answers, ProviderError>> {
      const prompt = [
        'State:',
        typeof state === 'string' ? state : JSON.stringify(state, null, 2),
        '',
        'Questions:',
        ...Object.entries(questions).map(([key, q]) => describeQuestion(key, q)),
      ].join('\n');
      const res = await talk.talk({
        system: JUDGE_SYSTEM,
        prompt,
        jsonSchema: judgeSchema(questions),
      });
      if (!res.ok) return res;
      let raw: unknown;
      try {
        raw = JSON.parse(res.value);
      } catch {
        return err('invalid_output');
      }
      const parsed = RawSchema.safeParse(raw);
      if (!parsed.success) return err('invalid_output');
      const answers: Record<string, Answer> = {};
      for (const [key, q] of Object.entries(questions)) {
        const answer = toAnswer(q, parsed.data[key]);
        if (answer === null) return err('invalid_output');
        answers[key] = answer;
      }
      return parseAnswers(answers, questions);
    },
  };
}
