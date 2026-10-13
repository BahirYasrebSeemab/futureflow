import type { LedgerEvent } from '@mflow/core';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { makeDeps } from '../src/app';
import { rollover } from '../src/upkeep/rollover';
import { call, event, makeApp, pairDevice, type Clock } from './helpers';

async function setup(events: LedgerEvent[]) {
  const clock: Clock = { now: Date.UTC(2026, 9, 10, 4, 30) }; // the 10th, just after the boundary
  const app = makeApp(clock);
  const { token } = await pairDevice(app);
  if (events.length > 0) await call(app, 'POST', '/v1/ledger/events', { token, body: { events } });
  const deps = makeDeps(env, { now: () => clock.now });
  const ledger = async () =>
    (await call<{ events: LedgerEvent[] }>(app, 'GET', '/v1/ledger', { token })).body.data.events;
  return { deps, ledger, clock };
}

describe('rollover', () => {
  it("expires yesterday's leftover and pays today's base grant, once", async () => {
    const yesterday = '2026-10-09';
    const { deps, ledger } = await setup([
      event({ kind: 'base_grant', seconds: 900, day: yesterday, at: Date.UTC(2026, 9, 9, 8) }),
      event({ kind: 'usage_spend', seconds: -300, day: yesterday, at: Date.UTC(2026, 9, 9, 9) }),
    ]);

    expect(await rollover(deps)).toEqual({ expiredSeconds: 600, granted: true });
    expect(await rollover(deps)).toEqual({ expiredSeconds: 0, granted: false });

    const kinds = (await ledger()).map((e) => [e.kind, e.day, e.seconds]);
    expect(kinds).toContainEqual(['expire', yesterday, -600]);
    expect(kinds).toContainEqual(['base_grant', '2026-10-10', 900]);
    expect(kinds.filter(([k]) => k === 'expire')).toHaveLength(1);
  });

  it('lets unused time pay off earlier debt instead of expiring', async () => {
    const { deps } = await setup([
      event({
        kind: 'usage_spend',
        seconds: -1200,
        day: '2026-10-08',
        at: Date.UTC(2026, 9, 8, 9),
      }),
      event({ kind: 'base_grant', seconds: 900, day: '2026-10-09', at: Date.UTC(2026, 9, 9, 8) }),
    ]);
    expect((await rollover(deps))?.expiredSeconds).toBe(0); // running balance −300: nothing to expire
  });

  it('does nothing before a device is paired', async () => {
    expect(await rollover(makeDeps(env, { now: () => Date.UTC(2026, 9, 10, 5) }))).toBeNull();
  });
});

describe('rewards paid to yesterday after it expired', () => {
  it('stay usable that day and expire at the next boundary (no permanent carry-over)', async () => {
    const { deps, ledger, clock } = await setup([
      event({ kind: 'base_grant', seconds: 900, day: '2026-10-09', at: Date.UTC(2026, 9, 9, 8) }),
    ]);
    await rollover(deps); // the 10th 04:30: the 9th's 900 expires, the 10th's base is paid
    await call0(
      deps,
      event({
        kind: 'task_reward',
        seconds: 1800,
        refId: 'late',
        day: '2026-10-09',
        at: Date.UTC(2026, 9, 10, 9),
      }),
    );

    clock.now = Date.UTC(2026, 9, 11, 4, 30);
    await rollover(deps);
    clock.now = Date.UTC(2026, 9, 12, 4, 30);
    await rollover(deps);

    const balance = (await ledger()).reduce((sum, e) => sum + e.seconds, 0);
    expect(balance).toBe(900); // only the 12th's base grant is left
  });
});

/** Writes an event as the server would (a late reward from verification). */
async function call0(deps: ReturnType<typeof makeDeps>, e: LedgerEvent) {
  await deps.repos.ledger.insert([e], null, Date.UTC(2026, 9, 10, 9));
}
