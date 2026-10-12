import type { Repos } from '../../ports';
import { d1AiUsage } from './ai-usage';
import { d1Days } from './days';
import { d1Devices } from './devices';
import { d1Ledger } from './ledger';
import { d1Plans } from './plans';
import { d1Roadmap } from './roadmap';
import { d1Telemetry } from './telemetry';

export const d1Repos = (db: D1Database): Repos => ({
  devices: d1Devices(db),
  ledger: d1Ledger(db),
  plans: d1Plans(db),
  days: d1Days(db),
  telemetry: d1Telemetry(db),
  roadmap: d1Roadmap(db),
  aiUsage: d1AiUsage(db),
});
