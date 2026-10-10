import type { Repos } from '../../ports';
import { d1Devices } from './devices';

export const d1Repos = (db: D1Database): Repos => ({ devices: d1Devices(db) });
