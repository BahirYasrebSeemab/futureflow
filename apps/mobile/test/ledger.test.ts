import { projectBalance } from '@/lib/ledger';
import { ledgerEvent } from './support/fakes';

test('the balance counts confirmed and pending events once each', () => {
  const grant = ledgerEvent(1, { kind: 'base_grant', seconds: 1800 });
  const spend = ledgerEvent(2); // -60
  expect(projectBalance([grant, spend], [spend, ledgerEvent(3)])).toBe(1800 - 60 - 60);
  expect(projectBalance([], [])).toBe(0);
});
