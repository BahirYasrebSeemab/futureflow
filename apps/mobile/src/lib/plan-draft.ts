import type { Skill } from '@futureflow/contracts';
import { DEFAULT_RULES, type TaskSpec } from '@futureflow/core';

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 120;
const DEFAULT_MINUTES = 30;
const SMALL_SECONDS = 120;

export type TaskEdit = Partial<{
  title: string;
  criteria: string;
  when: string;
  minutes: number;
  smallTitle: string;
}>;

export type DraftProblem = Readonly<{ taskId: string | null; message: string }>;

export const minutesOf = (task: TaskSpec): number => Math.round(task.full.seconds / 60);

function applyEdit(task: TaskSpec, edit: TaskEdit): TaskSpec {
  const small = task.twoMinute;
  // A 2-minute version whose criteria just repeat its title keeps doing so as the title changes.
  const mirrored = small.criteria === '' || small.criteria === small.title;
  return {
    ...task,
    when: edit.when ?? task.when,
    full: {
      title: edit.title ?? task.full.title,
      criteria: edit.criteria ?? task.full.criteria,
      seconds: edit.minutes === undefined ? task.full.seconds : Math.round(edit.minutes) * 60,
    },
    twoMinute:
      edit.smallTitle === undefined
        ? small
        : {
            ...small,
            title: edit.smallTitle,
            criteria: mirrored ? edit.smallTitle : small.criteria,
          },
  };
}

export const editTask = (tasks: readonly TaskSpec[], id: string, edit: TaskEdit): TaskSpec[] =>
  tasks.map((t) => (t.id === id ? applyEdit(t, edit) : t));

export const removeTask = (tasks: readonly TaskSpec[], id: string): TaskSpec[] =>
  tasks.filter((t) => t.id !== id);

export const newTask = (skill: Pick<Skill, 'id' | 'verifier'>, id: string): TaskSpec => ({
  id,
  skillId: skill.id,
  verifier: skill.verifier,
  when: '',
  full: { title: '', criteria: '', seconds: DEFAULT_MINUTES * 60 },
  twoMinute: { title: '', criteria: '', seconds: SMALL_SECONDS },
});

const blank = (text: string) => text.trim() === '';

/** Problems that would make the server refuse the draft (TaskSpecSchema): they block Save. */
export function taskProblems(tasks: readonly TaskSpec[]): DraftProblem[] {
  return tasks.flatMap((t) => {
    const minutes = minutesOf(t);
    const checks: [boolean, string][] = [
      [blank(t.full.title), 'Give the task a title.'],
      [blank(t.full.criteria), 'Say how you will know it is done.'],
      [blank(t.when), 'Say when you will do it.'],
      [
        minutes < MIN_MINUTES || minutes > MAX_MINUTES,
        `Minutes must be ${MIN_MINUTES} to ${MAX_MINUTES}.`,
      ],
      [blank(t.twoMinute.title), 'Give the 2-minute version a title.'],
    ];
    return checks.filter(([failed]) => failed).map(([, message]) => ({ taskId: t.id, message }));
  });
}

/** Everything that blocks Save, plus the plan size rule (spec §6.1). */
export function lockProblems(tasks: readonly TaskSpec[]): DraftProblem[] {
  const { planMinTasks: min, planMaxTasks: max } = DEFAULT_RULES;
  const size: DraftProblem[] =
    tasks.length < min || tasks.length > max
      ? [{ taskId: null, message: `A plan needs ${min} to ${max} tasks to lock.` }]
      : [];
  return [...taskProblems(tasks), ...size];
}
