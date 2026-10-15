import type { BankProblem } from '@futureflow/contracts';
import { DEFAULT_REGISTRY, type Difficulty, type Problem } from './engine';

/**
 * A word problem from the server's bank, re-made on the phone. The exercise, answer, hints and
 * steps all come from the phone's own generator; only the AI's story is kept, for display. If the
 * regenerated exercise differs from the bank's, it is refused; the bank's answer is never used
 * (ADR 0014). The answer is formatted from the exercise, never from the story's wording.
 */
export function verifiedBankProblem(bank: BankProblem): { problem: Problem; story: string } | null {
  const generator = DEFAULT_REGISTRY.get(bank.topicId);
  if (generator === undefined) return null;
  const problem = generator.generate(bank.seed, bank.difficulty as Difficulty);
  if (problem.prompt !== bank.prompt) return null;
  return { problem, story: bank.story };
}
