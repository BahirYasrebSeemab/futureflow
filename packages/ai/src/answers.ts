import { err, ok, type Result } from '@mflow/core';
import { z } from 'zod';
import type { Answer, Answers, Question, Questions } from './types';

const Probability = z.number().min(0).max(1);

const AnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: Probability }),
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    confidence: Probability,
    probabilities: z.record(z.string(), Probability),
  }),
  z.object({
    type: z.literal('score'),
    score: z.number(),
    confidence: Probability,
    probabilities: z.record(z.string(), Probability),
  }),
]);

const AnswersSchema = z.record(z.string(), AnswerSchema);

function fits(answer: Answer, question: Question): boolean {
  if (answer.type === 'noul') return question.type === 'noul';
  if (answer.type === 'choice') {
    return question.type === 'choice' && Object.hasOwn(question.criteria, answer.choice);
  }
  return (
    question.type === 'score' && answer.score >= 0 && answer.score <= question.criteria.length - 1
  );
}

/** Jev-shaped answers, checked against the questions: every question answered, every answer legal. */
export function parseAnswers(
  raw: unknown,
  questions: Questions,
): Result<Answers, 'invalid_output'> {
  const parsed = AnswersSchema.safeParse(raw);
  if (!parsed.success) return err('invalid_output');
  const answers: Record<string, Answer> = {};
  for (const [key, question] of Object.entries(questions)) {
    const answer = parsed.data[key];
    if (answer === undefined || !fits(answer, question)) return err('invalid_output');
    answers[key] = answer;
  }
  return ok(answers);
}
