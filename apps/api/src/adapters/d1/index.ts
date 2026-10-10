import type { Repos } from '../../ports';
import { d1Devices } from './devices';
import { d1Ledger } from './ledger';
import { d1Plans } from './plans';

export const d1Repos = (db: D1Database): Repos => ({
  devices: d1Devices(db),
  ledger: d1Ledger(db),
  plans: d1Plans(db),
});
