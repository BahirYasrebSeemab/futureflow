import { describe, expect, it } from 'vitest';
import { gate, report, scoreCase, summarize, type CaseResult } from '../src/verification/eval';

const T = 0.75;

describe('scoreCase', () => {
  it('a right, confident answer is correct and would be decided alone', () => {
    expect(scoreCase('pass', { pass: true, confidence: 0.9 }, T)).toEqual({
      outcome: 'correct',
      auto: true,
    });
  });

  it('a wrong pass is a false pass, a wrong fail a false fail', () => {
    expect(scoreCase('fail', { pass: true, confidence: 0.6 }, T)).toEqual({
      outcome: 'false_pass',
      auto: false,
    });
    expect(scoreCase('pass', { pass: false, confidence: 0.8 }, T)).toEqual({
      outcome: 'false_fail',
      auto: true,
    });
  });

  it('no answer is unavailable, not wrong', () => {
    expect(scoreCase('pass', null, T)).toEqual({ outcome: 'unavailable', auto: false });
  });
});

const result = (id: string, outcome: CaseResult['outcome'], auto: boolean): CaseResult => ({
  id,
  kind: 'github',
  expected: 'pass',
  decision: outcome === 'unavailable' ? null : { pass: true, confidence: auto ? 0.9 : 0.6 },
  outcome,
  auto,
});

describe('summarize and gate', () => {
  it('counts accuracy over judged cases and auto accuracy over auto-decided ones', () => {
    const results = [
      result('a', 'correct', true),
      result('b', 'correct', true),
      result('c', 'false_pass', false),
      result('d', 'false_fail', true),
      result('e', 'unavailable', false),
    ];
    expect(summarize(results)).toEqual({
      total: 5,
      judged: 4,
      unavailable: 1,
      correct: 2,
      accuracy: 0.5,
      autoDecided: 3,
      autoCoverage: 0.75,
      autoCorrect: 2,
      autoAccuracy: 2 / 3,
      falsePasses: 1,
      autoFalsePasses: 0,
    });
  });

  it('allows auto-decide only with enough cases, 95% auto accuracy and no auto false pass', () => {
    const many = (n: number, outcome: CaseResult['outcome'], auto = true) =>
      Array.from({ length: n }, (_, i) => result(`${outcome}-${i}`, outcome, auto));
    expect(gate(summarize(many(40, 'correct'))).allowed).toBe(true);
    // 39 unsure verdicts and one confident one are no evidence for deciding alone.
    expect(gate(summarize([...many(39, 'correct', false), ...many(1, 'correct')])).allowed).toBe(
      false,
    );
    expect(gate(summarize(many(39, 'correct'))).allowed).toBe(false);
    expect(gate(summarize([...many(40, 'correct'), ...many(1, 'false_pass')])).allowed).toBe(false);
    expect(gate(summarize([...many(38, 'correct'), ...many(3, 'false_fail')])).allowed).toBe(false);
    expect(gate(summarize([...many(40, 'correct'), ...many(5, 'false_pass', false)])).allowed).toBe(
      true,
    );
  });
});

describe('report', () => {
  it('states the verdict and lists every case without evidence text', () => {
    const results = [result('gh-1', 'correct', true), result('rd-2', 'unavailable', false)];
    const text = report(summarize(results), results);
    expect(text).toContain('| gh-1 | github | pass | pass (0.90) | correct | yes |');
    expect(text).toContain('| rd-2 | github | pass | no answer | unavailable | no |');
    expect(text).toMatch(/Auto-decide: \*\*keep off\*\*/);
  });
});

describe('per kind', () => {
  it('a kind with too few confident verdicts or a confident false pass keeps the gate shut', () => {
    const reading = (id: string, outcome: CaseResult['outcome']): CaseResult => ({
      ...result(id, outcome, true),
      kind: 'reading',
    });
    const github = Array.from({ length: 35 }, (_, i) => result(`g${i}`, 'correct', true));
    const fine = Array.from({ length: 15 }, (_, i) => reading(`r${i}`, 'correct'));
    expect(gate(summarize([...github, ...fine]), [...github, ...fine]).allowed).toBe(true);
    const badReading = [...fine.slice(1), reading('r-bad', 'false_pass')];
    const verdict = gate(summarize([...github, ...badReading]), [...github, ...badReading]);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/reading/);
  });

  it('the report shows each kind on its own line', () => {
    const results = [
      result('gh-1', 'correct', true),
      { ...result('rd-1', 'false_fail', true), kind: 'reading' as const },
    ];
    const text = report(summarize(results), results);
    expect(text).toMatch(/\| github \| 1 \| 100\.0% \|/);
    expect(text).toMatch(/\| reading \| 1 \| 0\.0% \|/);
  });
});
