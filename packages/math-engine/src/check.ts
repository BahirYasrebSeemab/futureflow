import type { Rational } from './rational';

export type Answer = Readonly<{ type: 'number'; value: Rational }>;
