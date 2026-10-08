import { ComputeEngine } from '@cortex-js/compute-engine';
import { equals, parseRational, toNumber, toText, type Rational } from './rational';

export type Answer =
  | Readonly<{ type: 'number'; value: Rational }>
  | Readonly<{ type: 'expression'; text: string; maxTerms?: number }>
  | Readonly<{ type: 'set'; items: readonly Rational[] }>
  | Readonly<{ type: 'point'; coords: readonly Rational[] }>
  | Readonly<{ type: 'choice'; options: readonly string[]; correctIndex: number }>;

/** `unreadable` means "ask again", never "wrong": malformed input must not cost rating. */
export type CheckOutcome = 'correct' | 'incorrect' | 'unreadable';

const RELATIVE_TOLERANCE = 1e-6;
const SAMPLE_POINTS = [0.7, -1.3, 2.1, 3.7, -0.4];
const VARIABLE_OFFSET = 0.37;
const MIN_COMPARABLE_SAMPLES = 3;

let engine: ComputeEngine | undefined;
const ce = (): ComputeEngine => (engine ??= new ComputeEngine());
type Expr = NonNullable<ReturnType<ComputeEngine['parse']>>;

const normalize = (text: string): string =>
  text.trim().replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');

const stripAssignment = (text: string): string => text.replace(/^[a-z]\s*=\s*/i, '');

const closeEnough = (a: number, b: number): boolean =>
  Math.abs(a - b) <= RELATIVE_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));

export const countTerms = (text: string): number =>
  text
    .replace(/\s+/g, '')
    .replace(/^[-+]/, '')
    .split(/[-+]/)
    .filter((term) => term !== '').length;

const splitList = (text: string): string[] =>
  normalize(text)
    .replace(/^[{([]|[})\]]$/g, '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');

function checkNumber(expected: Rational, given: string): CheckOutcome {
  const text = stripAssignment(normalize(given));
  const value = parseRational(text);
  if (value === null) return 'unreadable';
  if (text.includes('.')) {
    return closeEnough(toNumber(value), toNumber(expected)) ? 'correct' : 'incorrect';
  }
  return equals(value, expected) ? 'correct' : 'incorrect';
}

function evaluateAt(expr: Expr, variables: readonly string[], point: number): number {
  const values = Object.fromEntries(variables.map((v, i) => [v, point + i * VARIABLE_OFFSET]));
  return Number(expr.subs(values).N().re);
}

function sampleEqual(a: Expr, b: Expr): boolean {
  const variables = [...new Set([...a.unknowns, ...b.unknowns])].sort();
  let comparable = 0;
  for (const point of SAMPLE_POINTS) {
    const x = evaluateAt(a, variables, point);
    const y = evaluateAt(b, variables, point);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!closeEnough(x, y)) return false;
    comparable += 1;
  }
  return comparable >= MIN_COMPARABLE_SAMPLES;
}

function checkExpression(expected: string, given: string, maxTerms?: number): CheckOutcome {
  const text = normalize(given);
  if (text === '') return 'unreadable';
  const parsed = ce().parse(text);
  if (!parsed.isValid) return 'unreadable';
  if (maxTerms !== undefined && (text.includes('(') || countTerms(text) > maxTerms)) {
    return 'incorrect';
  }
  const target = ce().parse(expected);
  const identical = target.isIdenticallyEqual(parsed);
  if (identical !== undefined) return identical ? 'correct' : 'incorrect';
  return sampleEqual(target, parsed) ? 'correct' : 'incorrect';
}

function parseAll(parts: readonly string[]): Rational[] | null {
  const values = parts.map((part) => parseRational(stripAssignment(part)));
  return values.length === 0 || values.some((v) => v === null) ? null : (values as Rational[]);
}

function checkSet(expected: readonly Rational[], given: string): CheckOutcome {
  const values = parseAll(splitList(given));
  if (values === null) return 'unreadable';
  if (values.length !== expected.length) return 'incorrect';
  const remaining = [...values];
  for (const item of expected) {
    const index = remaining.findIndex((v) => equals(v, item));
    if (index < 0) return 'incorrect';
    remaining.splice(index, 1);
  }
  return 'correct';
}

function checkPoint(expected: readonly Rational[], given: string): CheckOutcome {
  const values = parseAll(splitList(given));
  if (values === null) return 'unreadable';
  if (values.length !== expected.length) return 'incorrect';
  return values.every((v, i) => equals(v, expected[i] as Rational)) ? 'correct' : 'incorrect';
}

function checkChoice(optionCount: number, correctIndex: number, given: string): CheckOutcome {
  const text = given.trim();
  const index = Number(text);
  if (text === '' || !Number.isInteger(index) || index < 0 || index >= optionCount) {
    return 'unreadable';
  }
  return index === correctIndex ? 'correct' : 'incorrect';
}

export function checkAnswer(expected: Answer, given: string): CheckOutcome {
  switch (expected.type) {
    case 'number':
      return checkNumber(expected.value, given);
    case 'expression':
      return checkExpression(expected.text, given, expected.maxTerms);
    case 'set':
      return checkSet(expected.items, given);
    case 'point':
      return checkPoint(expected.coords, given);
    case 'choice':
      return checkChoice(expected.options.length, expected.correctIndex, given);
  }
}

/** Canonical input that `checkAnswer` accepts (UI shows `options[correctIndex]` for choices). */
export function answerText(answer: Answer): string {
  switch (answer.type) {
    case 'number':
      return toText(answer.value);
    case 'expression':
      return answer.text;
    case 'set':
      return answer.items.map(toText).join(', ');
    case 'point':
      return `(${answer.coords.map(toText).join(', ')})`;
    case 'choice':
      return String(answer.correctIndex);
  }
}
