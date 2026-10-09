import { roundToCents, type Rational } from './rational';

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

/** Money with exactly two decimals, rounded half up on the exact value: 4862.025 → "4862.03". */
export function moneyText(r: Rational): string {
  const rounded = roundToCents(r);
  const cents = Math.abs(rounded.num) * (100 / rounded.den);
  const sign = rounded.num < 0 ? '-' : '';
  return `${sign}${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** Polynomial from coefficients, highest power first: [1, -5, 6] → "x^2 - 5x + 6". */
export function formatPolynomial(coefficients: readonly number[], symbol = 'x'): string {
  const degree = coefficients.length - 1;
  const terms = coefficients.flatMap((c, i) => {
    if (c === 0) return [];
    const power = degree - i;
    const variable = power === 0 ? '' : power === 1 ? symbol : `${symbol}^${power}`;
    const magnitude = Math.abs(c) === 1 && variable !== '' ? '' : String(Math.abs(c));
    return [{ negative: c < 0, body: `${magnitude}${variable}` }];
  });
  if (terms.length === 0) return '0';
  return terms
    .map((t, i) =>
      i === 0 ? `${t.negative ? '-' : ''}${t.body}` : `${t.negative ? '-' : '+'} ${t.body}`,
    )
    .join(' ');
}

export const deg = (n: number): string => `${n}°`;

/** decimalText padded to a fixed number of places: "to one decimal place" shows 9.0, not 9. */
export function decimalFixed(r: Rational, places: number): string {
  const text = decimalText(r);
  if (places === 0) return text;
  const [whole, fraction = ''] = text.split('.');
  return `${whole}.${fraction.padEnd(places, '0')}`;
}
