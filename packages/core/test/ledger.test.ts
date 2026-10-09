import { describe, expect, it } from 'vitest';
import {
  balance,
  earnedSeconds,
  eventsForDay,
  mergeEvents,
  outstandingBorrowSeconds,
  sumKind,
} from '../src/ledger';
import { DEFAULT_RULES } from '../src/rules';
import { ev } from './fixtures';

describe('balance', () => {
  it('is zero for no events', () => {
    expect(balance([])).toBe(0);
  });

  it('sums signed seconds', () => {
    const events = [
      ev({ kind: 'base_grant', seconds: 900 }),
      ev({ kind: 'usage_spend', seconds: -300 }),
      ev({ kind: 'task_reward', seconds: 1200 }),
    ];
    expect(balance(events)).toBe(1800);
  });
});

describe('eventsForDay / earnedSeconds / sumKind', () => {
  const events = [
    ev({ kind: 'base_grant', seconds: 900, day: '2026-10-07' }),
    ev({ kind: 'base_grant', seconds: 900 }),
    ev({ kind: 'math_reward', seconds: 180 }),
    ev({ kind: 'usage_spend', seconds: -60 }),
    ev({ kind: 'unlock_borrow', seconds: 600 }),
  ];

  it('filters by day', () => {
    expect(eventsForDay(events, '2026-10-08')).toHaveLength(4);
  });

  it('counts only earning kinds as earned', () => {
    expect(earnedSeconds(eventsForDay(events, '2026-10-08'))).toBe(1080);
  });

  it('sums one kind', () => {
    expect(sumKind(events, 'base_grant')).toBe(1800);
  });
});

describe('outstandingBorrowSeconds', () => {
  it('is borrowed minus repaid', () => {
    const events = [
      ev({ kind: 'unlock_borrow', seconds: 600 }),
      ev({ kind: 'borrow_repay', seconds: -200 }),
    ];
    expect(outstandingBorrowSeconds(events)).toBe(400);
  });

  it('never goes below zero', () => {
    const events = [
      ev({ kind: 'unlock_borrow', seconds: 600 }),
      ev({ kind: 'borrow_repay', seconds: -900 }),
    ];
    expect(outstandingBorrowSeconds(events)).toBe(0);
  });
});

describe('mergeEvents', () => {
  it('ignores events whose id already exists, including duplicates inside the batch', () => {
    const a = ev({ id: 'a', kind: 'base_grant', seconds: 900 });
    const b = ev({ id: 'b', kind: 'usage_spend', seconds: -60 });
    const existing = Object.freeze([a]);
    const incoming = Object.freeze([a, b, b]);

    const result = mergeEvents(existing, incoming);

    expect(result.events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(result.added.map((e) => e.id)).toEqual(['b']);
    expect(existing).toHaveLength(1);
  });

  it('keeps one base grant per day even when phone and server each created one', () => {
    const phone = ev({ id: 'phone', kind: 'base_grant', seconds: 900 });
    const server = ev({ id: 'server', kind: 'base_grant', seconds: 900 });
    const nextDay = ev({ id: 'next', kind: 'base_grant', seconds: 900, day: '2026-10-09' });

    const result = mergeEvents([phone], [server, nextDay]);

    expect(result.events.map((e) => e.id)).toEqual(['phone', 'next']);
  });

  it.each(['all_done_bonus', 'expire'] as const)('keeps one %s per day', (kind) => {
    const first = ev({ id: 'x1', kind, seconds: kind === 'expire' ? -60 : 900 });
    const second = ev({ id: 'x2', kind, seconds: kind === 'expire' ? -60 : 900 });
    expect(mergeEvents([first], [second]).added).toEqual([]);
  });

  it('pays a task or math attempt once across writers, and drops the duplicate repayment', () => {
    const existing = [ev({ id: 'r1', kind: 'task_reward', seconds: 1200, refId: 't1' })];
    const incoming = [
      ev({ id: 'r2', kind: 'task_reward', seconds: 1200, refId: 't1' }),
      ev({ id: 'p2', kind: 'borrow_repay', seconds: -600, refId: 'r2' }),
      ev({ id: 'm1', kind: 'math_reward', seconds: 180, refId: 'a1' }),
      ev({ id: 'm2', kind: 'math_reward', seconds: 180, refId: 'a1' }),
    ];

    expect(mergeEvents(existing, incoming).added.map((e) => e.id)).toEqual(['m1']);
  });
});

describe('DEFAULT_RULES', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_RULES)).toBe(true);
  });
});
