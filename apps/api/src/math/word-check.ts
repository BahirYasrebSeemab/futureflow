import type { Problem } from '@futureflow/math-engine/types';

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

const NUMBER_WORDS = new RegExp(
  '\\b(' +
    [
      'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen',
      'fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy',
      'eighty|ninety|hundreds?|thousands?|millions?|dozens?|tens|half|halves|halved|halving',
      'quarters?|twice|thrice|once|double[ds]?|doubling|triple[ds]?|tripling|pairs?|couple',
      'third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|thirds|fifths|tenths',
    ].join('|') +
    ')\\b',
  'i',
);

/** A spelled-out quantity would be a number the check cannot see. */
export const hasNumberWords = (text: string): boolean => NUMBER_WORDS.test(text);

export const sameNumbers = (exercise: string, story: string): boolean =>
  JSON.stringify(extractNumbers(exercise)) === JSON.stringify(extractNumbers(story));

export type StoryProblem = 'numbers_differ' | 'units_differ' | 'number_words' | 'no_question';

const UNIT = /(\$)(?=\d)|(?<=\d)\s?(%|°)|(?<=\d)\s?(mm|cm|km|m)([²³])?(?![A-Za-z])/g;

/** Units attached to numbers ($110, 40%, 30°, 7 cm, 16 m²), in first-appearance order, once each. */
export function extractUnits(text: string): string[] {
  const units = [...text.matchAll(UNIT)].map((m) => m[1] ?? m[2] ?? `${m[3] ?? ''}${m[4] ?? ''}`);
  return [...new Set(units)];
}

const sameUnits = (a: string, b: string): boolean =>
  JSON.stringify(extractUnits(a).sort()) === JSON.stringify(extractUnits(b).sort());

const SENTENCE_INSTRUCTION = /^(round\b|give your answer\b)/i;
const CLAUSE_INSTRUCTION =
  /,\s*(to (?:one|two|three|\d+) decimal places?|to the nearest [a-z]+)(?=[.?!]$)/i;

/**
 * Rounding and form instructions ("to one decimal place", "Round to the nearest cent", "in terms
 * of π") decide what answer is right, so the AI never paraphrases them: they are taken out of the
 * exercise here and appended to the story word for word.
 */
export function splitInstructions(prompt: string): { body: string; instructions: string } {
  const body: string[] = [];
  const instructions: string[] = [];
  for (const sentence of prompt.trim().split(/(?<=[.?!])\s+/)) {
    if (SENTENCE_INSTRUCTION.test(sentence)) {
      instructions.push(sentence);
      continue;
    }
    const clause = CLAUSE_INSTRUCTION.exec(sentence);
    if (clause !== null) {
      instructions.push(`Give your answer ${clause[1] ?? ''}.`);
      body.push(sentence.replace(CLAUSE_INSTRUCTION, ''));
    } else {
      body.push(sentence);
    }
  }
  return { body: body.join(' '), instructions: instructions.join(' ') };
}

/** Mechanical reasons to reject the AI's story (without the appended instructions). */
export function storyProblems(exercise: string, story: string): StoryProblem[] {
  const { body } = splitInstructions(exercise);
  const problems: StoryProblem[] = [];
  if (!sameNumbers(body, story)) problems.push('numbers_differ');
  if (!sameUnits(body, story)) problems.push('units_differ');
  if (hasNumberWords(story)) problems.push('number_words');
  if (!story.trim().endsWith('?')) problems.push('no_question');
  return problems;
}

type ExerciseAnswer = Problem['answer'];

/**
 * Only positive number answers become stories: a negative answer invites "how much less" phrasing
 * that flips the sign the checker expects, and a zero answer makes a degenerate story.
 */
export const isStoryable = (answer: ExerciseAnswer): boolean =>
  answer.type === 'number' && answer.value.num > 0 && answer.value.den > 0;

/** FNV-1a, so a week's problems can be regenerated and audited. */
export function seedFor(week: string, topicId: string, n: number | string): number {
  let hash = 0x811c9dc5;
  for (const char of `${week}|${topicId}|${n}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % (2 ** 31 - 1)) + 1;
}
