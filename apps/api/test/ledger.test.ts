import type { LedgerEvent } from '@futureflow/core';
import { describe, expect, it } from 'vitest';
import { call, event, makeApp, pairDevice, T0, type App } from './helpers';

type Sync = { added: string[]; ignored: string[]; rejected: { id: string; reason: string }[] };
type Page = { events: LedgerEvent[]; next: number };

const post = (app: App, token: string, events: readonly LedgerEvent[]) =>
  call<Sync>(app, 'POST', '/v1/ledger/events', { token, body: { events } });
const page = (app: App, token: string, query = '') =>
  call<Page>(app, 'GET', `/v1/ledger${query}`, { token });

describe('ledger sync', () => {
  it('stores a batch and pages it back in order with a cursor', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const events = [
      event({ kind: 'base_grant', seconds: 900 }),
      event({ kind: 'usage_spend', seconds: -120 }),
      event({ kind: 'math_reward', seconds: 180, refId: 'attempt-1', reason: 'fractions' }),
    ];

    const sync = await post(app, token, events);
    const first = await page(app, token);
    const rest = await page(app, token, `?since=${first.body.data.next}`);

    expect(sync.body.data).toEqual({ added: events.map((e) => e.id), ignored: [], rejected: [] });
    expect(first.body.data.events).toEqual(events);
    expect(rest.body.data).toEqual({ events: [], next: first.body.data.next });
  });

  it('is idempotent: a resent batch adds nothing', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const events = [event({ kind: 'usage_spend', seconds: -60 })];
    await post(app, token, events);

    const again = await post(app, token, events);

    expect(again.body.data).toEqual({ added: [], ignored: [events[0]?.id], rejected: [] });
    expect((await page(app, token)).body.data.events).toHaveLength(1);
  });

  it('keeps one grant per business key across writers and drops the orphan repayment', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await post(app, token, [
      event({ kind: 'base_grant', seconds: 900 }),
      event({ kind: 'task_reward', seconds: 1200, refId: 'task-1' }),
    ]);
    const dupReward = event({ kind: 'task_reward', seconds: 1200, refId: 'task-1' });
    const incoming = [
      event({ kind: 'base_grant', seconds: 900 }),
      dupReward,
      event({ kind: 'borrow_repay', seconds: -600, refId: dupReward.id }),
      event({ kind: 'usage_spend', seconds: -60 }),
    ];

    const sync = await post(app, token, incoming);

    expect(sync.body.data.added).toEqual([incoming[3]?.id]);
    expect(sync.body.data.ignored).toEqual(incoming.slice(0, 3).map((e) => e.id));
  });

  it('accepts a full 500-event batch in one request', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const events = Array.from({ length: 500 }, () => event({ kind: 'usage_spend', seconds: -60 }));

    const sync = await post(app, token, events);

    expect(sync.body.data.added).toHaveLength(500);
    expect((await page(app, token)).body.data.events).toHaveLength(500);
  });

  it('rejects events stamped more than 5 minutes ahead of server time', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const edge = event({ kind: 'usage_spend', seconds: -60, at: T0 + 300_000 });
    const ahead = event({ kind: 'usage_spend', seconds: -60, at: T0 + 300_001 });

    const sync = await post(app, token, [edge, ahead]);

    expect(sync.body.data).toEqual({
      added: [edge.id],
      ignored: [],
      rejected: [{ id: ahead.id, reason: 'future_timestamp' }],
    });
  });

  it('pages with a limit', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const events = Array.from({ length: 3 }, () => event({ kind: 'usage_spend', seconds: -60 }));
    await post(app, token, events);

    const first = await page(app, token, '?limit=2');
    const second = await page(app, token, `?since=${first.body.data.next}&limit=2`);

    expect(first.body.data.events.map((e) => e.id)).toEqual(events.slice(0, 2).map((e) => e.id));
    expect(second.body.data.events.map((e) => e.id)).toEqual([events[2]?.id]);
  });

  it('shares events between paired devices', async () => {
    const app = makeApp();
    const phone = await pairDevice(app);
    const tablet = await pairDevice(app, { code: 'second-setup-code-0123456789' });
    const events = [event({ kind: 'usage_spend', seconds: -60 })];
    await post(app, phone.token, events);

    expect((await page(app, tablet.token)).body.data.events).toEqual(events);
  });

  it('rejects an invalid batch whole, storing nothing', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const good = event({ kind: 'usage_spend', seconds: -60 });
    const bad = event({ kind: 'usage_spend', seconds: 60 });

    const reply = await post(app, token, [good, bad]);

    expect([reply.status, reply.body.error?.code]).toEqual([400, 'invalid_request']);
    expect((await page(app, token)).body.data.events).toEqual([]);
  });

  it('rejects an invalid query', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    expect((await page(app, token, '?since=-1')).status).toBe(400);
  });

  it('requires a device token', async () => {
    const app = makeApp();
    expect((await call(app, 'GET', '/v1/ledger')).status).toBe(401);
  });
});

describe('review fixes', () => {
  it('drops a repayment sent in a later batch than its duplicate reward', async () => {
    const app = makeApp();
    const phone = await pairDevice(app);
    const tablet = await pairDevice(app, { code: 'second-setup-code-0123456789' });
    const rewardA = event({ kind: 'task_reward', seconds: 1200, refId: 'task-1' });
    await post(app, phone.token, [
      event({ kind: 'unlock_borrow', seconds: 600 }),
      rewardA,
      event({ kind: 'borrow_repay', seconds: -600, refId: rewardA.id }),
    ]);
    const rewardB = event({ kind: 'task_reward', seconds: 1200, refId: 'task-1' });
    await post(app, tablet.token, [rewardB]);

    const repayB = event({ kind: 'borrow_repay', seconds: -600, refId: rewardB.id });
    const sync = await post(app, tablet.token, [repayB]);

    expect(sync.body.data).toEqual({ added: [], ignored: [repayB.id], rejected: [] });
    const total = (await page(app, phone.token)).body.data.events.reduce(
      (sum, e) => sum + e.seconds,
      0,
    );
    expect(total).toBe(1200);
  });

  it('keeps a repayment whose reward arrives in the same batch', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const reward = event({ kind: 'math_reward', seconds: 180, refId: 'a1' });
    const repay = event({ kind: 'borrow_repay', seconds: -180, refId: reward.id });

    const sync = await post(app, token, [
      event({ kind: 'unlock_borrow', seconds: 600 }),
      reward,
      repay,
    ]);

    expect(sync.body.data.added).toContain(repay.id);
  });
});
