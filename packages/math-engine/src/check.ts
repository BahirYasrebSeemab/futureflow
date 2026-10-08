import { ComputeEngine } from '@cortex-js/compute-engine';
import { equals, parseRational, toNumber, toText, type Rational } from './rational';

export type Answer =
  | Readonly<{ type: 'number'; value: Rational; unit?: 'percent' }>
  | Readonly<{ type: 'expression'; text: string; maxTerms?: number; form?: 'monomial' }>
  | Readonly<{ type: 'set'; items: readonly Rational[] }>
  | Readonly<{ type: 'point'; coords: readonly Rational[] }>
  | Readonly<{ type: 'choice'; options: readonly string[]; correctIndex: number }>
  | Readonly<{ type: 'inequality'; variable: string; op: InequalityOp; bound: Rational }>;

export type InequalityOp = '<' | '≤' | '>' | '≥';

/** `unreadable` means "ask again", never "wrong": malformed input must not cost rating. */
export type CheckOutcome = 'correct' | 'incorrect' | 'unreadable';

const RELATIVE_TOLERANCE = 1e-6;
const SAMPLE_POINTS = [0.7, -1.3, 2.1, 3.7, -0.4];
const VARIABLE_OFFSET = 0.37;
const MIN_COMPARABLE_SAMPLES = 3;

let engine: ComputeEngine | undefined;
const ce = (): ComputeEngine => (engine ??= new ComputeEngine());
type Expr = NonNullable<ReturnType<ComputeEngine['parse']>>;

const FUNCTION_NAMES = /(?<![a-z\\])(sin|cos|tan|sqrt|ln|log)(?=\s*\()/gi;

/** `2^(x+1)` → `2^{x+1}`: the CAS reads LaTeX, where `^(` would only raise to `(`. */
function bracePowers(text: string): string {
  const start = text.indexOf('^(');
  if (start < 0) return text;
  let depth = 0;
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')') depth -= 1;
    if (depth === 0) {
      const inner = bracePowers(text.slice(start + 2, i));
      return `${text.slice(0, start)}^{${inner}}${bracePowers(text.slice(i + 1))}`;
    }
  }
  return text; // unbalanced: leave it for the parser to reject
}

/** Keypad text → CAS input. Function names become LaTeX commands, or the CAS reads `sin` as s·i·n. */
const normalize = (text: string): string =>
  bracePowers(
    text
      .trim()
      .replace(/−/g, '-')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/π|(?<![a-z])pi(?![a-z])/gi, '\\pi')
      .replace(FUNCTION_NAMES, (name) => `\\${name.toLowerCase()}`)
      // The CAS reads `^` like LaTeX, where x^12 means x¹·2: brace every numeric exponent.
      .replace(/\^(-?\d+(?:\.\d+)?)/g, '^{$1}'),
  );

/** Forgives harmless number formats: `(-3)`, `+3`, `- 3`, `3.` */
const cleanNumber = (text: string): string =>
  text
    .replace(/\s*(?:mm|cm|km|m)(?:²|³|\^\{?[23]\}?|[23])?$/i, '')
    .replace(/\s*%$/, '')
    .replace(/^\((.*)\)$/, '$1')
    .trim()
    .replace(/^\+/, '')
    .replace(/^-\s+/, '-')
    .replace(/(\d)\.$/, '$1');

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

function checkNumber(expected: Rational, given: string, unit?: 'percent'): CheckOutcome {
  const typed = stripAssignment(normalize(given));
  const text = cleanNumber(typed);
  const value = parseRational(text);
  if (value === null) return 'unreadable';
  // "10%" for an amount of 10 is the classic percent/amount mix-up: a real mistake, not a typo.
  if (/%\s*$/.test(typed) && unit !== 'percent') return 'incorrect';
  if (text.includes('.')) {
    return closeEnough(toNumber(value), toNumber(expected)) ? 'correct' : 'incorrect';
  }
  return equals(value, expected) ? 'correct' : 'incorrect';
}

function evaluateAt(expr: Expr, variables: readonly string[], point: number): number {
  const values = Object.fromEntries(variables.map((v, i) => [v, point + i * VARIABLE_OFFSET]));
  const value = expr.subs(values).N();
  // A complex result (e.g. ln of a negative) is not comparable; its real part alone would mislead.
  return value.im === 0 ? Number(value.re) : Number.NaN;
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

const MONOMIAL = /^-?(\d+\*?)?[a-z](\^\{?\d+\}?)?$/i;

function checkExpression(
  expected: string,
  given: string,
  maxTerms?: number,
  form?: 'monomial',
): CheckOutcome {
  const target = ce().parse(normalize(expected));
  const allowed = new Set(target.unknowns);
  // "y = 2x + 1" for an expected "2x + 1": drop the label when y isn't part of the answer.
  const prefixed = /^([a-z])\s*=\s*(.+)$/i.exec(normalize(given));
  const text = prefixed && !allowed.has(prefixed[1] ?? '') ? (prefixed[2] ?? '') : normalize(given);
  if (text === '') return 'unreadable';
  const parsed = ce().parse(text);
  if (!parsed.isValid || parsed.operator === 'Equal') return 'unreadable';
  // Letters the answer can't contain mean a typo (or a word), not a wrong answer.
  if (parsed.unknowns.some((symbol) => !allowed.has(symbol))) return 'unreadable';
  if (maxTerms !== undefined && (text.includes('(') || countTerms(text) > maxTerms)) {
    return 'incorrect';
  }
  if (form === 'monomial' && !MONOMIAL.test(text.replace(/\s+/g, ''))) return 'incorrect';
  // Only `true` is a proof: the CAS answers `false` for some true identities (2^x·2 vs 2^(x+1)).
  if (target.isIdenticallyEqual(parsed) === true) return 'correct';
  return sampleEqual(target, parsed) ? 'correct' : 'incorrect';
}

const FLIP: Readonly<Record<InequalityOp, InequalityOp>> = {
  '<': '>',
  '>': '<',
  '≤': '≥',
  '≥': '≤',
};

const readOp = (raw: string): InequalityOp => {
  if (raw === '<=' || raw === '=<' || raw === '≤') return '≤';
  if (raw === '>=' || raw === '=>' || raw === '≥') return '≥';
  return raw === '<' ? '<' : '>';
};

const RELATION = '(<=|>=|=<|=>|≤|≥|<|>)';
const VARIABLE_FIRST = new RegExp(`^([a-z])\\s*${RELATION}\\s*(.+)$`, 'i');
const VARIABLE_LAST = new RegExp(`^(.+?)\\s*${RELATION}\\s*([a-z])$`, 'i');

type ReadInequality = Readonly<{ variable: string; op: InequalityOp; boundText: string }>;

/** Reads "x ≥ 3", "x >= 3" and the reversed "3 <= x" (flipped so the variable is on the left). */
function readInequality(text: string): ReadInequality | null {
  const first = VARIABLE_FIRST.exec(text);
  if (first) {
    return {
      variable: (first[1] ?? '').toLowerCase(),
      op: readOp(first[2] ?? ''),
      boundText: first[3] ?? '',
    };
  }
  const last = VARIABLE_LAST.exec(text);
  if (last) {
    return {
      variable: (last[3] ?? '').toLowerCase(),
      op: FLIP[readOp(last[2] ?? '')],
      boundText: last[1] ?? '',
    };
  }
  return null;
}

function checkInequality(
  expected: Readonly<{ variable: string; op: InequalityOp; bound: Rational }>,
  given: string,
): CheckOutcome {
  const read = readInequality(normalize(given));
  if (read === null || read.variable !== expected.variable) return 'unreadable';
  const bound = parseRational(cleanNumber(read.boundText));
  if (bound === null) return 'unreadable';
  return read.op === expected.op && equals(bound, expected.bound) ? 'correct' : 'incorrect';
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
      return checkNumber(expected.value, given, expected.unit);
    case 'expression':
      return checkExpression(expected.text, given, expected.maxTerms, expected.form);
    case 'set':
      return checkSet(expected.items, given);
    case 'point':
      return checkPoint(expected.coords, given);
    case 'inequality':
      return checkInequality(expected, given);
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
    case 'inequality':
      return `${answer.variable} ${answer.op} ${toText(answer.bound)}`;
  }
}
