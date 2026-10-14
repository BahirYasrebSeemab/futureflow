import { describe, expect, it } from 'vitest';
import {
  extractNumbers,
  hasNumberWords,
  sameNumbers,
  seedFor,
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
    ['a dropped number', 'A jacket is 40% off. How much do you pay?', ['numbers_differ']],
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
