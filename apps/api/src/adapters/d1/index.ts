import type { Repos } from '../../ports';
import { d1Devices } from './devices';
import { d1Ledger } from './ledger';

export const d1Repos = (db: D1Database): Repos => ({
  devices: d1Devices(db),
  ledger: d1Ledger(db),
});
