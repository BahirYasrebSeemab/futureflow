import type { Roadmap } from '@mflow/contracts';
import type { Deps } from '../env';
import type { CoachMessage } from '../ports';

export const RECENT_DAYS = 7;
export const RECENT_MESSAGES = 10;

/** Spec §9.2: genuine distress overrides the persona. Kept verbatim in every coach prompt. */
export const DISTRESS_GUARDRAIL =
  'If a message suggests genuine distress (hopelessness, self-harm, crisis), drop the coaching persona ' +
  'completely: answer plainly, warmly and supportively, do not mention tasks or time, encourage them ' +
  'to reach out to someone they trust, and if they may be in danger, to contact local emergency services.';

/** Spec §9.2: "you, a few years from now, who already became it", built from the owner's own words. */
export function coachSystem(roadmap: Roadmap): string {
  const identities = roadmap.identities
    .map((i) => `- ${i.title}: ${i.why}${i.deadline === undefined ? '' : ` (by ${i.deadline})`}`)
    .join('\n');
  return [
    'You are the owner, a few years from now, after you already became:',
    identities,
    'Speak as that future self to your past self.',
    'Rules: be specific and evidence-based, refer to the facts given, keep it short (at most 120 words).',
    'No generic motivation. Never do arithmetic for math practice: the app checks math itself.',
    DISTRESS_GUARDRAIL,
  ].join('\n');
}

export type CoachFacts = Readonly<{
  day: string;
  tasks: readonly Readonly<{ title: string; outcome: string }>[];
  earnedMinutes: number;
  spentMinutes: number;
}>;

/** Only what the coach needs: no location, tokens or device data. */
export async function todayFacts(deps: Deps, day: string): Promise<CoachFacts> {
  const [plan, verdicts, events] = await Promise.all([
    deps.repos.plans.get(day),
    deps.repos.verification.verdictsForDay(day),
    deps.repos.ledger.forDay(day),
  ]);
  const outcome = new Map(verdicts.map((v) => [v.taskId, v.outcome]));
  const minutes = (kinds: readonly string[]) =>
    Math.round(
      Math.abs(events.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.seconds, 0)) /
        60,
    );
  return {
    day,
    tasks: (plan?.tasks ?? []).map((t) => ({
      title: t.full.title,
      outcome: outcome.get(t.id) ?? 'not checked yet',
    })),
    earnedMinutes: minutes(['base_grant', 'task_reward', 'all_done_bonus', 'math_reward']),
    spentMinutes: minutes(['usage_spend']),
  };
}

export function coachPrompt(input: {
  summary: string | null;
  facts: CoachFacts;
  history: readonly CoachMessage[];
  message: string;
}): string {
  const lines = [
    `Last week, in short: ${input.summary ?? 'no summary yet.'}`,
    `Today (${input.facts.day}): earned ${input.facts.earnedMinutes} min, spent ${input.facts.spentMinutes} min.`,
    'Tasks:',
    ...(input.facts.tasks.length === 0
      ? ['- no plan locked']
      : input.facts.tasks.map((t) => `- ${t.title}: ${t.outcome}`)),
    '',
    'Recent conversation:',
    ...input.history.map((m) => `${m.role === 'owner' ? 'Me' : 'You'}: ${m.text}`),
    '',
    `Me: ${input.message}`,
    'You:',
  ];
  return lines.join('\n');
}
