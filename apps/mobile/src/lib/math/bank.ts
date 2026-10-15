import type { BankProblem } from '@futureflow/contracts';
import { DEFAULT_REGISTRY, type Difficulty, type Problem } from './engine';

/**
 * A word problem from the server's bank, re-made on the phone: the story is the AI's, but the
 * exercise, answer, hints and steps come from the phone's own generator. If the regenerated
 * exercise differs from the bank's (a different generator version), it is refused — the bank's
 * answer is never used (ADR 0014).
 */
export function verifiedBankProblem(bank: BankProblem): Problem | null {
  const generator = DEFAULT_REGISTRY.get(bank.topicId);
  if (generator === undefined) return null;
  const regenerated = generator.generate(bank.seed, bank.difficulty as Difficulty);
  if (regenerated.prompt !== bank.prompt) return null;
  return { ...regenerated, prompt: bank.story };
}
