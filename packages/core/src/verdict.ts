import type { RequiredTask } from './day-types';
import type { TaskSpec, VerifierKind } from './plan';
import type { Rules } from './rules';

export type VerdictOutcome = 'pass' | 'fail' | 'pending';
export type VerdictSource = 'code' | 'judge' | 'coach' | 'owner';

export type Verdict = Readonly<{
  taskId: string;
  evidenceIds: readonly string[];
  outcome: VerdictOutcome;
  confidence: number;
  by: VerdictSource;
}>;

export type Decision = Readonly<{ pass: boolean; confidence: number }>;

/** Port implemented by GitHub, Math, Reading and Usage adapters (and future evidence packs). */
export interface Verifier<TEvidence> {
  readonly kind: VerifierKind;
  collect(sinceMs: number): Promise<readonly TEvidence[]>;
  judge(task: TaskSpec, evidence: readonly TEvidence[]): Promise<Verdict>;
}

const isValidConfidence = (c: number): boolean => Number.isFinite(c) && c >= 0 && c <= 1;

/** Automate when confident; otherwise escalate. Never silently pass or fail. */
export function resolveDecision(
  taskId: string,
  evidenceIds: readonly string[],
  decision: Decision,
  by: VerdictSource,
  rules: Rules,
): Verdict {
  const confident =
    isValidConfidence(decision.confidence) && decision.confidence >= rules.judgeConfidenceThreshold;
  const outcome: VerdictOutcome = !confident ? 'pending' : decision.pass ? 'pass' : 'fail';
  return { taskId, evidenceIds, outcome, confidence: decision.confidence, by };
}

export function allPassed(
  required: readonly RequiredTask[],
  verdicts: readonly Verdict[],
): boolean {
  if (required.length === 0) return false;
  const passed = new Set(verdicts.filter((v) => v.outcome === 'pass').map((v) => v.taskId));
  return required.every((r) => passed.has(r.taskId));
}
