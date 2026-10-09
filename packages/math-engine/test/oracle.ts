import { ComputeEngine } from '@cortex-js/compute-engine';
import fc from 'fast-check';
import type { Answer } from '../src/check';
import { toNumber } from '../src/rational';
import { DIFFICULTIES } from '../src/types';

const ce = new ComputeEngine();

/** The math part of a prompt, rewritten for the CAS ("Calculate: 3³ + √49" → "3^3 + \\sqrt{49}"). */
export const promptMath = (prompt: string): string =>
  prompt
    .slice(prompt.indexOf(': ') + 2)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁰/g, '^0')
    .replace(/√(\d+)/g, '\\sqrt{$1}');

/** Numeric value of a CAS-parseable expression, optionally substituting variables. */
export const evaluate = (text: string, values: Record<string, number> = {}): number =>
  Number(
    ce
      .parse(text.replace(/\^(-?\d+(?:\.\d+)?)/g, '^{$1}'))
      .subs(values)
      .N().re,
  );

const braced = (text: string): string => text.replace(/\^(-?\d+(?:\.\d+)?)/g, '^{$1}');

export const identicallyEqual = (a: string, b: string): boolean | undefined =>
  ce.parse(braced(a)).isIdenticallyEqual(ce.parse(braced(b)));

export const seedAndDifficulty = fc.tuple(
  fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  fc.constantFrom(...DIFFICULTIES),
);

export const RUNS = { numRuns: 200 };

/** The numeric value of a number answer; throws for any other answer type. */
export const numberAnswer = (answer: Answer): number => {
  if (answer.type !== 'number') throw new Error(`expected a number answer, got ${answer.type}`);
  return toNumber(answer.value);
};
