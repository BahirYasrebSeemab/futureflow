import { DEFAULT_RULES } from '@futureflow/core';
import { finishUnlock, startWait, waitLeftMs } from '@/lib/unlock';
import { ledgerEvent } from './support/fakes';

const REASON = 'my sister needs the group chat';
const MIN = 60_000;
const ctx = (at: number) => ({ day: '2026-10-18', at, newId: () => 'unlock-1' });

test('a wait remembers the reason and both clocks', () => {
  expect(startWait(`  ${REASON} `, { elapsed: 5_000, bootId: '7' }, 1_000_000)).toEqual({
    reason: REASON,
    startedAt: 1_000_000,
    startElapsed: 5_000,
    bootId: '7',
  });
});

test('the wait counts down on the monotonic clock only', () => {
  const wait = startWait(REASON, { elapsed: 0, bootId: '7' }, 0);
  expect(waitLeftMs(wait, { elapsed: 4 * MIN, bootId: '7' }, DEFAULT_RULES)).toBe(6 * MIN);
  expect(waitLeftMs(wait, { elapsed: 11 * MIN, bootId: '7' }, DEFAULT_RULES)).toBe(0);
});

test('a reboot, or a monotonic clock behind the start, starts the wait again', () => {
  const wait = startWait(REASON, { elapsed: 5 * MIN, bootId: '7' }, 0);
  expect(waitLeftMs(wait, { elapsed: 99 * MIN, bootId: '8' }, DEFAULT_RULES)).toBe('restart');
  expect(waitLeftMs(wait, { elapsed: MIN, bootId: '7' }, DEFAULT_RULES)).toBe('restart');
});

test('after the wait the unlock is a 10-minute unlock_borrow with the reason', () => {
  const wait = startWait(REASON, { elapsed: 0, bootId: '7' }, 0);
  expect(
    finishUnlock([], wait, { elapsed: 10 * MIN, bootId: '7' }, ctx(50 * MIN), DEFAULT_RULES),
  ).toEqual({
    ok: true,
    value: {
      id: 'unlock-1',
      day: '2026-10-18',
      at: 50 * MIN,
      kind: 'unlock_borrow',
      seconds: 600,
      reason: REASON,
    },
  });
});

test('moving the wall clock forward does not finish the wait', () => {
  const wait = startWait(REASON, { elapsed: 0, bootId: '7' }, 0);
  const result = finishUnlock(
    [],
    wait,
    { elapsed: MIN, bootId: '7' },
    ctx(500 * MIN),
    DEFAULT_RULES,
  );
  expect(result).toEqual({ ok: false, error: 'wait_not_finished' });
});

test('a rebooted wait cannot unlock', () => {
  const wait = startWait(REASON, { elapsed: 0, bootId: '7' }, 0);
  const result = finishUnlock(
    [],
    wait,
    { elapsed: 20 * MIN, bootId: '8' },
    ctx(50 * MIN),
    DEFAULT_RULES,
  );
  expect(result).toEqual({ ok: false, error: 'wait_restarted' });
});

test('the third unlock of a day is refused', () => {
  const wait = startWait(REASON, { elapsed: 0, bootId: '7' }, 0);
  const day = [1, 2].map((n) => ({
    ...ledgerEvent(n),
    kind: 'unlock_borrow' as const,
    seconds: 600,
  }));
  const result = finishUnlock(
    day,
    wait,
    { elapsed: 10 * MIN, bootId: '7' },
    ctx(50 * MIN),
    DEFAULT_RULES,
  );
  expect(result).toEqual({ ok: false, error: 'daily_limit_reached' });
});
