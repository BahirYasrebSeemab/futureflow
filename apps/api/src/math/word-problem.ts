import type { Questions } from '@mflow/ai';
import { DEFAULT_REGISTRY } from '@mflow/math-engine/generators';
import type { Difficulty } from '@mflow/math-engine/types';
import { z } from 'zod';
import type { Deps } from '../env';
import { extractNumbers, storyProblems } from './word-check';

/** The story must be judged equivalent with high confidence: a wrong lesson is worse than none. */
export const JUDGE_STRICT = 0.9;

export const StorySchema = z.object({ story: z.string().trim().min(30).max(600) });

const SYSTEM = [
  'You turn a math exercise into a short real-world word problem for an adult learner in Toronto.',
  'Use exactly the numbers given, each written as digits, and no other numbers or number words.',
  'Keep exactly the same calculation and the same answer. Do not solve it.',
  'End with one clear question. Do not use names of real people.',
].join(' ');

const sameQuestion: Questions = {
  same: {
    type: 'noul',
    instructions:
      "Does answering the story's question require exactly the same calculation as the exercise, giving the same answer?",
    criteria: {
      true: 'Same quantities, same operations, same unknown',
      false: 'Any difference in what is computed or asked',
    },
  },
};

export type WordJob = Readonly<{
  week: string;
  topicId: string;
  difficulty: Difficulty;
  seed: number;
}>;

/** One problem: math-engine generates and answers; the AI only writes words; checks guard the words. */
export async function makeWordProblem(
  deps: Deps,
  job: WordJob,
): Promise<'accepted' | 'rejected' | 'unavailable'> {
  const generator = DEFAULT_REGISTRY.get(job.topicId);
  if (generator === undefined) return 'unavailable';
  const problem = generator.generate(job.seed, job.difficulty);

  const written = await deps.ai.talkJson({
    system: SYSTEM,
    prompt: `Exercise: ${problem.prompt}\nNumbers to use, as digits: ${extractNumbers(problem.prompt).join(', ')}\nWrite the word problem.`,
    schema: StorySchema,
    importance: 'flourish',
  });
  if (!written.ok) return 'unavailable';
  const story = written.value.story;

  const reasons: string[] = storyProblems(problem.prompt, story);
  if (reasons.length === 0) {
    const judged = await deps.ai.judge({ exercise: problem.prompt, story }, sameQuestion);
    if (!judged.ok) return 'unavailable';
    const same = judged.value.same;
    if (same?.type !== 'noul' || same.noul < JUDGE_STRICT) reasons.push('judge_disagrees');
  }

  const status = reasons.length === 0 ? 'accepted' : 'rejected';
  await deps.repos.bank.add(
    {
      id: deps.newId(),
      topicId: job.topicId,
      difficulty: job.difficulty,
      seed: job.seed,
      story,
      prompt: problem.prompt,
      answer: problem.answer,
      hints: [...problem.hints],
      steps: [...problem.steps],
      week: job.week,
      createdAt: deps.now(),
    },
    status,
    reasons.length === 0 ? null : reasons.join(','),
  );
  return status;
}
