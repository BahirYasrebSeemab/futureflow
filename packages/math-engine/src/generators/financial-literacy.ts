import { decimalText } from '../format';
import { rational, type Rational } from '../rational';
import { createRng } from '../rng';
import type { Generator, Problem } from '../types';

const CENT_TOLERANCE = 0.005;
const HST_PERCENT = 13; // Ontario harmonized sales tax
const ROUND = ' Round to the nearest cent.';

const money = (r: Rational): string => {
  const exact = Math.round((r.num / r.den) * 100) / 100;
  return exact.toFixed(2);
};

export const financialLiteracyGenerator: Generator = {
  topicId: 'financial-literacy',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    const make = (
      prompt: string,
      value: Rational,
      rounded: boolean,
      hint: string,
      steps: string[],
    ): Problem => ({
      topicId: 'financial-literacy',
      seed,
      difficulty,
      prompt: rounded ? `${prompt}${ROUND}` : prompt,
      answer: rounded
        ? { type: 'number', value, tolerance: CENT_TOLERANCE }
        : { type: 'number', value },
      hints: [hint],
      steps,
    });

    if (difficulty === 1) {
      const [principal, rate, years] = [100 * rng.int(5, 50), rng.int(2, 9), rng.int(2, 5)];
      const interest = rational(principal * rate * years, 100);
      return make(
        `How much simple interest does $${principal} earn at ${rate}% per year for ${years} years?`,
        interest,
        false,
        'Simple interest: I = P × r × t, with r as a decimal.',
        [
          `I = P × r × t = ${principal} × ${decimalText(rational(rate, 100))} × ${years} = ${decimalText(interest)}`,
        ],
      );
    }
    if (difficulty === 2) {
      const price = rational(rng.int(500, 9999), 100);
      const tax = rational(price.num * HST_PERCENT, price.den * 100);
      const total = rational(price.num * (100 + HST_PERCENT), price.den * 100);
      return make(
        `A jacket costs $${decimalText(price)} before tax. What is the total with ${HST_PERCENT}% HST?`,
        total,
        true,
        'Tax = price × 0.13; total = price + tax.',
        [
          `Tax: ${decimalText(price)} × 0.13 = ${decimalText(tax)}`,
          `Total: ${decimalText(price)} + ${decimalText(tax)} = ${decimalText(total)}, about $${money(total)}`,
        ],
      );
    }
    if (difficulty === 3) {
      const [price, percent] = [5 * rng.int(4, 40), 5 * rng.int(1, 14)];
      const discount = rational(price * percent, 100);
      const sale = rational(price * (100 - percent), 100);
      return make(
        `A $${price} item is ${percent}% off. What is the sale price?`,
        sale,
        false,
        'Find the discount, then subtract it from the price.',
        [
          `Discount: ${price} × ${decimalText(rational(percent, 100))} = ${decimalText(discount)}`,
          `Sale price: ${price} - ${decimalText(discount)} = ${decimalText(sale)}`,
        ],
      );
    }
    if (difficulty === 4) {
      const grams = rng.pick([200, 300, 400, 500, 1000]);
      const centsPer100 = rng.int(20, 150);
      const price = rational((centsPer100 * grams) / 100, 100);
      const unit = rational(centsPer100, 100);
      return make(
        `A ${grams} g package costs $${decimalText(price)}. What is the price per 100 g?`,
        unit,
        true,
        'Divide the price by the number of 100 g portions.',
        [
          `${grams} g = ${grams / 100} portions of 100 g`,
          `${decimalText(price)} ÷ ${grams / 100} = ${decimalText(unit)}`,
        ],
      );
    }
    const [principal, rate, years] = [1000 * rng.int(1, 10), rng.int(2, 8), rng.int(2, 5)];
    const amount = rational(principal * (100 + rate) ** years, 100 ** years);
    return make(
      `$${principal} is invested at ${rate}% per year, compounded annually, for ${years} years. What is it worth then?`,
      amount,
      true,
      'Compound interest: A = P(1 + r)^t.',
      [
        `A = ${principal} × ${decimalText(rational(100 + rate, 100))}^${years} = ${decimalText(amount)}, about $${money(amount)}`,
      ],
    );
  },
};
