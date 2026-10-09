import { decimalText, deg } from '../format';
import { rational, roundSafely, type Rational } from '../rational';
import { createRng, type Rng } from '../rng';
import type { Generator } from '../types';

const RAD = Math.PI / 180;
const MAX_TRIES = 100;
const SPECIAL = new Set([30, 45, 60, 90]);

const angleBetween = (rng: Rng, min: number, max: number): number => {
  const a = rng.int(min, max);
  return SPECIAL.has(a) ? a + 1 : a;
};

type Draft = Readonly<{ prompt: string; value: Rational; steps: string[] }>;

function draft(rng: Rng, difficulty: number): Draft | null {
  if (difficulty <= 2) {
    const [A, B] = [angleBetween(rng, 25, 85), angleBetween(rng, 25, 85)];
    if (A + B >= 170) return null;
    const a = rng.int(4, 25);
    const value = roundSafely((a * Math.sin(B * RAD)) / Math.sin(A * RAD), 1);
    if (value === null) return null;
    return {
      prompt: `In triangle ABC, ∠A = ${deg(A)}, ∠B = ${deg(B)} and a = ${a} cm. Find b, to one decimal place.`,
      value,
      steps: [
        `Sine law: b ÷ sin(B) = a ÷ sin(A)`,
        `b = ${a} × sin(${deg(B)}) ÷ sin(${deg(A)}) ≈ ${decimalText(value)}`,
      ],
    };
  }
  if (difficulty === 3) {
    const A = angleBetween(rng, 25, 85);
    const a = rng.int(8, 25);
    const b = rng.int(4, a - 1);
    const value = roundSafely(Math.asin((b * Math.sin(A * RAD)) / a) / RAD, 0);
    if (value === null) return null;
    return {
      prompt: `In triangle ABC, a = ${a} cm, b = ${b} cm and ∠A = ${deg(A)}. Find ∠B, to the nearest degree.`,
      value,
      steps: [
        `Sine law: sin(B) ÷ b = sin(A) ÷ a, so sin(B) = b × sin(A) ÷ a`,
        `∠B = sin⁻¹(${b} × sin(${deg(A)}) ÷ ${a}) ≈ ${decimalText(value)}° (b < a, so ∠B is acute: only one answer)`,
      ],
    };
  }
  if (difficulty === 4) {
    const A = angleBetween(rng, 20, 140);
    const [b, c] = [rng.int(4, 25), rng.int(4, 25)];
    const value = roundSafely(Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(A * RAD)), 1);
    if (value === null) return null;
    return {
      prompt: `In triangle ABC, b = ${b} cm, c = ${c} cm and ∠A = ${deg(A)}. Find a, to one decimal place.`,
      value,
      steps: [
        `Cosine law: a² = b² + c² - 2bc × cos(A)`,
        `a² = ${b}² + ${c}² - 2 × ${b} × ${c} × cos(${deg(A)})`,
        `a = √(${b * b + c * c} - ${2 * b * c} × cos(${deg(A)})) ≈ ${decimalText(value)}`,
      ],
    };
  }
  const [b, c] = [rng.int(4, 25), rng.int(4, 25)];
  const a = rng.int(Math.abs(b - c) + 1, b + c - 1);
  const value = roundSafely(Math.acos((b * b + c * c - a * a) / (2 * b * c)) / RAD, 0);
  if (value === null || SPECIAL.has(Math.round(value.num / value.den))) return null;
  return {
    prompt: `In triangle ABC, a = ${a} cm, b = ${b} cm and c = ${c} cm. Find ∠A, to the nearest degree.`,
    value,
    steps: [
      `Cosine law: cos(A) = (b² + c² - a²) ÷ 2bc`,
      `cos(A) = (${b * b} + ${c * c} - ${a * a}) ÷ ${2 * b * c}`,
      `∠A = cos⁻¹(${b * b + c * c - a * a} ÷ ${2 * b * c}) ≈ ${decimalText(value)}°`,
    ],
  };
}

export const sineAndCosineLawsGenerator: Generator = {
  topicId: 'sine-and-cosine-laws',
  generate(seed, difficulty) {
    const rng = createRng(seed);
    let result: Draft | null = null;
    for (let tries = 0; tries < MAX_TRIES && result === null; tries += 1)
      result = draft(rng, difficulty);
    const final = result ?? {
      prompt: 'In triangle ABC, ∠A = 48°, ∠B = 65° and a = 12 cm. Find b, to one decimal place.',
      value: rational(146, 10),
      steps: ['Sine law: b ÷ sin(B) = a ÷ sin(A)', 'b = 12 × sin(65°) ÷ sin(48°) ≈ 14.6'],
    };
    return {
      topicId: 'sine-and-cosine-laws',
      seed,
      difficulty,
      prompt: final.prompt,
      answer: { type: 'number', value: final.value },
      hints: ['Sine law: a ÷ sin(A) = b ÷ sin(B). Cosine law: a² = b² + c² − 2bc·cos(A).'],
      steps: final.steps,
    };
  },
};
