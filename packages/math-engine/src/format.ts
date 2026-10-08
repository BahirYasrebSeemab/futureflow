import type { Rational } from './rational';

export const signed = (n: number): string => (n < 0 ? `- ${-n}` : `+ ${n}`);

/** Formats p·x + q the way a textbook would: "3x - 2", "-x", "x + 4", "5". */
export function formatLinear(p: number, q: number, symbol = 'x'): string {
  if (p === 0) return String(q);
  const coefficient = p === 1 ? '' : p === -1 ? '-' : String(p);
  const lead = `${coefficient}${symbol}`;
  return q === 0 ? lead : `${lead} ${signed(q)}`;
}

const MAX_DECIMAL_PLACES = 12;

/** Exact decimal text for a terminating rational: 17/4 → "4.25". Throws for 1/3 etc. */
export function decimalText(r: Rational): string {
  for (let places = 0; places <= MAX_DECIMAL_PLACES; places += 1) {
    const power = 10 ** places;
    if (power % r.den !== 0) continue;
    const scaled = Math.abs(r.num) * (power / r.den);
    const whole = Math.floor(scaled / power);
    const fraction = String(scaled % power)
      .padStart(places, '0')
      .replace(/0+$/, '');
    const sign = r.num < 0 ? '-' : '';
    return fraction === '' ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
  }
  throw new RangeError(`${r.num}/${r.den} has no terminating decimal`);
}

/** Negatives in brackets so steps never read "4 - -3". */
export const show = (n: number): string => (n < 0 ? `(${n})` : String(n));
