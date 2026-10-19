import type { ReadingLog } from '@futureflow/contracts';
import type { TaskVersion } from '@futureflow/core';
import type { CommitEvidence } from '../src/ports';
import type { Expected } from '../src/verification/eval';

/**
 * The judge eval set (spec §14): GitHub and reading cases with the verdict a careful human gives
 * from the task's criteria alone. `note` says why, so a reviewer can check each label.
 */
export type JudgeCase =
  | Readonly<{
      id: string;
      kind: 'github';
      expected: Expected;
      note: string;
      task: TaskVersion;
      commits: CommitEvidence[];
    }>
  | Readonly<{
      id: string;
      kind: 'reading';
      expected: Expected;
      note: string;
      task: TaskVersion;
      logs: ReadingLog[];
    }>;

const task = (title: string, criteria: string): TaskVersion => ({ title, criteria, seconds: 1800 });

/** One commit; additions and deletions are counted from the patch lines. */
function commit(message: string, files: Record<string, string>): CommitEvidence {
  const counted = Object.entries(files).map(([filename, patch]) => {
    const lines = patch.split('\n');
    return {
      filename,
      additions: lines.filter((l) => l.startsWith('+')).length,
      deletions: lines.filter((l) => l.startsWith('-')).length,
      patch,
    };
  });
  return {
    sha: `${message.length.toString(16).padStart(7, '0')}abc`,
    repo: 'owner/practice',
    day: '2026-10-19',
    committedAt: '2026-10-19T18:00:00Z',
    message,
    additions: counted.reduce((n, f) => n + f.additions, 0),
    deletions: counted.reduce((n, f) => n + f.deletions, 0),
    files: counted,
  };
}

const gh = (
  id: string,
  expected: Expected,
  note: string,
  t: TaskVersion,
  ...commits: CommitEvidence[]
): JudgeCase => ({ id, kind: 'github', expected, note, task: t, commits });

const SIGNUP = task(
  'Add input validation to signup',
  'Reject emails without "@" and passwords under 8 characters, with tests for both',
);
const PAGES = task('Fix off-by-one in pagination', 'The last page shows the remaining items');
const README = task(
  'Write the README install section',
  'The README explains how to install and run the project',
);
const DARK = task(
  'Add a dark mode toggle',
  'A settings switch turns dark mode on and off, and the choice is saved',
);
const DATES = task(
  'Move date helpers into utils/date.ts',
  'Helpers move to utils/date.ts with no change in behaviour',
);
const CART = task('Test the cart total', 'At least 3 tests: a discount, tax, and an empty cart');
const SEARCH = task(
  'Implement binary search',
  'binarySearch(arr, x) halves the range each step and returns the index or -1, with tests',
);
const ERRORS = task(
  'Handle network errors in fetchUser',
  'On failure the user sees an error message instead of a crash',
);
const CI = task('Add a CI workflow', 'GitHub Actions runs the test suite on every push');
const LIMIT = task('Rate-limit the API', 'At most 100 requests a minute per IP; more get a 429');
const TWOSUM = task(
  'Solve Two Sum',
  'A solution that returns the indices for the example cases, with those cases as tests',
);
const FRENCH = task(
  'Translate the homepage to French',
  'Homepage strings in fr.json, in French, and the language switcher shows them',
);

export const GITHUB_CASES: JudgeCase[] = [
  gh(
    'gh-01',
    'pass',
    'validation and both tests',
    SIGNUP,
    commit('Validate signup email and password', {
      'src/signup.ts': `+export function validate(email: string, password: string): string | null {
+  if (!email.includes('@')) return 'Enter a valid email';
+  if (password.length < 8) return 'Use at least 8 characters';
+  return null;
+}`,
      'test/signup.test.ts': `+test('rejects an email without @', () => expect(validate('a.b', 'longenough')).not.toBeNull());
+test('rejects a short password', () => expect(validate('a@b.c', 'short')).not.toBeNull());
+test('accepts valid input', () => expect(validate('a@b.c', 'longenough')).toBeNull());`,
    }),
  ),
  gh(
    'gh-02',
    'pass',
    'the slice end includes the last items, with a test',
    PAGES,
    commit('Fix last page of pagination', {
      'src/paginate.ts': `-  const pages = Math.floor(items.length / size);
+  const pages = Math.ceil(items.length / size);`,
      'test/paginate.test.ts': `+test('last page has the remainder', () => expect(page([1, 2, 3, 4, 5], 2, 3)).toEqual([5]));`,
    }),
  ),
  gh(
    'gh-03',
    'pass',
    'install and run steps',
    README,
    commit('Add install section', {
      'README.md': `+## Install
+
+1. Install Node 22 and Bun.
+2. \`bun install\`
+
+## Run
+
+\`bun run dev\` and open http://localhost:3000.`,
    }),
  ),
  gh(
    'gh-04',
    'pass',
    'switch, theme and saved choice',
    DARK,
    commit('Dark mode toggle in settings', {
      'src/settings.tsx': `+<Switch value={dark} onValueChange={(on) => { setDark(on); localStorage.setItem('theme', on ? 'dark' : 'light'); }} />`,
      'src/theme.ts': `+export const initialDark = () => localStorage.getItem('theme') === 'dark';
+export const palette = (dark: boolean) => (dark ? darkColors : lightColors);`,
    }),
  ),
  gh(
    'gh-05',
    'pass',
    'a pure move, same code',
    DATES,
    commit('Move date helpers to utils', {
      'src/app.ts': `-function formatDay(d: Date) { return d.toISOString().slice(0, 10); }
+import { formatDay } from './utils/date';`,
      'src/utils/date.ts': `+export function formatDay(d: Date) { return d.toISOString().slice(0, 10); }`,
    }),
  ),
  gh(
    'gh-06',
    'pass',
    'the three named tests',
    CART,
    commit('Cart total tests', {
      'test/cart.test.ts': `+test('applies a 10% discount', () => expect(total([{ price: 100 }], { discount: 0.1 })).toBe(90));
+test('adds 13% tax', () => expect(total([{ price: 100 }], { tax: 0.13 })).toBe(113));
+test('an empty cart is 0', () => expect(total([])).toBe(0));`,
    }),
  ),
  gh(
    'gh-07',
    'pass',
    'halving loop and tests',
    SEARCH,
    commit('Binary search', {
      'src/search.ts': `+export function binarySearch(arr: number[], x: number): number {
+  let lo = 0, hi = arr.length - 1;
+  while (lo <= hi) {
+    const mid = (lo + hi) >> 1;
+    if (arr[mid] === x) return mid;
+    if (arr[mid] < x) lo = mid + 1; else hi = mid - 1;
+  }
+  return -1;
+}`,
      'test/search.test.ts': `+test('finds', () => expect(binarySearch([1, 3, 5, 7], 5)).toBe(2));
+test('misses', () => expect(binarySearch([1, 3, 5, 7], 4)).toBe(-1));`,
    }),
  ),
  gh(
    'gh-08',
    'pass',
    'caught and shown to the user',
    ERRORS,
    commit('Show an error when fetchUser fails', {
      'src/profile.tsx': `-  const user = await fetchUser(id);
+  let user;
+  try {
+    user = await fetchUser(id);
+  } catch {
+    setError('Could not load your profile. Check your connection and try again.');
+    return;
+  }`,
    }),
  ),
  gh(
    'gh-09',
    'pass',
    'runs tests on push',
    CI,
    commit('CI: run tests', {
      '.github/workflows/ci.yml': `+on: [push]
+jobs:
+  test:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v4
+      - run: npm ci
+      - run: npm test`,
    }),
  ),
  gh(
    'gh-10',
    'pass',
    'per-IP window and 429',
    LIMIT,
    commit('Rate limit per IP', {
      'src/limit.ts': `+const hits = new Map<string, number[]>();
+export function limit(req, res, next) {
+  const now = Date.now();
+  const recent = (hits.get(req.ip) ?? []).filter((t) => now - t < 60_000);
+  if (recent.length >= 100) return res.status(429).send('Too many requests');
+  hits.set(req.ip, [...recent, now]);
+  next();
+}`,
      'src/server.ts': `+app.use(limit);`,
    }),
  ),
  gh(
    'gh-11',
    'pass',
    'solution and the example tests',
    TWOSUM,
    commit('Two Sum', {
      'src/two-sum.ts': `+export function twoSum(nums: number[], target: number): [number, number] {
+  const seen = new Map<number, number>();
+  for (let i = 0; i < nums.length; i++) {
+    const j = seen.get(target - nums[i]);
+    if (j !== undefined) return [j, i];
+    seen.set(nums[i], i);
+  }
+  throw new Error('no pair');
+}`,
      'test/two-sum.test.ts': `+test('example 1', () => expect(twoSum([2, 7, 11, 15], 9)).toEqual([0, 1]));
+test('example 2', () => expect(twoSum([3, 2, 4], 6)).toEqual([1, 2]));`,
    }),
  ),
  gh(
    'gh-12',
    'pass',
    'French strings and the switcher',
    FRENCH,
    commit('French homepage', {
      'locales/fr.json': `+{ "welcome": "Bienvenue", "start": "Commencer", "about": "À propos" }`,
      'src/lang-switch.tsx': `+<select onChange={(e) => i18n.changeLanguage(e.target.value)}><option value="en">English</option><option value="fr">Français</option></select>`,
    }),
  ),
  gh(
    'gh-13',
    'pass',
    'the work is split over two commits',
    SIGNUP,
    commit('Signup validation', {
      'src/signup.ts': `+export const validate = (email: string, password: string) =>
+  !email.includes('@') ? 'Enter a valid email' : password.length < 8 ? 'Use at least 8 characters' : null;`,
    }),
    commit('Tests for signup validation', {
      'test/signup.test.ts': `+test('no @', () => expect(validate('ab', '12345678')).toBe('Enter a valid email'));
+test('short password', () => expect(validate('a@b', '123')).toBe('Use at least 8 characters'));`,
    }),
  ),
  gh(
    'gh-14',
    'fail',
    'a typo fix, nothing about validation',
    SIGNUP,
    commit('Fix typo', {
      'README.md': `-Sigup form
+Signup form`,
    }),
  ),
  gh(
    'gh-15',
    'fail',
    'debug logging only, the bug is still there',
    PAGES,
    commit('Debug pagination', {
      'src/paginate.ts': `+  console.log('pages', pages, items.length, size);`,
    }),
  ),
  gh(
    'gh-16',
    'fail',
    'one test of the three asked for',
    CART,
    commit('Cart test', {
      'test/cart.test.ts': `+test('an empty cart is 0', () => expect(total([])).toBe(0));`,
    }),
  ),
  gh(
    'gh-17',
    'fail',
    'a linear scan named binarySearch',
    SEARCH,
    commit('Binary search', {
      'src/search.ts': `+export function binarySearch(arr: number[], x: number): number {
+  for (let i = 0; i < arr.length; i++) if (arr[i] === x) return i;
+  return -1;
+}`,
      'test/search.test.ts': `+test('finds', () => expect(binarySearch([1, 3, 5], 3)).toBe(1));`,
    }),
  ),
  gh(
    'gh-18',
    'fail',
    'colours only: no switch, nothing saved',
    DARK,
    commit('Dark colours', {
      'src/theme.ts': `+export const darkColors = { background: '#111', text: '#eee' };`,
    }),
  ),
  gh(
    'gh-19',
    'fail',
    'the message says README but only the licence year changed',
    README,
    commit('Update readme', {
      LICENSE: `-Copyright 2025
+Copyright 2026`,
    }),
  ),
  gh(
    'gh-20',
    'fail',
    'a workflow that never runs the tests',
    CI,
    commit('Add CI', {
      '.github/workflows/ci.yml': `+on: [push]
+jobs:
+  hello:
+    runs-on: ubuntu-latest
+    steps:
+      - run: echo hello`,
    }),
  ),
  gh(
    'gh-21',
    'fail',
    'the error is swallowed: no message for the user',
    ERRORS,
    commit('Handle fetchUser errors', {
      'src/profile.tsx': `-  const user = await fetchUser(id);
+  const user = await fetchUser(id).catch(() => undefined);`,
    }),
  ),
  gh(
    'gh-22',
    'fail',
    'a TODO, no limit',
    LIMIT,
    commit('Rate limiting', {
      'src/server.ts': `+// TODO: rate limit to 100/min per IP`,
    }),
  ),
  gh(
    'gh-23',
    'fail',
    'the move changes the date format: behaviour changed',
    DATES,
    commit('Move date helpers', {
      'src/app.ts': `-function formatDay(d: Date) { return d.toISOString().slice(0, 10); }
+import { formatDay } from './utils/date';`,
      'src/utils/date.ts': `+export function formatDay(d: Date) { return d.toLocaleDateString('en-US'); }`,
    }),
  ),
  gh(
    'gh-24',
    'fail',
    'unrelated dependency bumps',
    TWOSUM,
    commit('Bump deps', {
      'package.json': `-    "vitest": "^3.1.0",
+    "vitest": "^3.2.0",`,
    }),
  ),
  gh(
    'gh-25',
    'fail',
    'fr.json still in English',
    FRENCH,
    commit('French homepage', {
      'locales/fr.json': `+{ "welcome": "Welcome", "start": "Start", "about": "About" }`,
      'src/lang-switch.tsx': `+<option value="fr">Français</option>`,
    }),
  ),
];

const READ = task(
  'Read 20 pages and write what you learned',
  'Notes that name the main idea of what was read, in your own words',
);

const rd = (
  id: string,
  expected: Expected,
  note: string,
  title: string,
  source: ReadingLog['source'],
  summary: string,
): JudgeCase => ({
  id,
  kind: 'reading',
  expected,
  note,
  task: READ,
  logs: [
    {
      id: `01920000-0000-7000-8000-0000000000${id.slice(-2)}`,
      day: '2026-10-19',
      title,
      source,
      pages: 20,
      summary,
    },
  ],
});

export const READING_CASES: JudgeCase[] = [
  rd(
    'rd-01',
    'pass',
    'main idea, own words, a detail',
    'Atomic Habits',
    'book',
    'Small habits compound: getting 1% better each day adds up to a big change over a year. The author says to focus on systems, not goals, because winners and losers often share the same goals.',
  ),
  rd(
    'rd-02',
    'pass',
    'main idea with an application',
    'Deep Work',
    'book',
    'Focused work without distraction produces more value than shallow busywork, and the skill is getting rare. I will block two phone-free hours each morning for coding.',
  ),
  rd(
    'rd-03',
    'pass',
    'names the main idea',
    'Make It Stick',
    'book',
    'Retrieval practice, testing yourself instead of rereading, makes memories last much longer.',
  ),
  rd(
    'rd-04',
    'pass',
    'main idea and an example',
    'The Pragmatic Programmer, ch. 2',
    'book',
    'DRY means every piece of knowledge has one source of truth. Copying a tax rate into three files means three places to forget when it changes.',
  ),
  rd(
    'rd-05',
    'pass',
    'an article, main idea in own words',
    'How SQLite indexes work',
    'article',
    'An index is a sorted B-tree beside the table, so lookups skip scanning every row; the cost is slower writes and more space.',
  ),
  rd(
    'rd-06',
    'pass',
    'main idea with an insight',
    'Mindset',
    'book',
    "People with a growth mindset see ability as something you build, so failure is information, not a verdict. I notice I avoid hard math problems to protect a fixed idea of being 'smart'.",
  ),
  rd(
    'rd-07',
    'pass',
    'a PDF chapter, the main idea',
    'Calculus notes, limits',
    'pdf',
    'A limit is the value a function approaches as x gets close to a point, even if the function is not defined there, like (x²−1)/(x−1) approaching 2 at x=1.',
  ),
  rd(
    'rd-08',
    'pass',
    'main idea, short but clear',
    'Thinking, Fast and Slow, ch. 1',
    'book',
    'We have two systems: a fast, automatic one and a slow, effortful one, and most mistakes come from trusting the fast one when the slow one was needed.',
  ),
  rd(
    'rd-09',
    'pass',
    'main idea in own words',
    'The Psychology of Money',
    'book',
    'Doing well with money is more about behaviour than intelligence: patience and avoiding big mistakes beat clever investing.',
  ),
  rd(
    'rd-10',
    'pass',
    'main idea plus what it changes',
    'Clean Code, functions',
    'book',
    'Functions should do one thing and be small enough to read at a glance. My 80-line handler should become three functions with names that say what they do.',
  ),
  rd(
    'rd-11',
    'pass',
    'main idea of an article',
    'Why sleep matters for learning',
    'article',
    'Sleep consolidates what you learned that day; cutting sleep to study more can mean remembering less.',
  ),
  rd(
    'rd-12',
    'pass',
    'main idea, plain words',
    'Sapiens, ch. 2',
    'book',
    "Humans could cooperate in huge groups because they believe shared stories, like money, nations and laws, that only exist in people's minds.",
  ),
  rd(
    'rd-13',
    'pass',
    'main idea with a detail, informal',
    'Grit',
    'book',
    'basically talent counts but effort counts twice: skill = talent x effort and achievement = skill x effort. so sticking with stuff matters more than i thought',
  ),
  rd('rd-14', 'fail', 'no summary at all', 'Atomic Habits', 'book', 'Good book.'),
  rd('rd-15', 'fail', 'only the title again', 'Deep Work', 'book', 'Deep Work by Cal Newport'),
  rd(
    'rd-16',
    'fail',
    'says it was read, nothing about it',
    'Make It Stick',
    'book',
    'Read 20 pages today, done.',
  ),
  rd(
    'rd-17',
    'fail',
    'a vague sentence with no idea from it',
    'Mindset',
    'book',
    'It was interesting and talked about the mind and stuff.',
  ),
  rd(
    'rd-18',
    'fail',
    'opinion only',
    'Thinking, Fast and Slow',
    'book',
    'I liked it a lot, very well written, recommend!',
  ),
  rd('rd-19', 'fail', 'a chapter count', 'Clean Code', 'book', 'Chapter 3 finished.'),
  rd(
    'rd-20',
    'fail',
    'unrelated to the book',
    'The Psychology of Money',
    'book',
    'Tomorrow I need to buy groceries and finish my math homework.',
  ),
  rd('rd-21', 'fail', 'a phrase, not an idea', 'Sapiens', 'book', 'humans history'),
  rd('rd-22', 'fail', 'emoji only', 'Grit', 'book', '👍🔥'),
  rd(
    'rd-23',
    'fail',
    'vague topic, no main idea',
    'Calculus notes, limits',
    'pdf',
    'It was about limits in math.',
  ),
  rd(
    'rd-24',
    'fail',
    'a plan, not what was learned',
    'Deep Work',
    'book',
    'Will write the summary later.',
  ),
  rd(
    'rd-25',
    'fail',
    'filler that sounds busy but says nothing',
    'How SQLite indexes work',
    'article',
    'This article was very informative and covered many important concepts that are useful to know.',
  ),
];

export const JUDGE_CASES: JudgeCase[] = [...GITHUB_CASES, ...READING_CASES];
