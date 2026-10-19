import type { Decision } from '@futureflow/core';

/**
 * Scoring for the judge eval (spec §14): how the production judge does on labelled cases, and
 * whether its confident verdicts may decide tasks alone (`JUDGE_AUTO_DECIDE`).
 */

export type Expected = 'pass' | 'fail';
export type Outcome = 'correct' | 'false_pass' | 'false_fail' | 'unavailable';

export type CaseResult = Readonly<{
  id: string;
  kind: 'github' | 'reading';
  expected: Expected;
  /** Null when no provider answered. */
  decision: Decision | null;
  outcome: Outcome;
  /** Confident enough that production would decide it without asking the owner. */
  auto: boolean;
}>;

export function scoreCase(
  expected: Expected,
  decision: Decision | null,
  threshold: number,
): { outcome: Outcome; auto: boolean } {
  if (decision === null) return { outcome: 'unavailable', auto: false };
  const auto = decision.confidence >= threshold;
  const right = decision.pass === (expected === 'pass');
  return { outcome: right ? 'correct' : decision.pass ? 'false_pass' : 'false_fail', auto };
}

export type EvalSummary = Readonly<{
  total: number;
  judged: number;
  unavailable: number;
  correct: number;
  accuracy: number;
  autoDecided: number;
  /** Share of judged cases decided without asking. */
  autoCoverage: number;
  autoCorrect: number;
  autoAccuracy: number;
  falsePasses: number;
  autoFalsePasses: number;
}>;

const ratio = (n: number, of: number) => (of === 0 ? 0 : n / of);

export function summarize(results: readonly CaseResult[]): EvalSummary {
  const judged = results.filter((r) => r.outcome !== 'unavailable');
  const auto = judged.filter((r) => r.auto);
  const correct = judged.filter((r) => r.outcome === 'correct').length;
  const autoCorrect = auto.filter((r) => r.outcome === 'correct').length;
  return {
    total: results.length,
    judged: judged.length,
    unavailable: results.length - judged.length,
    correct,
    accuracy: ratio(correct, judged.length),
    autoDecided: auto.length,
    autoCoverage: ratio(auto.length, judged.length),
    autoCorrect,
    autoAccuracy: ratio(autoCorrect, auto.length),
    falsePasses: judged.filter((r) => r.outcome === 'false_pass').length,
    autoFalsePasses: auto.filter((r) => r.outcome === 'false_pass').length,
  };
}

/** The bar for letting the judge decide alone: enough cases, right when sure, never paying wrongly. */
export const GATE = { minJudged: 40, minAutoAccuracy: 0.95, maxAutoFalsePasses: 0 } as const;

export function gate(summary: EvalSummary): { allowed: boolean; reasons: string[] } {
  const reasons = [
    ...(summary.judged < GATE.minJudged ? [`only ${summary.judged} cases judged`] : []),
    ...(summary.autoDecided === 0 ? ['no case was confident enough to decide alone'] : []),
    ...(summary.autoAccuracy < GATE.minAutoAccuracy
      ? [`auto accuracy ${pct(summary.autoAccuracy)} is under ${pct(GATE.minAutoAccuracy)}`]
      : []),
    ...(summary.autoFalsePasses > GATE.maxAutoFalsePasses
      ? [`${summary.autoFalsePasses} confident false pass(es)`]
      : []),
  ];
  return { allowed: reasons.length === 0, reasons };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const decided = (d: Decision | null) =>
  d === null ? 'no answer' : `${d.pass ? 'pass' : 'fail'} (${d.confidence.toFixed(2)})`;

/** A Markdown report: the verdict, the metrics, and one row per case (ids only, no evidence). */
export function report(summary: EvalSummary, results: readonly CaseResult[]): string {
  const verdict = gate(summary);
  return [
    '# Judge eval',
    '',
    `Auto-decide: **${verdict.allowed ? 'may be turned on' : 'keep off'}**` +
      (verdict.reasons.length > 0 ? ` (${verdict.reasons.join('; ')})` : ''),
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Cases | ${summary.total} (${summary.unavailable} without an answer) |`,
    `| Accuracy | ${pct(summary.accuracy)} (${summary.correct}/${summary.judged}) |`,
    `| Decided alone (confidence ≥ threshold) | ${pct(summary.autoCoverage)} (${summary.autoDecided}) |`,
    `| Accuracy when decided alone | ${pct(summary.autoAccuracy)} (${summary.autoCorrect}/${summary.autoDecided}) |`,
    `| False passes | ${summary.falsePasses} (${summary.autoFalsePasses} decided alone) |`,
    '',
    '| Case | Kind | Expected | Judge | Outcome | Alone |',
    '| --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.kind} | ${r.expected} | ${decided(r.decision)} | ${r.outcome} | ${r.auto ? 'yes' : 'no'} |`,
    ),
    '',
  ].join('\n');
}
