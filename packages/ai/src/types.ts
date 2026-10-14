import type { Result } from '@futureflow/core';

/** The slice of `fetch` the adapters use, injected so tests and runtimes supply their own. */
export type FetchLike = (
  url: string,
  init: Readonly<{
    method: 'GET' | 'POST';
    headers: Readonly<Record<string, string>>;
    body?: string;
  }>,
) => Promise<Readonly<{ status: number; text(): Promise<string> }>>;

/** Why one provider call failed. The router reacts by trying the next provider. */
export type ProviderError = 'unavailable' | 'rate_limited' | 'unauthorized' | 'invalid_output';

export type TalkRequest = Readonly<{
  system: string;
  prompt: string;
  /** When present, the provider must answer with JSON matching this JSON Schema. */
  jsonSchema?: Readonly<Record<string, unknown>>;
}>;

export interface TalkProvider {
  readonly name: string;
  talk(req: TalkRequest): Promise<Result<string, ProviderError>>;
}

/** Jev's three question types (TypeSafe `systemOne`). */
export type NoulQuestion = Readonly<{
  type: 'noul';
  instructions: string;
  criteria?: Readonly<{ true: string; false: string }>;
}>;
export type ChoiceQuestion = Readonly<{
  type: 'choice';
  instructions: string;
  criteria: Readonly<Record<string, string>>;
}>;
export type ScoreQuestion = Readonly<{
  type: 'score';
  instructions: string;
  /** Ordered levels, lowest first; at least two. */
  criteria: readonly string[];
}>;
export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type Questions = Readonly<Record<string, Question>>;

/** `noul` is the probability of "yes"; it has no separate confidence. */
export type NoulAnswer = Readonly<{ type: 'noul'; noul: number }>;
export type ChoiceAnswer = Readonly<{
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Readonly<Record<string, number>>;
}>;
export type ScoreAnswer = Readonly<{
  type: 'score';
  score: number;
  confidence: number;
  probabilities: Readonly<Record<string, number>>;
}>;
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;
export type Answers = Readonly<Record<string, Answer>>;

export type JudgeState = string | Readonly<Record<string, unknown>>;

export interface JudgeProvider {
  readonly name: string;
  judge(state: JudgeState, questions: Questions): Promise<Result<Answers, ProviderError>>;
}
