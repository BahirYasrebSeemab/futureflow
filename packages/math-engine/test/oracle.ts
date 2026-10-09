import { ComputeEngine } from '@cortex-js/compute-engine';
import fc from 'fast-check';
import { DIFFICULTIES } from '../src/types';

const ce = new ComputeEngine();

/** The math part of a prompt, rewritten for the CAS ("Calculate: 3 × 4²" → "3 * 4^2"). */
export const promptMath = (prompt: string): string =>
  prompt
    .slice(prompt.indexOf(': ') + 2)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/²/g, '^2');

/** Numeric value of a CAS-parseable expression, optionally substituting variables. */
export const evaluate = (text: string, values: Record<string, number> = {}): number =>
  Number(ce.parse(text).subs(values).N().re);

export const identicallyEqual = (a: string, b: string): boolean | undefined =>
  ce.parse(a).isIdenticallyEqual(ce.parse(b));

export const seedAndDifficulty = fc.tuple(
  fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  fc.constantFrom(...DIFFICULTIES),
);

export const RUNS = { numRuns: 200 };
