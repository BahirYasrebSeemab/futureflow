import { checkAnswer, DEFAULT_REGISTRY, ONTARIO_GRAPH } from '@/lib/math/engine';
import { displayAnswer } from '@/lib/math/display';

const num = (n: number, d = 1, extra = {}) => ({
  type: 'number' as const,
  value: { num: n, den: d },
  ...extra,
});

test.each([
  ['Calculate: 3.3 × 6', num(99, 5), '19.8'],
  ['A $135 item is 5% off. What is the sale price?', num(513, 4), '$128.25'],
  ['What percent of 160 is 8?', num(5, 1, { unit: 'percent' }), '5%'],
  ['Calculate: 5/6 + 3/5', num(43, 30), '43/30'],
  ['Calculate: 1/4 + 1/4', num(1, 2), '1/2'],
  ['Find the side, to one decimal place.', num(41, 10), '4.1'],
  ['Find the side, to one decimal place.', num(9, 1), '9.0'],
  ['Round to the nearest cent.', num(486203, 100), '$4862.03'],
  ['Solve for x: 2x = 7', num(7, 2), '3.5'],
  ['Solve for x: 3x = 1', num(1, 3), '1/3'],
])('%s → %s', (prompt, answer, shown) => {
  expect(displayAnswer({ prompt, answer })).toBe(shown);
});

test('every shown answer, typed back in, is marked correct', () => {
  const failures: string[] = [];
  for (const topic of ONTARIO_GRAPH.topics) {
    const generator = DEFAULT_REGISTRY.get(topic.id)!;
    for (const difficulty of [1, 2, 3, 4, 5] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const problem = generator.generate(seed * 7919, difficulty);
        const shown = displayAnswer(problem);
        if (checkAnswer(problem.answer, shown) !== 'correct') {
          failures.push(
            `${topic.id} d${difficulty} s${seed}: "${problem.prompt}" shown "${shown}"`,
          );
        }
      }
    }
  }
  expect(failures.slice(0, 10)).toEqual([]);
});
