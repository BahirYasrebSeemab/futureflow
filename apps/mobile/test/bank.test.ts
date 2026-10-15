import { DEFAULT_REGISTRY } from '@/lib/math/engine';
import { verifiedBankProblem } from '@/lib/math/bank';

const generated = DEFAULT_REGISTRY.get('percents')!.generate(1234, 2);
const bank = (over = {}) => ({
  id: 'b1',
  topicId: 'percents',
  difficulty: 2,
  seed: 1234,
  story: 'A jacket costs more than you hoped. How much do you pay?',
  prompt: generated.prompt,
  answer: { type: 'number', value: { num: -1, den: 1 } }, // never used: the phone regenerates
  hints: [],
  steps: [],
  week: '2026-W42',
  createdAt: 1,
  ...over,
});

test('a matching bank problem keeps the story but takes everything else from the phone', () => {
  const p = verifiedBankProblem(bank())!;
  expect(p.prompt).toBe(bank().story);
  expect(p.answer).toEqual(generated.answer);
  expect(p.steps).toEqual(generated.steps);
  expect(p.hints).toEqual(generated.hints);
});

test('a mismatched or unknown bank problem is refused', () => {
  expect(verifiedBankProblem(bank({ prompt: 'something else' }))).toBeNull();
  expect(verifiedBankProblem(bank({ topicId: 'no-such-topic' }))).toBeNull();
  expect(verifiedBankProblem(bank({ difficulty: 3 }))).toBeNull();
});
