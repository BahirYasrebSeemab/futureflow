import type { Questions } from '@futureflow/ai';
import { DEFAULT_REGISTRY } from '@futureflow/math-engine/generators';
import { toText } from '@futureflow/math-engine/rational';
import type { Difficulty, Problem } from '@futureflow/math-engine/types';
import { z } from 'zod';
import type { Deps } from '../env';
import { extractNumbers, isStoryable, splitInstructions, storyProblems } from './word-check';

/** The story must be judged equivalent with high confidence: a wrong lesson is worse than none. */
export const JUDGE_STRICT = 0.9;

export const StorySchema = z.object({ story: z.string().trim().min(30).max(600) });

const SYSTEM = [
  'You turn a math exercise into a short real-world word problem for an adult learner in Toronto.',
  'Use exactly the numbers given, each written as digits, and no other numbers or number words.',
  'Keep every unit and symbol exactly as in the exercise ($, %, °, cm, m, cm², ...); do not convert.',
  'Keep exactly the same calculation and the same answer. Do not solve it.',
  'Do not add rounding or answer-format instructions: they are added after your story.',
  'End with one clear question. Do not use names of real people.',
].join(' ');

const sameQuestion: Questions = {
  same: {
    type: 'noul',
    instructions:
      "The exercise's exact answer is `expectedAnswer`. Is the exact answer to the story's question that " +
      'same value, in the same units and with the same rounding and sign?',
    criteria: {
      true: "The story's answer is exactly expectedAnswer, in the exercise's units",
      false: 'Any difference in value, unit, rounding, sign, or in what is asked',
    },
  },
};

export type WordJob = Readonly<{
  week: string;
  topicId: string;
  difficulty: Difficulty;
  seed: number;
}>;

export type WordResult = 'accepted' | 'pending' | 'rejected' | 'unavailable' | 'skipped';

const TERMINATING_DIGITS = 4;

/** The expected answer as a learner would write it: a decimal when it terminates, else a fraction. */
export function answerLine(answer: Problem['answer']): string {
  if (answer.type !== 'number') return '';
  const { num, den } = answer.value;
  let value = toText(answer.value);
  for (let digits = 0; digits <= TERMINATING_DIGITS; digits++) {
    if ((num * 10 ** digits) % den === 0) {
      value = (num / den).toFixed(digits);
      break;
    }
  }
  return answer.unit === 'percent' ? `${value}%` : value;
}

/**
 * One problem: math-engine generates and answers; the AI only writes the story; the exercise's
 * rounding/format instructions are appended word for word; checks and a judge that sees the expected
 * answer guard the words. Until judge decisions are enabled (spec §14), passing stories stay pending.
 */
export async function makeWordProblem(deps: Deps, job: WordJob): Promise<WordResult> {
  const generator = DEFAULT_REGISTRY.get(job.topicId);
  if (generator === undefined) return 'unavailable';
  const problem = generator.generate(job.seed, job.difficulty);
  if (!isStoryable(problem.answer)) return 'skipped';
  const { body, instructions } = splitInstructions(problem.prompt);

  const written = await deps.ai.talkJson({
    system: SYSTEM,
    prompt: `Exercise: ${body}\nNumbers to use, as digits: ${extractNumbers(body).join(', ')}\nWrite the word problem.`,
    schema: StorySchema,
    importance: 'flourish',
  });
  if (!written.ok) return 'unavailable';
  const aiStory = written.value.story;
  const story = instructions === '' ? aiStory : `${aiStory} ${instructions}`;

  const reasons: string[] = storyProblems(problem.prompt, aiStory);
  if (reasons.length === 0) {
    const judged = await deps.ai.judge(
      { exercise: problem.prompt, expectedAnswer: answerLine(problem.answer), story },
      sameQuestion,
    );
    if (!judged.ok) return 'unavailable';
    const same = judged.value.same;
    if (same?.type !== 'noul' || same.noul < JUDGE_STRICT) reasons.push('judge_disagrees');
  }

  const status =
    reasons.length > 0 ? 'rejected' : deps.settings.judgeAutoDecide ? 'accepted' : 'pending';
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
