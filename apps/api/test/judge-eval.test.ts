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
