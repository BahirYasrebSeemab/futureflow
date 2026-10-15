import {
  type Answer,
  answerText,
  decimalFixed,
  decimalText,
  moneyText,
  type Problem,
  toText,
} from './engine';

type Rational = Readonly<{ num: number; den: number }>;

const terminates = (r: Rational): boolean => {
  let den = r.den;
  for (const p of [2, 5]) while (den % p === 0) den /= p;
  return den === 1;
};

/** How many decimal places the question asks for, if it asks. */
function placesAsked(prompt: string): number | null {
  if (/one decimal place|nearest tenth/i.test(prompt)) return 1;
  if (/two decimal places|nearest hundredth/i.test(prompt)) return 2;
  return null;
}

function numberText(prompt: string, value: Rational): string {
  // Whole word only: "percent" must not read as money.
  if (/\$|\bcents?\b/i.test(prompt) && terminates(value)) return `$${moneyText(value)}`;
  const places = placesAsked(prompt);
  if (places !== null && terminates(value)) return decimalFixed(value, places);
  if (value.den === 1) return toText(value);
  // A fraction question gets a fraction back; otherwise a decimal when one is exact.
  const asksFractions = /\d\s*\/\s*\d/.test(prompt);
  return !asksFractions && terminates(value) ? decimalText(value) : toText(value);
}

/**
 * The answer as the question asks for it (money, a set number of decimals, a percent, a fraction),
 * for showing after a wrong try. Typed back in, it is always marked correct (see the display test).
 */
export function displayAnswer(problem: Readonly<{ prompt: string; answer: Answer }>): string {
  const { prompt, answer } = problem;
  if (answer.type === 'choice') return answer.options[answer.correctIndex] ?? '';
  if (answer.type !== 'number') return answerText(answer);
  const text = numberText(prompt, answer.value);
  return answer.unit === 'percent' ? `${text}%` : text;
}

export type { Problem };
