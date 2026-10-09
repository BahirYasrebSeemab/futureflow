import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES as R } from '../src/rules';
import { expireDay, spend, unlock } from '../src/spending';
import { ctx, ev } from './fixtures';

const TEN_MIN_MS = 600_000;

describe('spend', () => {
  it('creates a negative usage_spend event', () => {
    expect(spend(120, ctx())).toEqual({
      ok: true,
      value: { id: 'new-1', day: '2026-10-08', at: 1_000, kind: 'usage_spend', seconds: -120 },
    });
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid amount %s', (seconds) => {
    expect(spend(seconds, ctx())).toEqual({ ok: false, error: 'invalid_amount' });
  });
});

describe('expireDay', () => {
  it('expires a positive leftover balance', () => {
    const day = [
      ev({ kind: 'base_grant', seconds: 900 }),
      ev({ kind: 'usage_spend', seconds: -600 }),
    ];
    expect(expireDay(day, ctx())).toMatchObject({ kind: 'expire', seconds: -300 });
  });

  it('lets unused time pay off earlier overspend instead of expiring it', () => {
    const history = [
      ev({ kind: 'base_grant', seconds: 900, day: '2026-10-08' }),
      ev({ kind: 'usage_spend', seconds: -1200, day: '2026-10-08' }),
      ev({ kind: 'base_grant', seconds: 900, day: '2026-10-09' }),
      ev({ kind: 'usage_spend', seconds: -300, day: '2026-10-09' }),
    ];
    // day 9 has +600 left, but 300 of it pays yesterday's -300 debt; only 300 expires
    expect(expireDay(history, ctx({ day: '2026-10-09' }))).toMatchObject({
      kind: 'expire',
      seconds: -300,
    });
  });

  it('expires only the given day leftover, never an older day still awaiting its own expiry', () => {
    const history = [
      ev({ kind: 'base_grant', seconds: 900, day: '2026-10-08' }),
      ev({ kind: 'base_grant', seconds: 900, day: '2026-10-09' }),
      ev({ kind: 'usage_spend', seconds: -300, day: '2026-10-09' }),
    ];
    expect(expireDay(history, ctx({ day: '2026-10-09' }))).toMatchObject({ seconds: -600 });
  });

  it('returns null while an older debt still exceeds the day leftover', () => {
    const history = [
      ev({ kind: 'usage_spend', seconds: -1000, day: '2026-10-08' }),
      ev({ kind: 'base_grant', seconds: 900, day: '2026-10-09' }),
    ];
    expect(expireDay(history, ctx({ day: '2026-10-09' }))).toBeNull();
  });

  it('returns null when nothing is left or the balance is negative', () => {
    expect(expireDay([], ctx())).toBeNull();
    expect(expireDay([ev({ kind: 'usage_spend', seconds: -60 })], ctx())).toBeNull();
  });
});

describe('unlock', () => {
  const now = 10_000_000;
  const good = { reason: '  need to reply to a group project  ', waitStartedAt: now - TEN_MIN_MS };

  it('grants borrowed time and stores the trimmed reason', () => {
    expect(unlock([], good, ctx({ at: now }), R)).toEqual({
      ok: true,
      value: {
        id: 'new-1',
        day: '2026-10-08',
        at: now,
        kind: 'unlock_borrow',
        seconds: 600,
        reason: 'need to reply to a group project',
      },
    });
  });

  it.each(['need it', '                    ', 'x'.repeat(19)])(
    'rejects short reason %j',
    (reason) => {
      expect(unlock([], { ...good, reason }, ctx({ at: now }), R)).toEqual({
        ok: false,
        error: 'reason_too_short',
      });
    },
  );

  it('rejects before the 10-minute wait is over', () => {
    const early = { ...good, waitStartedAt: now - TEN_MIN_MS + 1_000 };
    expect(unlock([], early, ctx({ at: now }), R)).toEqual({
      ok: false,
      error: 'wait_not_finished',
    });
  });

  it('allows at most two unlocks per day', () => {
    const day = [
      ev({ kind: 'unlock_borrow', seconds: 600 }),
      ev({ kind: 'unlock_borrow', seconds: 600 }),
    ];
    expect(unlock(day, good, ctx({ at: now }), R)).toEqual({
      ok: false,
      error: 'daily_limit_reached',
    });
  });
});
