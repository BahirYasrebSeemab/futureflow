import { add, equals, mul, parseRational, rational, type Rational } from '../src/rational';

export type StepEquation = Readonly<{ text: string; valid: boolean }>;

const NUMBER = String.raw`(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?(?:\/\d+)?)(?![\w.\/²³⁰^])`;
const OP = String.raw`[+\-×÷]`;
const CHAIN = new RegExp(
  String.raw`(?<![\w.)\/%√²³⁰])(?<!${OP}\s)` +
    `(${NUMBER}(?:\\s${OP}\\s${NUMBER})+)\\s=\\s(${NUMBER})` +
    String.raw`(?=%|$|[,;)]|\s(?!${OP}\s))`,
  'g',
);
const TOKEN = new RegExp(`(${OP})?\\s?(${NUMBER})`, 'g');

const toRational = (token: string): Rational => {
  const value = parseRational(token.replace(/^\((.*)\)$/, '$1'));
  if (value === null) throw new Error(`unparseable number token: ${token}`);
  return value;
};

const divide = (a: Rational, b: Rational): Rational => mul(a, rational(b.den, b.num));

/** Evaluates `n op n op n…` with × and ÷ before + and −, exactly. */
function evaluateChain(chain: string): Rational {
  const parts = [...chain.matchAll(TOKEN)].map((m) => ({
    op: m[1],
    value: toRational(m[2] ?? ''),
  }));
  const terms: { sign: 1 | -1; value: Rational }[] = [];
  for (const { op, value } of parts) {
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

export function stepEquations(step: string): StepEquation[] {
  return [...step.matchAll(CHAIN)].map((m) => {
    const [text, chain = '', result = ''] = m;
    return { text, valid: equals(evaluateChain(chain), toRational(result)) };
  });
}
