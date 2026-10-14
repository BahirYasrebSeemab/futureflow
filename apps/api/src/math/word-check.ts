/** Topics whose exercises read naturally as real-world stories (pure algebra does not). */
export const WORD_TOPICS: readonly string[] = [
  'whole-number-operations',
  'integers',
  'fractions',
  'decimals',
  'percents',
  'ratios-and-rates',
  'linear-equations',
  'financial-literacy',
  'measurement-and-geometry',
  'data-and-statistics',
  'similar-triangles',
  'right-triangle-trigonometry',
];

const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?(?:\/\d+)?/g;

/** Numbers written as digits, normalized (thousands commas removed), sorted: a multiset. */
export const extractNumbers = (text: string): string[] =>
  [...text.matchAll(NUMBER)].map((m) => m[0].replaceAll(',', '')).sort();

const NUMBER_WORDS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|half|halves|quarter|quarters|twice|double|triple|pair)\b/i;

/** A spelled-out quantity would be a number the check cannot see. */
export const hasNumberWords = (text: string): boolean => NUMBER_WORDS.test(text);

export const sameNumbers = (exercise: string, story: string): boolean =>
  JSON.stringify(extractNumbers(exercise)) === JSON.stringify(extractNumbers(story));

export type StoryProblem = 'numbers_differ' | 'number_words' | 'no_question';

/** Mechanical reasons to reject a story; the judge then checks the calculation itself. */
export function storyProblems(exercise: string, story: string): StoryProblem[] {
  const problems: StoryProblem[] = [];
  if (!sameNumbers(exercise, story)) problems.push('numbers_differ');
  if (hasNumberWords(story)) problems.push('number_words');
  if (!story.trim().endsWith('?')) problems.push('no_question');
  return problems;
}

/** FNV-1a, so a week's problems can be regenerated and audited. */
export function seedFor(week: string, topicId: string, n: number): number {
  let hash = 0x811c9dc5;
  for (const char of `${week}|${topicId}|${n}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % (2 ** 31 - 1)) + 1;
}
