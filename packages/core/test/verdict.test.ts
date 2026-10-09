import { describe, expect, it } from 'vitest';
import type { TaskSpec } from '../src/plan';
import { DEFAULT_RULES as R } from '../src/rules';
import { allPassed, resolveDecision, type Verdict, type Verifier } from '../src/verdict';
import { task } from './fixtures';

const verdict = (taskId: string, outcome: Verdict['outcome']): Verdict => ({
  taskId,
  evidenceIds: ['ev1'],
  outcome,
  confidence: 0.9,
  by: 'judge',
});

describe('resolveDecision', () => {
  it('passes or fails when confident', () => {
    expect(
      resolveDecision('t1', ['ev1'], { pass: true, confidence: 0.9 }, 'judge', R).outcome,
    ).toBe('pass');
    expect(
      resolveDecision('t1', ['ev1'], { pass: false, confidence: 0.9 }, 'judge', R).outcome,
    ).toBe('fail');
  });

  it.each([0.74, Number.NaN, -0.1, 1.2])('marks confidence %s as pending', (confidence) => {
    expect(resolveDecision('t1', ['ev1'], { pass: true, confidence }, 'judge', R).outcome).toBe(
      'pending',
    );
  });

  it('keeps the evidence trail', () => {
    const v = resolveDecision('t1', ['ev1', 'ev2'], { pass: true, confidence: 1 }, 'code', R);
    expect(v).toEqual({
      taskId: 't1',
      evidenceIds: ['ev1', 'ev2'],
      outcome: 'pass',
      confidence: 1,
      by: 'code',
    });
  });
});

describe('allPassed', () => {
  const required = [
    { taskId: 'a', version: task('a').full },
    { taskId: 'b', version: task('b').full },
  ];

  it('is false while any required task lacks a pass', () => {
    expect(allPassed(required, [verdict('a', 'pass'), verdict('b', 'pending')])).toBe(false);
  });

  it('is true once every required task has a pass, even if a later verdict failed', () => {
    const verdicts = [verdict('a', 'pass'), verdict('b', 'pass'), verdict('a', 'fail')];
    expect(allPassed(required, verdicts)).toBe(true);
  });

  it('is false when nothing is required', () => {
    expect(allPassed([], [verdict('a', 'pass')])).toBe(false);
  });
});

describe('Verifier port', () => {
  it('can be implemented by an adapter', async () => {
    const fake: Verifier<string> = {
      kind: 'reading',
      collect: async () => ['log-1'],
      judge: async (t: TaskSpec, evidence) =>
        resolveDecision(t.id, evidence, { pass: true, confidence: 0.8 }, 'judge', R),
    };
    const evidence = await fake.collect(0);
    expect((await fake.judge(task('r1'), evidence)).outcome).toBe('pass');
  });
});
