/** Exact fraction. Invariants: den > 0, gcd(|num|, den) = 1, never -0. */
export type Rational = Readonly<{ num: number; den: number }>;

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export const lcm = (a: number, b: number): number => Math.abs(a * b) / gcd(a, b);

export function rational(num: number, den = 1): Rational {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den === 0) {
    throw new RangeError(`invalid rational ${num}/${den}`);
  }
  const sign = den < 0 ? -1 : 1;
  const divisor = gcd(num, den) || 1;
  return { num: (sign * num) / divisor + 0, den: Math.abs(den) / divisor };
}

export const add = (a: Rational, b: Rational): Rational =>
  rational(a.num * b.den + b.num * a.den, a.den * b.den);

export const mul = (a: Rational, b: Rational): Rational => rational(a.num * b.num, a.den * b.den);

export const equals = (a: Rational, b: Rational): boolean => a.num === b.num && a.den === b.den;

export const toNumber = (r: Rational): number => r.num / r.den;

export const toText = (r: Rational): string => (r.den === 1 ? `${r.num}` : `${r.num}/${r.den}`);

const INTEGER = /^-?\d+$/;
const FRACTION = /^(-?\d+)\s*\/\s*(-?\d+)$/;
const DECIMAL = /^(-?)(\d*)\.(\d+)$/;
const MIXED = /^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/;

function parseUnsafe(text: string): Rational | null {
  if (INTEGER.test(text)) return rational(Number(text));
  const mixed = MIXED.exec(text);
  if (mixed) {
    const [, sign, whole, num, den] = mixed;
    const value = add(rational(Number(whole)), rational(Number(num), Number(den)));
    return sign === '-' ? rational(-value.num, value.den) : value;
  }
  const fraction = FRACTION.exec(text);
  if (fraction) {
    const den = Number(fraction[2]);
    return den === 0 ? null : rational(Number(fraction[1]), den);
  }
  const decimal = DECIMAL.exec(text);
  if (decimal) {
    const [, sign, whole, digits = ''] = decimal;
    const magnitude = Number(`${whole || '0'}${digits}`);
    return rational(sign === '-' ? -magnitude : magnitude, 10 ** digits.length);
  }
  return null;
}

/** Accepts `3`, `-3/4`, `0.75`, `-.5` (and the Unicode minus sign). Returns null otherwise. */
export function parseRational(text: string): Rational | null {
  try {
    return parseUnsafe(text.trim().replace(/−/g, '-'));
  } catch {
    return null;
  }
}

/** Nearest cent with halves rounded up (away from zero), computed exactly with BigInt. */
export function roundToCents(r: Rational): Rational {
  const [num, den] = [BigInt(r.num), BigInt(r.den)];
  const magnitude = num < 0n ? -num : num;
  const cents = (200n * magnitude + den) / (2n * den);
  return rational(Number(num < 0n ? -cents : cents), 100);
}

/** Rounds an irrational value (e.g. a root from the quadratic formula) to `places` decimals. */
export const roundFloat = (value: number, places: number): Rational =>
  rational(Math.round(value * 10 ** places), 10 ** places);
