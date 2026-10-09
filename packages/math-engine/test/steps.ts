import { add, equals, mul, parseRational, rational, type Rational } from '../src/rational';

export type StepEquation = Readonly<{ text: string; valid: boolean }>;

const SUPERSCRIPT: Readonly<Record<string, number>> = { '⁰': 0, '²': 2, '³': 3 };

/** A number token: (-3), √49, -3, 4.25, 3/4, optionally raised to ^n or ², ³, ⁰. */
const BASE = String.raw`\(-?\d+(?:\.\d+)?\)|√\d+|-?\d+(?:\.\d+)?(?:\/\d+)?`;
const NUMBER = String.raw`(?:${BASE})(?:\^\d+|[²³⁰])?(?![\w\/²³⁰^√]|\.\d)`;
const OP = String.raw`[+\-×÷]`;
const EXPRESSION = String.raw`${NUMBER}(?:\s${OP}\s${NUMBER})*`;

/** `expr = expr (= expr)…`, not glued to a letter, a digit or a preceding operator. */
const EQUATION = new RegExp(
  String.raw`(?<![\w.)\/%√²³⁰^])(?<!${OP}\s)` +
    `(${EXPRESSION}(?:\\s=\\s${EXPRESSION})+)` +
    String.raw`(?=$|[%,;).]|\s(?!${OP}\s))`,
  'g',
);
const TOKEN = new RegExp(`(${OP})?\\s?(${NUMBER})`, 'g');
const POWER = /^(.*?)(?:\^(\d+)|([²³⁰]))?$/;

const power = (base: Rational, exponent: number): Rational =>
  Array.from({ length: exponent }).reduce<Rational>((acc) => mul(acc, base), rational(1));

/** Exact value of one token, or null when it isn't exact (e.g. √50). */
function tokenValue(token: string): Rational | null {
  const [, base = '', caret, superscript] = POWER.exec(token) ?? [];
  const exponent =
    caret !== undefined
      ? Number(caret)
      : superscript !== undefined
        ? (SUPERSCRIPT[superscript] ?? 1)
        : 1;
  let value: Rational | null;
  if (base.startsWith('√')) {
    const radicand = Number(base.slice(1));
    const root = Math.round(Math.sqrt(radicand));
    value = root * root === radicand ? rational(root) : null;
  } else {
    value = parseRational(base.replace(/^\((.*)\)$/, '$1'));
  }
  return value === null ? null : power(value, exponent);
}

const divide = (a: Rational, b: Rational): Rational => mul(a, rational(b.den, b.num));

/** Evaluates `n op n op n…` with × and ÷ before + and −, exactly. Null if any token is inexact. */
function expressionValue(expression: string): Rational | null {
  const terms: { sign: 1 | -1; value: Rational }[] = [];
  for (const m of expression.matchAll(TOKEN)) {
    const [, op, token = ''] = m;
    const value = tokenValue(token);
    if (value === null) return null;
    const last = terms.at(-1);
    if (op === '×' && last) last.value = mul(last.value, value);
    else if (op === '÷' && last) last.value = divide(last.value, value);
    else terms.push({ sign: op === '-' ? -1 : 1, value });
  }
  return terms.reduce<Rational>(
    (sum, t) => add(sum, t.sign === 1 ? t.value : rational(-t.value.num, t.value.den)),
    rational(0),
  );
}

/** Every numeric equation in the step; valid when all sides have the same exact value. */
export function stepEquations(step: string): StepEquation[] {
  // "65 = 22.75" in "35% of 65 = 22.75" is not a claim: plain number = number is only checked
  // when an operator, a power, a root or a fraction makes it one ("4² = 16", "3/4 = 15/20").
  const isClaim = (chain: string): boolean => new RegExp(`\\s${OP}\\s|[\\^²³⁰√/]`).test(chain);
  return [...step.matchAll(EQUATION)]
    .filter((m) => isClaim(m[1] ?? ''))
    .map((m) => {
      const [text, chain = ''] = m;
      const values = chain.split(/\s=\s/).map(expressionValue);
      const [first] = values;
      const valid = first != null && values.every((v) => v !== null && equals(v, first));
      return { text, valid };
    });
}
