import { dayTotals, projectBalance } from '@/lib/ledger';
import { ledgerEvent } from './support/fakes';

test('the balance counts confirmed and pending events once each', () => {
  const grant = ledgerEvent(1, { kind: 'base_grant', seconds: 1800 });
  const spend = ledgerEvent(2); // -60
  expect(projectBalance([grant, spend], [spend, ledgerEvent(3)])).toBe(1800 - 60 - 60);
  expect(projectBalance([], [])).toBe(0);
});

test('a base grant written by both phone and server counts once', () => {
  const server = ledgerEvent(1, { kind: 'base_grant', seconds: 900 });
  const phone = ledgerEvent(2, { kind: 'base_grant', seconds: 900 });
  expect(projectBalance([server], [phone])).toBe(900);
});

test('a repayment whose reward was dropped as a duplicate is dropped too', () => {
  const reward = ledgerEvent(1, { kind: 'task_reward', seconds: 600, refId: 'task-1' });
  const again = ledgerEvent(2, { kind: 'task_reward', seconds: 600, refId: 'task-1' });
  const repay = ledgerEvent(3, { kind: 'borrow_repay', seconds: -300, refId: again.id });
  expect(projectBalance([reward], [again, repay])).toBe(600);
});

test('dayTotals splits work from the free allowance for one day', () => {
  const events = [
    ledgerEvent(1, { kind: 'base_grant', seconds: 900 }),
    ledgerEvent(2, { kind: 'task_reward', seconds: 1800, refId: 't1' }),
    ledgerEvent(3, { kind: 'all_done_bonus', seconds: 900 }),
    ledgerEvent(4, { kind: 'math_reward', seconds: 180, refId: 'a1' }),
    ledgerEvent(5),
    ledgerEvent(6, { kind: 'task_reward', seconds: 600, refId: 't9', day: '2026-10-13' }),
  ];
  expect(dayTotals(events.slice(0, 3), events.slice(3), '2026-10-14')).toEqual({
    earned: 1800 + 900 + 180,
    allowance: 900,
  });
});
