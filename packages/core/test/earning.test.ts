import { describe, expect, it } from 'vitest';
import { earn, type EarnState } from '../src/earning';
import { DEFAULT_RULES as R } from '../src/rules';
import { ctx, ev } from './fixtures';

const locked: EarnState = { planLocked: true, outstandingBorrow: 0 };
const unlocked: EarnState = { planLocked: false, outstandingBorrow: 0 };

describe('earn: base grant', () => {
  it('grants the base allowance once per day, even without a locked plan', () => {
    const r = earn([], { kind: 'base_grant' }, ctx(), R, unlocked);
    expect(r).toEqual({
      ok: true,
      value: [{ id: 'new-1', day: '2026-10-08', at: 1_000, kind: 'base_grant', seconds: 900 }],
    });
  });

  it('refuses a second base grant', () => {
    const day = [ev({ kind: 'base_grant', seconds: 900 })];
    expect(earn(day, { kind: 'base_grant' }, ctx(), R, locked)).toEqual({
      ok: false,
      error: 'already_granted',
    });
  });

  it('never uses the base grant to repay borrowed time', () => {
    const r = earn([], { kind: 'base_grant' }, ctx(), R, {
      planLocked: false,
      outstandingBorrow: 600,
    });
    expect(r.ok && r.value).toHaveLength(1);
  });
});

describe('earn: task reward', () => {
  it('requires a locked plan', () => {
    const r = earn([], { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, unlocked);
    expect(r).toEqual({ ok: false, error: 'plan_not_locked' });
  });

  it('pays the task value with the task id as refId', () => {
    const r = earn([], { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, locked);
    expect(r.ok && r.value[0]).toMatchObject({ kind: 'task_reward', seconds: 1200, refId: 't1' });
  });

  it('pays a task only once', () => {
    const day = [ev({ kind: 'task_reward', seconds: 1200, refId: 't1' })];
    const r = earn(day, { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, locked);
    expect(r).toEqual({ ok: false, error: 'already_granted' });
  });

  it.each([0, -5, 1.5, Number.NaN])('rejects invalid amount %s', (seconds) => {
    const r = earn([], { kind: 'task_reward', taskId: 't1', seconds }, ctx(), R, locked);
    expect(r).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('clips to what is left of the daily cap', () => {
    const day = [ev({ kind: 'task_reward', seconds: 7000, refId: 'big' })];
    const r = earn(day, { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, locked);
    expect(r.ok && r.value[0]?.seconds).toBe(200);
  });

  it('records a zero-second event once the cap is reached', () => {
    const day = [ev({ kind: 'task_reward', seconds: 7200, refId: 'big' })];
    const r = earn(day, { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, locked);
    expect(r.ok && r.value).toEqual([
      { id: 'new-1', day: '2026-10-08', at: 1_000, kind: 'task_reward', seconds: 0, refId: 't1' },
    ]);
  });
});

describe('earn: borrowed time', () => {
  it('repays outstanding borrow from the reward first', () => {
    const r = earn([], { kind: 'task_reward', taskId: 't1', seconds: 1200 }, ctx(), R, {
      planLocked: true,
      outstandingBorrow: 600,
    });
    expect(r.ok && r.value).toEqual([
      {
        id: 'new-1',
        day: '2026-10-08',
        at: 1_000,
        kind: 'task_reward',
        seconds: 1200,
        refId: 't1',
      },
      {
        id: 'new-2',
        day: '2026-10-08',
        at: 1_000,
        kind: 'borrow_repay',
        seconds: -600,
        refId: 'new-1',
      },
    ]);
  });

  it('repays at most the reward amount', () => {
    const r = earn([], { kind: 'task_reward', taskId: 't1', seconds: 300 }, ctx(), R, {
      planLocked: true,
      outstandingBorrow: 600,
    });
    expect(r.ok && r.value[1]?.seconds).toBe(-300);
  });
});

describe('earn: math reward', () => {
  it('pays full reward for typed answers and half for multiple choice', () => {
    const typed = earn(
      [],
      { kind: 'math_reward', attemptId: 'a1', answerType: 'typed' },
      ctx(),
      R,
      locked,
    );
    const choice = earn(
      [],
      { kind: 'math_reward', attemptId: 'a2', answerType: 'choice' },
      ctx(),
      R,
      locked,
    );
    expect(typed.ok && typed.value[0]?.seconds).toBe(180);
    expect(choice.ok && choice.value[0]?.seconds).toBe(90);
  });

  it('respects the math cap and the daily cap together', () => {
    const day = [
      ev({ kind: 'math_reward', seconds: 2650, refId: 'old' }),
      ev({ kind: 'task_reward', seconds: 4450, refId: 'big' }),
    ];
    const r = earn(
      day,
      { kind: 'math_reward', attemptId: 'a1', answerType: 'typed' },
      ctx(),
      R,
      locked,
    );
    expect(r.ok && r.value[0]?.seconds).toBe(50);
  });

  it('pays an attempt only once', () => {
    const day = [ev({ kind: 'math_reward', seconds: 180, refId: 'a1' })];
    const r = earn(
      day,
      { kind: 'math_reward', attemptId: 'a1', answerType: 'typed' },
      ctx(),
      R,
      locked,
    );
    expect(r).toEqual({ ok: false, error: 'already_granted' });
  });
});

describe('earn: all-done bonus', () => {
  it('pays once per day', () => {
    const first = earn([], { kind: 'all_done_bonus' }, ctx(), R, locked);
    expect(first.ok && first.value[0]?.seconds).toBe(900);
    const day = [ev({ kind: 'all_done_bonus', seconds: 900 })];
    expect(earn(day, { kind: 'all_done_bonus' }, ctx(), R, locked)).toEqual({
      ok: false,
      error: 'already_granted',
    });
  });
});
