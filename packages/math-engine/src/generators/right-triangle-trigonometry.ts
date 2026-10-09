import { decimalText, deg } from '../format';
import { rational, roundSafely, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

const RAD = Math.PI / 180;
const MAX_TRIES = 100;

/** 10°–80° without 30°, 45°, 60°: their ratios are exact and could land on a rounding half. */
const angle = (rng: Rng): number => {
  const a = rng.int(10, 80);
  return a === 30 || a === 45 || a === 60 ? a + 1 : a;
};

type Draft = Readonly<{ prompt: string; value: Rational; steps: string[] }>;

const TO_ONE_DECIMAL = ', to one decimal place.';
const TO_NEAREST_DEGREE = ', to the nearest degree.';
const SETUP = (a: number): string => `In right triangle ABC, ∠C = 90° and ∠A = ${deg(a)}`;

function draft(rng: Rng, difficulty: number): Draft | null {
  const a = angle(rng);
  const [s1, s2] = [rng.int(3, 30), rng.int(3, 30)];
  const ratio = (fn: 'sin' | 'cos' | 'tan'): number => Math[fn](a * RAD);

  if (difficulty === 1 || difficulty === 2) {
    const fn = difficulty === 1 ? 'sin' : 'cos';
    const value = roundSafely(s1 * ratio(fn), 1);
    if (value === null) return null;
    const side = difficulty === 1 ? 'opposite' : 'adjacent to';
    return {
      prompt: `${SETUP(a)}. The hypotenuse AB = ${s1} cm. Find the side ${side} ∠A${TO_ONE_DECIMAL}`,
      value,
      steps: [
        `${fn}(A) = ${difficulty === 1 ? 'opposite' : 'adjacent'} ÷ hypotenuse`,
        `${difficulty === 1 ? 'opposite' : 'adjacent'} = ${s1} × ${fn}(${deg(a)}) ≈ ${decimalText(value)}`,
      ],
    };
  }
  if (difficulty === 3) {
    const value = roundSafely(s1 * ratio('tan'), 1);
    if (value === null) return null;
    return {
      prompt: `${SETUP(a)}. The side adjacent to ∠A is ${s1} cm. Find the side opposite ∠A${TO_ONE_DECIMAL}`,
      value,
      steps: [
        'tan(A) = opposite ÷ adjacent',
        `opposite = ${s1} × tan(${deg(a)}) ≈ ${decimalText(value)}`,
      ],
    };
  }
  if (difficulty === 4) {
    const [opposite, hypotenuse] = [Math.min(s1, s2), Math.max(s1, s2)];
    if (opposite === hypotenuse) return null;
    const value = roundSafely(Math.asin(opposite / hypotenuse) / RAD, 0);
    if (value === null) return null;
    return {
      prompt: `In right triangle ABC, ∠C = 90°, the side opposite ∠A is ${opposite} cm and the hypotenuse is ${hypotenuse} cm. Find ∠A${TO_NEAREST_DEGREE}`,
      value,
      steps: [
        'sin(A) = opposite ÷ hypotenuse',
        `∠A = sin⁻¹(${opposite} ÷ ${hypotenuse}) ≈ ${decimalText(value)}°`,
      ],
    };
  }
  if (rng.next() < 0.5) {
    const value = roundSafely(Math.atan(s1 / s2) / RAD, 0);
    if (value === null) return null;
    return {
      prompt: `In right triangle ABC, ∠C = 90°, the side opposite ∠A is ${s1} cm and the side adjacent to ∠A is ${s2} cm. Find ∠A${TO_NEAREST_DEGREE}`,
      value,
      steps: ['tan(A) = opposite ÷ adjacent', `∠A = tan⁻¹(${s1} ÷ ${s2}) ≈ ${decimalText(value)}°`],
    };
  }
  const value = roundSafely(s1 / ratio('sin'), 1);
  if (value === null) return null;
  return {
    prompt: `${SETUP(a)}. The side opposite ∠A is ${s1} cm. Find the hypotenuse${TO_ONE_DECIMAL}`,
    value,
    steps: [
      'sin(A) = opposite ÷ hypotenuse, so hypotenuse = opposite ÷ sin(A)',
      `hypotenuse = ${s1} ÷ sin(${deg(a)}) ≈ ${decimalText(value)}`,
    ],
  };
}

export const rightTriangleTrigonometryGenerator: Generator = {
  topicId: 'right-triangle-trigonometry',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    let result: Draft | null = null;
    for (let tries = 0; tries < MAX_TRIES && result === null; tries += 1)
      result = draft(rng, difficulty);
    const final = result ?? {
      prompt: `${SETUP(35)}. The hypotenuse AB = 12 cm. Find the side opposite ∠A${TO_ONE_DECIMAL}`,
      value: rational(69, 10),
      steps: ['sin(A) = opposite ÷ hypotenuse', `opposite = 12 × sin(35°) ≈ 6.9`],
    };
    return {
      topicId: 'right-triangle-trigonometry',
      seed,
      difficulty,
      prompt: final.prompt,
      answer: { type: 'number', value: final.value },
      hints: [
        'SOH CAH TOA: sin = opposite ÷ hypotenuse, cos = adjacent ÷ hypotenuse, tan = opposite ÷ adjacent.',
      ],
      steps: final.steps,
    };
  },
};
