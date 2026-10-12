import type { Ai } from '@mflow/ai';
import type { Roadmap } from '@mflow/contracts';
import { DEFAULT_RULES, isRestDay, weekdayOf, type DayKey, type TaskSpec } from '@mflow/core';
import { z } from 'zod';

export const PROPOSAL_TASK_SECONDS = 30 * 60;
export const TWO_MINUTE_SECONDS = 2 * 60;
const TITLE_MAX = 120;
const MILESTONES_PER_SKILL = 3;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Skill = Roadmap['skills'][number];

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

export const activeSkills = (roadmap: Roadmap, day: DayKey): Skill[] =>
  roadmap.skills.filter((s) => !isRestDay(s.restWeekday, day));

const openMilestones = (roadmap: Roadmap, skillId: string) =>
  roadmap.milestones.filter((m) => m.skillId === skillId && !m.done);

/** The deterministic plan: used when the AI is unavailable or its answer is unusable (spec §13.1). */
export function templateTasks(roadmap: Roadmap, day: DayKey, newId: () => string): TaskSpec[] {
  return activeSkills(roadmap, day)
    .slice(0, DEFAULT_RULES.planMaxTasks)
    .map((skill) => {
      const title = clip(
        openMilestones(roadmap, skill.id)[0]?.title ?? `Practice ${skill.name}`,
        TITLE_MAX,
      );
      return {
        id: newId(),
        skillId: skill.id,
        when: 'Choose a time and an anchor habit',
        verifier: skill.verifier,
        full: { title, criteria: skill.rubric, seconds: PROPOSAL_TASK_SECONDS },
        twoMinute: {
          title: clip(`Two minutes: ${title}`, TITLE_MAX),
          criteria: 'Start it for two minutes',
          seconds: TWO_MINUTE_SECONDS,
        },
      };
    });
}

const proposedTask = (skillId: z.ZodType<string>) =>
  z.object({
    skillId,
    title: z.string().trim().min(1).max(TITLE_MAX),
    criteria: z.string().trim().min(1).max(500),
    minutes: z.number().int().min(5).max(120),
    when: z.string().trim().min(1).max(120),
    twoMinuteTitle: z.string().trim().min(1).max(TITLE_MAX),
    twoMinuteCriteria: z.string().trim().min(1).max(500),
  });

/**
 * Parsing accepts any skill id, so one stray task (an invented or resting skill) is dropped later
 * instead of throwing away a good proposal. The guide sent to the model lists the allowed ids.
 */
export const proposalSchema = (skillIds: readonly [string, ...string[]]) => ({
  parse: z.object({
    tasks: z.array(proposedTask(z.string())).min(1).max(DEFAULT_RULES.planMaxTasks),
  }),
  guide: z.object({
    tasks: z
      .array(proposedTask(z.enum(skillIds)))
      .min(1)
      .max(DEFAULT_RULES.planMaxTasks),
  }),
});

const VERIFIER_HINTS =
  'github = commits or pull requests; math = solved practice problems in the app; ' +
  'reading = a reading log with a short summary; usage = staying under a phone-time limit.';

/** Only what planning needs: identities, active skills, their next open milestones. No location, ledger or chat. */
export function proposalPrompt(roadmap: Roadmap, day: DayKey): { system: string; prompt: string } {
  const active = activeSkills(roadmap, day);
  const becoming = roadmap.identities.map((i) => i.title).join(', ');
  const system = [
    `You are the owner of this plan, a few years from now, after you already became: ${becoming}.`,
    'You plan one day for your past self. Be specific, evidence-based and short. No generic motivation.',
    `Propose ${DEFAULT_RULES.planMinTasks} to ${DEFAULT_RULES.planMaxTasks} tasks, only for the skills given.`,
    `Every task must be checkable by its skill's verifier: ${VERIFIER_HINTS}`,
    'Each task also has a two-minute version for a bad day. "when" is a time plus an anchor habit.',
  ].join('\n');
  const context = {
    day,
    weekday: WEEKDAYS[weekdayOf(day)],
    identities: roadmap.identities.map((i) => ({
      title: i.title,
      why: i.why,
      ...(i.deadline === undefined ? {} : { deadline: i.deadline }),
    })),
    skills: active.map((s) => ({
      id: s.id,
      name: s.name,
      rubric: s.rubric,
      verifier: s.verifier,
      nextMilestones: openMilestones(roadmap, s.id)
        .slice(0, MILESTONES_PER_SKILL)
        .map((m) => ({
          title: m.title,
          ...(m.targetDate === undefined ? {} : { targetDate: m.targetDate }),
        })),
    })),
  };
  return { system, prompt: `Plan this day:\n${JSON.stringify(context, null, 2)}` };
}

/** The AI's proposal as tasks, or null when the AI is unavailable or nothing usable came back. */
export async function aiTasks(
  ai: Ai,
  roadmap: Roadmap,
  day: DayKey,
  newId: () => string,
): Promise<TaskSpec[] | null> {
  const active = activeSkills(roadmap, day);
  const [first, ...rest] = active.map((s) => s.id);
  if (first === undefined) return null;
  const { system, prompt } = proposalPrompt(roadmap, day);
  const schemas = proposalSchema([first, ...rest]);
  const result = await ai.talkJson({
    system,
    prompt,
    schema: schemas.parse,
    guide: schemas.guide,
    importance: 'essential',
  });
  if (!result.ok) return null;
  const byId = new Map(active.map((s) => [s.id, s]));
  const tasks = result.value.tasks.flatMap((t): TaskSpec[] => {
    const skill = byId.get(t.skillId);
    if (skill === undefined) return [];
    return [
      {
        id: newId(),
        skillId: skill.id,
        when: t.when,
        verifier: skill.verifier,
        full: { title: t.title, criteria: t.criteria, seconds: t.minutes * 60 },
        twoMinute: {
          title: t.twoMinuteTitle,
          criteria: t.twoMinuteCriteria,
          seconds: TWO_MINUTE_SECONDS,
        },
      },
    ];
  });
  return tasks.length === 0 ? null : tasks;
}
