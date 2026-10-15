import { mathReward } from '@/lib/math/rewards';
import { ledgerEvent } from './support/fakes';

let n = 0;
const newId = () => `01920000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
const base = {
  confirmed: [],
  pending: [],
  day: '2026-10-14',
  currentDay: '2026-10-14',
  planLocked: true,
  attemptId: 'a1',
  answerType: 'typed' as const,
  at: 1,
  newId,
};

test('a typed correct answer pays 3 minutes', () => {
  const r = mathReward(base);
  expect(r).toMatchObject({ seconds: 180 });
  if (!('seconds' in r)) throw new Error('paid');
  expect(r.events).toEqual([
    expect.objectContaining({ kind: 'math_reward', seconds: 180, refId: 'a1', day: '2026-10-14' }),
  ]);
});

test('a choice answer pays half', () => {
  expect(mathReward({ ...base, answerType: 'choice' })).toMatchObject({ seconds: 90 });
});

test('plan not locked', () => {
  expect(mathReward({ ...base, planLocked: false })).toEqual({
    events: [],
    reason: 'plan_not_locked',
  });
});

test('cap reached: no zero-second event', () => {
  const full = Array.from({ length: 15 }, (_, i) =>
    ledgerEvent(100 + i, { kind: 'math_reward', seconds: 180, refId: `x${i}` }),
  );
  expect(mathReward({ ...base, confirmed: full })).toEqual({ events: [], reason: 'cap_reached' });
});

test('a partly used cap pays only what is left', () => {
  const most = Array.from({ length: 14 }, (_, i) =>
    ledgerEvent(200 + i, { kind: 'math_reward', seconds: 180, refId: `y${i}` }),
  );
  const extra = ledgerEvent(300, { kind: 'math_reward', seconds: 60, refId: 'z' });
  expect(mathReward({ ...base, confirmed: [...most, extra] })).toMatchObject({ seconds: 120 });
});

test('the same attempt is never paid twice', () => {
  const paid = ledgerEvent(1, { kind: 'math_reward', seconds: 180, refId: 'a1' });
  expect(mathReward({ ...base, pending: [paid] })).toEqual({
    events: [],
    reason: 'already_granted',
  });
});

test('a reward repays borrowed time first', () => {
  const borrow = ledgerEvent(2, { kind: 'unlock_borrow', seconds: 600 });
  const r = mathReward({ ...base, confirmed: [borrow] });
  if (!('seconds' in r)) throw new Error('paid');
  expect(r.events.map((e) => [e.kind, e.seconds])).toEqual([
    ['math_reward', 180],
    ['borrow_repay', -180],
  ]);
});

test('not the current day', () => {
  expect(mathReward({ ...base, day: '2026-10-13' })).toEqual({ events: [], reason: 'not_today' });
});

test('events of other days do not count toward the cap', () => {
  const yesterday = Array.from({ length: 15 }, (_, i) =>
    ledgerEvent(400 + i, { kind: 'math_reward', seconds: 180, refId: `w${i}`, day: '2026-10-13' }),
  );
  expect(mathReward({ ...base, confirmed: yesterday })).toMatchObject({ seconds: 180 });
});
