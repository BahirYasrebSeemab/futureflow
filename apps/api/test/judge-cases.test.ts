import { ReadingLogSchema } from '@futureflow/contracts';
import { describe, expect, it } from 'vitest';
import { JUDGE_CASES } from '../eval/judge-cases';
import { githubState, MAX_STATE_PATCH_CHARS } from '../src/verification/judge';

describe('the judge eval set', () => {
  it('has 50 cases with unique ids: 25 GitHub and 25 reading', () => {
    expect(JUDGE_CASES).toHaveLength(50);
    expect(new Set(JUDGE_CASES.map((c) => c.id)).size).toBe(50);
    expect(JUDGE_CASES.filter((c) => c.kind === 'github')).toHaveLength(25);
  });

  it('balances passes and fails within each kind', () => {
    for (const kind of ['github', 'reading'] as const) {
      const cases = JUDGE_CASES.filter((c) => c.kind === kind);
      const passes = cases.filter((c) => c.expected === 'pass').length;
      expect(passes).toBeGreaterThanOrEqual(10);
      expect(cases.length - passes).toBeGreaterThanOrEqual(10);
    }
  });

  it('holds evidence the production path accepts: valid logs, commits that fit the judge state', () => {
    for (const c of JUDGE_CASES) {
      expect(c.note.length).toBeGreaterThan(0);
      if (c.kind === 'reading') {
        for (const log of c.logs) expect(ReadingLogSchema.safeParse(log).success).toBe(true);
      } else {
        expect(c.commits.length).toBeGreaterThan(0);
        const state = githubState(c.task, c.commits);
        const patched = state.commits.flatMap((x) => x.files).filter((f) => 'patch' in f);
        expect(patched.length).toBe(c.commits.flatMap((x) => x.files).length);
        expect(JSON.stringify(state).length).toBeLessThan(MAX_STATE_PATCH_CHARS);
      }
    }
  });
});
