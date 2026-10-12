import type { Ai, Answer, Questions } from '@mflow/ai';
import type { ReadingLog } from '@mflow/contracts';
import type { Decision, TaskVersion } from '@mflow/core';
import type { CommitEvidence } from '../ports';

export const githubQuestions: Questions = {
  done: {
    type: 'noul',
    instructions: "Do the commits complete the task, as the task's criteria describe?",
    criteria: {
      true: 'The commits clearly do what the criteria ask',
      false: 'The commits do not do it, or only partly',
    },
  },
};

export const READING_PASS_LEVEL = 3;

export const readingQuestions: Questions = {
  substance: {
    type: 'score',
    instructions:
      'How substantial are these reading notes as evidence that the reading was understood and meets the task?',
    criteria: [
      'No real summary',
      'Only the title or a phrase',
      'A vague sentence with no idea from the reading',
      'Names the main idea',
      'The main idea in their own words, with a detail',
      'A clear own-words summary with an insight or an application',
    ],
  },
};

/** Patch text across all commits in one judge call (newest first); messages and stats always fit. */
export const MAX_STATE_PATCH_CHARS = 40_000;

export function githubState(task: TaskVersion, commits: readonly CommitEvidence[]) {
  let budget = MAX_STATE_PATCH_CHARS;
  return {
    task: { title: task.title, criteria: task.criteria },
    commits: commits.map((c) => ({
      repo: c.repo,
      message: c.message,
      additions: c.additions,
      deletions: c.deletions,
      files: c.files.map((f) => {
        const patch = f.patch !== undefined && f.patch.length <= budget ? f.patch : undefined;
        if (patch !== undefined) budget -= patch.length;
        return {
          filename: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          ...(patch === undefined ? {} : { patch }),
        };
      }),
    })),
  };
}

export const readingState = (task: TaskVersion, logs: readonly ReadingLog[]) => ({
  task: { title: task.title, criteria: task.criteria },
  readingLogs: logs.map((l) => ({
    title: l.title,
    source: l.source,
    summary: l.summary,
    ...(l.pages === undefined ? {} : { pages: l.pages }),
    ...(l.minutes === undefined ? {} : { minutes: l.minutes }),
  })),
});

const certainty = (p: number): number => Math.max(p, 1 - p);

export function noulDecision(answer: Answer | undefined): Decision | null {
  if (answer?.type !== 'noul') return null;
  return { pass: answer.noul >= 0.5, confidence: certainty(answer.noul) };
}

/** Pass when the probability of a score at or above `passLevel` is at least one half. */
export function scoreDecision(answer: Answer | undefined, passLevel: number): Decision | null {
  if (answer?.type !== 'score') return null;
  const atOrAbove = Object.entries(answer.probabilities)
    .filter(([level]) => Number(level) >= passLevel)
    .reduce((sum, [, p]) => sum + p, 0);
  const p = Math.min(1, atOrAbove);
  return { pass: p >= 0.5, confidence: certainty(p) };
}

export async function judgeGithub(
  ai: Ai,
  task: TaskVersion,
  commits: readonly CommitEvidence[],
): Promise<Decision | null> {
  const res = await ai.judge(githubState(task, commits), githubQuestions);
  return res.ok ? noulDecision(res.value.done) : null;
}

export async function judgeReading(
  ai: Ai,
  task: TaskVersion,
  logs: readonly ReadingLog[],
): Promise<Decision | null> {
  const res = await ai.judge(readingState(task, logs), readingQuestions);
  return res.ok ? scoreDecision(res.value.substance, READING_PASS_LEVEL) : null;
}
