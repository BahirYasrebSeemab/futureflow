import { checkAnswer, DEFAULT_REGISTRY, ONTARIO_GRAPH, warmChecker } from '@/lib/math/engine';

test('every curriculum topic has a generator on the phone', () => {
  expect(ONTARIO_GRAPH.topics.filter((t) => !DEFAULT_REGISTRY.has(t.id))).toEqual([]);
});

test('the CAS checks expressions on the phone', async () => {
  await warmChecker();
  expect(checkAnswer({ type: 'expression', text: 'x^2+5x+6' }, '(x+2)(x+3)')).toBe('correct');
  expect(checkAnswer({ type: 'expression', text: 'x^2+5x+6' }, '(x+2)(x+4)')).toBe('incorrect');
  expect(checkAnswer({ type: 'expression', text: 'x^2+5x+6' }, 'abc')).toBe('unreadable');
});
