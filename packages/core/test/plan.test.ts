import { describe, expect, it } from 'vitest';
import { createDraft, editDraft, lockPlan } from '../src/plan';
import { DEFAULT_RULES as R } from '../src/rules';
import { task } from './fixtures';

const three = [task('a'), task('b'), task('c')];

describe('plan lifecycle', () => {
  it('creates a draft', () => {
    expect(createDraft('2026-10-09', three)).toEqual({
      day: '2026-10-09',
      status: 'draft',
      tasks: three,
    });
  });

  it('edits a draft into a new object without touching the original', () => {
    const draft = createDraft('2026-10-09', three);
    const edited = editDraft(draft, [...three, task('d')]);
    expect(edited.ok && edited.value.tasks).toHaveLength(4);
    expect(draft.tasks).toHaveLength(3);
  });

  it('rejects duplicate task ids', () => {
    const draft = createDraft('2026-10-09', three);
    expect(editDraft(draft, [task('a'), task('a'), task('b')])).toEqual({
      ok: false,
      error: 'duplicate_task_id',
    });
  });

  it('locks a plan with 3 to 5 tasks', () => {
    const locked = lockPlan(createDraft('2026-10-09', three), 5_000, R);
    expect(locked).toEqual({
      ok: true,
      value: { day: '2026-10-09', status: 'locked', tasks: three, lockedAt: 5_000 },
    });
  });

  it('refuses to lock too few or too many tasks', () => {
    expect(lockPlan(createDraft('2026-10-09', [task('a'), task('b')]), 1, R)).toEqual({
      ok: false,
      error: 'too_few_tasks',
    });
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => task(id));
    expect(lockPlan(createDraft('2026-10-09', six), 1, R)).toEqual({
      ok: false,
      error: 'too_many_tasks',
    });
  });

  it('refuses to lock a plan with duplicate task ids', () => {
    const dup = createDraft('2026-10-09', [task('a'), task('a'), task('b')]);
    expect(lockPlan(dup, 1, R)).toEqual({ ok: false, error: 'duplicate_task_id' });
  });

  it('makes a locked plan immutable', () => {
    const locked = lockPlan(createDraft('2026-10-09', three), 1, R);
    if (!locked.ok) throw new Error('setup failed');
    expect(editDraft(locked.value, three)).toEqual({ ok: false, error: 'plan_locked' });
    expect(lockPlan(locked.value, 2, R)).toEqual({ ok: false, error: 'plan_locked' });
  });
});
