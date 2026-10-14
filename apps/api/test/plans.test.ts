import type { Plan, TaskSpec } from '@futureflow/core';
import { describe, expect, it } from 'vitest';
import { call, makeApp, pairDevice, T0, taskSpec, type App, type Clock } from './helpers';

const put = (app: App, token: string, day: string, tasks: readonly TaskSpec[]) =>
  call<Plan>(app, 'PUT', `/v1/plans/${day}`, { token, body: { tasks } });
const lock = (app: App, token: string, day: string) =>
  call<Plan>(app, 'POST', `/v1/plans/${day}/lock`, { token });
const three = () => [taskSpec('A'), taskSpec('B'), taskSpec('C')];

describe('plans', () => {
  it('creates a draft for tomorrow, edits it, and reads it back', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const first = three();
    const second = [taskSpec('D')];

    expect((await put(app, token, '2026-10-10', first)).body.data).toEqual({
      day: '2026-10-10',
      status: 'draft',
      tasks: first,
    });
    await put(app, token, '2026-10-10', second);
    const read = await call<Plan>(app, 'GET', '/v1/plans/2026-10-10', { token });

    expect(read.body.data).toEqual({ day: '2026-10-10', status: 'draft', tasks: second });
  });

  it('locks a plan of 3–5 tasks, after which it cannot change', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await put(app, token, '2026-10-09', three());

    const locked = await lock(app, token, '2026-10-09');
    const edit = await put(app, token, '2026-10-09', three());
    const relock = await lock(app, token, '2026-10-09');

    expect(locked.body.data).toMatchObject({ status: 'locked', lockedAt: T0 });
    expect([edit.status, edit.body.error?.code]).toEqual([409, 'plan_locked']);
    expect([relock.status, relock.body.error?.code]).toEqual([409, 'plan_locked']);
  });

  it.each([
    ['too_few_tasks', 2],
    ['too_many_tasks', 6],
  ])('refuses to lock with %s', async (code, count) => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await put(
      app,
      token,
      '2026-10-09',
      Array.from({ length: count }, () => taskSpec()),
    );
    const reply = await lock(app, token, '2026-10-09');
    expect([reply.status, reply.body.error?.code]).toEqual([422, code]);
  });

  it('refuses duplicate task ids', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const task = taskSpec();
    const reply = await put(app, token, '2026-10-09', [task, task, taskSpec()]);
    expect([reply.status, reply.body.error?.code]).toEqual([422, 'duplicate_task_id']);
  });

  it.each(['2026-10-08', '2026-10-11'])('only edits today or tomorrow, not %s', async (day) => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const reply = await put(app, token, day, three());
    expect([reply.status, reply.body.error?.code]).toEqual([422, 'day_out_of_range']);
  });

  it('switches "today" at 04:00 on the device clock (Dushanbe, UTC+5)', async () => {
    const clock: Clock = { now: Date.UTC(2026, 9, 9, 22, 59) }; // 03:59 on 10-10 in Dushanbe
    const app = makeApp(clock);
    const { token } = await pairDevice(app, { utcOffsetMinutes: 300 });

    const early = await put(app, token, '2026-10-11', three());
    clock.now = Date.UTC(2026, 9, 9, 23, 0); // 04:00: today becomes 10-10
    const onTime = await put(app, token, '2026-10-11', three());

    expect(early.status).toBe(422);
    expect(onTime.status).toBe(200);
  });

  it('answers 404 for a missing plan, both on read and on lock', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    expect((await call(app, 'GET', '/v1/plans/2026-10-09', { token })).status).toBe(404);
    expect((await lock(app, token, '2026-10-09')).status).toBe(404);
  });

  it('refuses to lock outside today or tomorrow', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    expect((await lock(app, token, '2026-10-20')).status).toBe(422);
  });

  it('rejects an invalid day in the path', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    expect((await call(app, 'GET', '/v1/plans/2026-13-01', { token })).status).toBe(400);
  });
});
