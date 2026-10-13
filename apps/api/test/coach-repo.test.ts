import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { d1Repos } from '../src/adapters/d1';
import type { CoachMessage } from '../src/ports';
import { T0 } from './helpers';

const owner = (id: string, day: string, text = 'hi'): CoachMessage => ({
  id,
  role: 'owner',
  kind: 'chat',
  text,
  day,
  createdAt: T0,
});

describe('coach repository', () => {
  it('stores an owner message once and links the reply', async () => {
    const repo = d1Repos(env.DB).coach;
    expect(await repo.addOwnerMessage(owner('m1', '2026-10-09'))).toBe(true);
    expect(await repo.addOwnerMessage(owner('m1', '2026-10-09', 'again'))).toBe(false);
    expect(await repo.replyTo('m1')).toBeNull();
    await repo.addCoachMessage({
      ...owner('r1', '2026-10-09', 'reply'),
      role: 'coach',
      replyTo: 'm1',
    });
    expect((await repo.replyTo('m1'))?.text).toBe('reply');
    const page = await repo.page(0, 10);
    expect(page.messages.map((m) => m.text)).toEqual(['hi', 'reply']);
  });

  it('returns recent messages oldest first and the latest summary', async () => {
    const repo = d1Repos(env.DB).coach;
    await repo.addOwnerMessage(owner('a', '2026-10-01', 'old'));
    await repo.addOwnerMessage(owner('b', '2026-10-08', 'new'));
    await repo.saveSummary('2026-W40', 'week 40', T0);
    await repo.saveSummary('2026-W41', 'week 41', T0);

    expect((await repo.recent('2026-10-02', 10)).map((m) => m.text)).toEqual(['new']);
    expect(await repo.latestSummary()).toBe('week 41');
    expect([await repo.hasSummary('2026-W40'), await repo.hasSummary('2026-W39')]).toEqual([
      true,
      false,
    ]);
    expect((await repo.messagesForWeek('2026-W40')).map((m) => m.text)).toEqual(['old']);
  });

  it('deletes old chat only when its week is summarized, and anything past the hard limit', async () => {
    const repo = d1Repos(env.DB).coach;
    await repo.addOwnerMessage(owner('summarized', '2026-08-31')); // 2026-W36
    await repo.addOwnerMessage(owner('unsummarized', '2026-09-01')); // also W36 → summarized below
    await repo.addOwnerMessage(owner('w35', '2026-08-28')); // 2026-W35, not summarized
    await repo.addOwnerMessage(owner('ancient', '2026-07-01')); // past the hard limit
    await repo.saveSummary('2026-W36', 's', T0);

    const deleted = await repo.deleteOld('2026-09-09', '2026-08-10');

    expect(deleted).toBe(3);
    expect((await repo.page(0, 10)).messages.map((m) => m.id)).toEqual(['w35']);
  });

  it('tracks nightly runs, guard cursors and gaps', async () => {
    const repo = d1Repos(env.DB).upkeep;
    expect(await repo.nightlyDone('2026-10-09')).toBe(false);
    await repo.markNightly('2026-10-09', T0);
    expect(await repo.nightlyDone('2026-10-09')).toBe(true);

    expect(await repo.guardCursor('d1')).toBe(0);
    await repo.setGuardCursor('d1', 7);
    expect(await repo.guardCursor('d1')).toBe(7);

    const gap = { kind: 'phone_off' as const, from: T0, to: T0 + 3_600_000 };
    await repo.addGaps('d1', [gap, gap], () => '2026-10-09', T0);
    expect(await repo.gapsForDay('2026-10-09')).toEqual([gap]);
  });
});
