import { z } from 'zod';

export const BankQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** A word problem: the story is the AI's; the prompt, answer, hints and steps are math-engine's. */
export const BankProblemSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  difficulty: z.number().int().min(1).max(5),
  seed: z.number().int(),
  story: z.string(),
  prompt: z.string(),
  answer: z.unknown(),
  hints: z.array(z.string()),
  steps: z.array(z.string()),
  week: z.string(),
  createdAt: z.number().int(),
});

export type BankProblem = z.infer<typeof BankProblemSchema>;
