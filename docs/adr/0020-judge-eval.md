# 0020. The judge eval and the auto-decide gate

- Status: accepted (method); result pending the owner's first run
- Date: 2026-10-19

## Context

GitHub and reading tasks are judged by an AI (`judge()`: Jev, Gemini as fallback). Until now every
verdict waits for the owner's confirmation (`JUDGE_AUTO_DECIDE` off), because a judge that pays out
for work not done breaks the whole bargain. The spec asks for a measured accuracy, recorded in an
ADR, before verdicts may decide alone (§14).

## Decision

- **An eval set of 50 cases** (`apps/api/eval/judge-cases.ts`): 25 GitHub (task, criteria and
  commits with patches) and 25 reading logs, each labelled pass or fail from the task's criteria
  alone, with a note saying why. Clear passes, clear fails and near misses: a linear scan named
  `binarySearch`, a workflow that never runs the tests, a "move" that changes behaviour, one test of
  three asked for, filler notes that sound busy and say nothing.
- **The production path, unchanged:** the runner (`bun run judge:eval`) calls `judgeGithub` and
  `judgeReading`, with the router built by `aiFromEnv`. Only the daily limits are raised for the run.
- **Scoring** (`src/verification/eval.ts`, tested): each case is correct, a false pass, a false fail,
  or unavailable (no provider answered: not counted as wrong). A verdict "decides alone" when its
  confidence is at least the production threshold (0.75).
- **The gate:** auto-decide may be turned on only when at least 40 cases were judged, verdicts that
  decide alone are right at least 95% of the time, and **none of them is a false pass**. A
  low-confidence verdict still goes to the owner, so false fails and uncertain cases only cost a tap.
- The report (`docs/judge-eval/report.md`) lists case ids, labels, verdicts and metrics, never the
  evidence or the keys.

## Consequences

- The labels are Claude's, written to be checkable from the criteria; the owner should skim the
  notes and correct any label they disagree with before trusting the gate.
- 50 cases measure the judge roughly; one wrong confident pass already keeps it off.
- Re-run after a model or prompt change.

## Result

_To fill in after the first run: date, providers, accuracy, coverage, auto accuracy, false passes,
and whether `JUDGE_AUTO_DECIDE` was turned on._
