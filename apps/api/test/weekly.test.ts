import type { FetchLike } from '@mflow/ai';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { d1Repos } from '../src/adapters/d1';
import { makeDeps } from '../src/app';
import { runWeekly } from '../src/upkeep/weekly';
import { geminiReply, makeApp, pairDevice, T0, type Clock } from './helpers';

const MONDAY = Date.UTC(2026, 9, 12, 10); // Monday the 12th; last week is 2026-W41 (5–11 Oct)

async function setup(fetch?: FetchLike) {
  const clock: Clock = { now: MONDAY };
  await pairDevice(makeApp(clock));
  const repo = d1Repos(env.DB).coach;
  const msg = (id: string, day: string) =>
    repo.addOwnerMessage({
      id,
      role: 'owner',
      kind: 'chat',
      text: `note ${id}`,
      day,
      createdAt: T0,
    });
  const deps = () =>
    makeDeps(
      { ...env, GEMINI_API_KEY: 'g-key' },
      { now: () => clock.now, ...(fetch === undefined ? {} : { fetch }) },
    );
  return { clock, repo, msg, deps };
}

describe('weekly memory', () => {
  it("summarizes last week's chat once on Monday", async () => {
    let calls = 0;
    const { repo, msg, deps } = await setup(async () => {
      calls += 1;
      return geminiReply('Shipped two fixes; reading slipped midweek.');
    });
    await msg('a', '2026-10-07');

    const first = await runWeekly(deps());
    const second = await runWeekly(deps());

    expect(first.summarized).toBe('2026-W41');
    expect(second.summarized).toBeNull();
    expect(calls).toBe(1);
    expect(await repo.latestSummary()).toBe('Shipped two fixes; reading slipped midweek.');
  });

  it('retries a failed summary on a later Monday tick', async () => {
    let down = true;
    const { msg, deps } = await setup(async () =>
      down ? { status: 503, text: async () => '{}' } : geminiReply('ok'),
    );
    await msg('a', '2026-10-07');

    expect((await runWeekly(deps())).summarized).toBeNull();
    down = false;
    expect((await runWeekly(deps())).summarized).toBe('2026-W41');
  });

  it('deletes old chat by the retention rules, then summarizes the oldest unsummarized week on any day', async () => {
    const { clock, repo, msg, deps } = await setup(async () => geminiReply('s'));
    await msg('old-summarized', '2026-09-01');
    await msg('old-unsummarized', '2026-09-08');
    await msg('ancient', '2026-08-01');
    await repo.saveSummary('2026-W36', 'w36', T0);
    clock.now = Date.UTC(2026, 9, 14, 10); // Wednesday

    const result = await runWeekly(deps());

    expect(result).toEqual({ summarized: '2026-W37', deleted: 2 });
    expect((await repo.page(0, 10)).messages.map((m) => m.id)).toEqual(['old-unsummarized']);
  });

  it('a week the AI could not summarize on Monday is summarized on a later day', async () => {
    let down = true;
    const { clock, msg, deps } = await setup(async () =>
      down ? { status: 503, text: async () => '{}' } : geminiReply('ok'),
    );
    await msg('a', '2026-10-07');
    expect((await runWeekly(deps())).summarized).toBeNull();
    down = false;
    clock.now = Date.UTC(2026, 9, 13, 10); // Tuesday
    expect((await runWeekly(deps())).summarized).toBe('2026-W41');
  });

  it('never summarizes the current week', async () => {
    const { msg, deps } = await setup(async () => geminiReply('s'));
    await msg('now', '2026-10-12'); // this week (W42)
    expect((await runWeekly(deps())).summarized).toBeNull();
  });
});
