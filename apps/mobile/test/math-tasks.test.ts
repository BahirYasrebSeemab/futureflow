import type { Today } from '@/lib/api/client';
import { checkMathTasks, mathTarget } from '@/lib/math/tasks';
import { sampleToday, testServices } from './support/fakes';

const DAY = '2026-10-14';
const attempt = (i: number, correct: boolean) => ({
  id: `01920000-0000-7000-8000-${String(700 + i).padStart(12, '0')}`,
  day: DAY,
  at: 1_000 + i,
  topicId: 'fractions',
  difficulty: 3,
  correct,
  answerType: 'typed' as const,
});
const attempts = (total: number, right: number) =>
  Array.from({ length: total }, (_, i) => attempt(i, i < right));

// sampleToday: both tasks are math tasks; task 1 already passed, task 2 is open.
const openTask = sampleToday().plan!.tasks[1]!.id;

async function setup(today: Today, saved: ReturnType<typeof attempts>) {
  const decideVerdict = jest.fn(
    async (taskId: string, body: { day: string; outcome: 'pass' | 'fail' }) => ({
      ok: true as const,
      data: {
        day: body.day,
        taskId,
        outcome: body.outcome,
        confidence: 1,
        by: 'code' as const,
        evidenceIds: [],
      },
    }),
  );
  const services = await testServices({ decideVerdict });
  for (const a of saved) await services.store.saveAttempt(a);
  const run = () => checkMathTasks({ api: services.api, store: services.store }, today, DAY);
  return { decideVerdict, run, services };
}

test('mathTarget describes the full and the 2-minute version', () => {
  expect(mathTarget(attempts(10, 7), false)).toEqual({
    met: true,
    answered: 10,
    correct: 7,
    label: '10 of 10 problems, 70% correct (needs 70%)',
  });
  expect(mathTarget(attempts(9, 9), false).met).toBe(false);
  expect(mathTarget(attempts(10, 6), false).met).toBe(false);
  expect(mathTarget(attempts(1, 1), true)).toMatchObject({
    met: true,
    label: '1 of 1 correct problem',
  });
  expect(mathTarget([], true)).toMatchObject({ met: false, label: '0 of 1 correct problem' });
});

test('10 problems at 70% passes the full version', async () => {
  const { decideVerdict, run } = await setup(sampleToday(), attempts(10, 7));
  expect(await run()).toEqual([openTask]);
  expect(decideVerdict).toHaveBeenCalledWith(openTask, { day: DAY, outcome: 'pass' });
});

test('9 problems, or 60%, does not', async () => {
  for (const saved of [attempts(9, 9), attempts(10, 6)]) {
    const { decideVerdict, run } = await setup(sampleToday(), saved);
    expect(await run()).toEqual([]);
    expect(decideVerdict).not.toHaveBeenCalled();
  }
});

test('small version on a bad day', async () => {
  const bad = sampleToday({ dayRecord: { day: DAY, kind: 'bad' } });
  const { decideVerdict, run } = await setup(bad, attempts(1, 1));
  expect(await run()).toEqual([openTask]);
  expect(decideVerdict).toHaveBeenCalledTimes(1);
});

test('sent once', async () => {
  const { decideVerdict, run } = await setup(sampleToday(), attempts(10, 10));
  await run();
  expect(await run()).toEqual([]);
  expect(decideVerdict).toHaveBeenCalledTimes(1);
});

test('an already decided task is recorded and not retried', async () => {
  const { decideVerdict, run, services } = await setup(sampleToday(), attempts(10, 10));
  decideVerdict.mockImplementationOnce(
    async () =>
      ({
        ok: false as const,
        error: {
          kind: 'rejected' as const,
          status: 409,
          code: 'verdict_not_pending',
          message: 'x',
        },
      }) as never,
  );
  expect(await run()).toEqual([]);
  expect(await run()).toEqual([]);
  expect(decideVerdict).toHaveBeenCalledTimes(1);
  expect(await services.store.mathTaskDone(openTask)).toBe(true);
});

test('a network failure is retried next time', async () => {
  const { decideVerdict, run } = await setup(sampleToday(), attempts(10, 10));
  decideVerdict.mockImplementationOnce(
    async () => ({ ok: false as const, error: { kind: 'network' as const } }) as never,
  );
  expect(await run()).toEqual([]);
  expect(await run()).toEqual([openTask]);
});

test('excused on an away day: nothing sent', async () => {
  const away = sampleToday({
    dayRecord: {
      day: DAY,
      kind: 'away',
      away: { place: 'X', keptTaskIds: [], verified: 'pending' },
    },
  });
  const { decideVerdict, run } = await setup(away, attempts(10, 10));
  expect(await run()).toEqual([]);
  expect(decideVerdict).not.toHaveBeenCalled();
});

test('a draft plan, or another day, sends nothing', async () => {
  const draft = sampleToday();
  const drafted = { ...draft, plan: { ...draft.plan!, status: 'draft' as const } };
  for (const today of [drafted, sampleToday({ day: '2026-10-13' })]) {
    const { decideVerdict, run } = await setup(today, attempts(10, 10));
    expect(await run()).toEqual([]);
    expect(decideVerdict).not.toHaveBeenCalled();
  }
});
