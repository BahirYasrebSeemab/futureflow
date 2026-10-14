import { describe, expect, it } from 'vitest';
import {
  extractNumbers,
  extractUnits,
  hasNumberWords,
  isStoryable,
  sameNumbers,
  seedFor,
  splitInstructions,
  storyProblems,
  WORD_TOPICS,
} from '../src/math/word-check';

describe('extractNumbers', () => {
  it('reads digits, decimals, fractions and money, ignoring signs, units and thousands commas', () => {
    expect(
      extractNumbers('How much simple interest does $2,800 earn at 6% per year for 4 years?'),
    ).toEqual(['2800', '4', '6']);
    expect(extractNumbers('Calculate: 4/6 - 3/6 and 5.6 × -6.8')).toEqual([
      '3/6',
      '4/6',
      '5.6',
      '6.8',
    ]);
    expect(extractNumbers('A rectangle is 7 cm long and 7 cm wide. Area in cm²?')).toEqual([
      '7',
      '7',
    ]);
  });
});

describe('hasNumberWords', () => {
  it.each(['a dozen eggs', 'twice as many', 'Two friends', 'half of it', 'one hundred'])(
    'finds %s',
    (text) => {
      expect(hasNumberWords(text)).toBe(true);
    },
  );

  it('ignores words that only contain a number word', () => {
    expect(hasNumberWords('Someone often stones the tent; Tennis.')).toBe(false);
  });
});

describe('storyProblems', () => {
  const exercise = 'A $110 item is 40% off. What is the sale price?';

  it('accepts a story with the same numbers that asks a question', () => {
    const story = 'A jacket costs $110. The store takes 40% off. How much do you pay?';
    expect([sameNumbers(exercise, story), storyProblems(exercise, story)]).toEqual([true, []]);
  });

  it.each([
    [
      'a dropped number',
      'A jacket is 40% off. How much do you pay?',
      ['numbers_differ', 'units_differ'],
    ],
    [
      'an added number',
      'A $110 jacket is 40% off, plus $5 shipping. How much do you pay?',
      ['numbers_differ'],
    ],
    [
      'a number word',
      'A $110 jacket is 40% off for two days. How much do you pay?',
      ['number_words'],
    ],
    ['no question', 'A $110 jacket is 40% off.', ['no_question']],
  ])('rejects %s', (_label, story, reasons) => {
    expect(storyProblems(exercise, story)).toEqual(reasons);
  });
});

describe('seedFor and WORD_TOPICS', () => {
  it('gives the same positive seed for the same inputs and different ones otherwise', () => {
    const a = seedFor('2026-W42', 'percents', 0);
    expect(a).toBe(seedFor('2026-W42', 'percents', 0));
    expect(a).not.toBe(seedFor('2026-W42', 'percents', 1));
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(2 ** 31 - 1);
  });

  it('turns only word-friendly topics into stories', () => {
    expect(WORD_TOPICS).toContain('financial-literacy');
    expect(WORD_TOPICS).not.toContain('factoring');
  });
});

describe('review fixes: instructions, units, number words, answer shape', () => {
  it('splits rounding and form instructions out of the exercise, normalized', () => {
    expect(
      splitInstructions(
        'In right triangle ABC, ∠C = 90° and ∠A = 46°. The hypotenuse AB = 17 cm. Find the side opposite ∠A, to one decimal place.',
      ),
    ).toEqual({
      body: 'In right triangle ABC, ∠C = 90° and ∠A = 46°. The hypotenuse AB = 17 cm. Find the side opposite ∠A.',
      instructions: 'Give your answer to one decimal place.',
    });
    expect(
      splitInstructions(
        '$6000 is invested at 5% per year, compounded annually, for 4 years. What is it worth then? Round to the nearest cent.',
      ),
    ).toEqual({
      body: '$6000 is invested at 5% per year, compounded annually, for 4 years. What is it worth then?',
      instructions: 'Round to the nearest cent.',
    });
    expect(
      splitInstructions(
        'What is the circumference of a circle with a radius of 8 cm? Give your answer in terms of π.',
      ).instructions,
    ).toBe('Give your answer in terms of π.');
    expect(splitInstructions('What is 25% of 28?')).toEqual({
      body: 'What is 25% of 28?',
      instructions: '',
    });
  });

  it('reads units that follow a number, not letters inside words', () => {
    expect(extractUnits('A $110 coat is 40% off.')).toEqual(['$', '%']);
    expect(
      extractUnits("I'm told the room is 7 cm by 3cm, and 16 m² of 5 mm tiles at 30°."),
    ).toEqual(['cm', 'm²', 'mm', '°']);
  });

  it('rejects a story that changes or drops a unit', () => {
    const exercise = 'A rectangle is 7 cm long and 9 cm wide. What is its area in cm²?';
    expect(
      storyProblems(exercise, 'A garden bed is 7 m long and 9 m wide. What area does it cover?'),
    ).toEqual(['units_differ']);
    expect(storyProblems(exercise, 'A photo is 7 long and 9 wide. What is its area?')).toEqual([
      'units_differ',
    ]);
    expect(
      storyProblems(exercise, 'A photo is 7 cm long and 9 cm wide. What is its area?'),
    ).toEqual([]);
  });

  it.each([
    'dozens of eggs',
    'the price doubled',
    'once a week',
    'a third of it',
    'halved the recipe',
    'the fifth day',
  ])('treats %s as a hidden number', (text) => {
    expect(hasNumberWords(text)).toBe(true);
  });

  it('turns only positive number answers into stories', () => {
    const n = (num: number, den = 1) => ({ type: 'number' as const, value: { num, den } });
    expect([
      isStoryable(n(66)),
      isStoryable(n(1, 6)),
      isStoryable(n(0)),
      isStoryable(n(-2)),
    ]).toEqual([true, true, false, false]);
    expect(isStoryable({ type: 'expression', text: '16π' })).toBe(false);
  });
});
