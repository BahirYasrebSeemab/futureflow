import type { LedgerEvent, Plan } from '@mflow/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DayKeySchema,
  envelope,
  LedgerEventBatchSchema,
  LedgerEventSchema,
  PlanSchema,
} from '../src/schemas';

const UUID7 = '0199c4a2-7b3e-7c4d-8e5f-0123456789ab';

const event = {
  id: UUID7,
  day: '2026-10-08',
  at: 1_791_500_000_000,
  kind: 'usage_spend',
  seconds: -120,
};

const taskSpec = {
  id: '0199c4a2-7b3e-7c4d-8e5f-0123456789ac',
  skillId: 'swe',
  when: '20:00 at my desk',
  verifier: 'github',
  full: {
    title: 'Finish parser errors',
    criteria: 'commits in parser/ add error handling',
    seconds: 1200,
  },
  twoMinute: { title: 'One parser commit', criteria: 'any commit in parser/', seconds: 300 },
};

describe('DayKeySchema', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(DayKeySchema.safeParse('2026-10-08').success).toBe(true);
    expect(DayKeySchema.safeParse('2026-02-30').success).toBe(false);
  });
});

describe('LedgerEventSchema', () => {
  it('parses a valid event into the domain type', () => {
    const parsed: LedgerEvent = LedgerEventSchema.parse(event);
    expect(parsed).toEqual(event);
  });

  it.each([
    ['unknown kind', { ...event, kind: 'free_money' }],
    ['fractional seconds', { ...event, seconds: 1.5 }],
    ['non-uuid id', { ...event, id: 'e-1' }],
    ['bad day', { ...event, day: '2026-13-01' }],
    ['spend that adds time', { ...event, kind: 'usage_spend', seconds: 100_000 }],
    ['positive expiry', { ...event, kind: 'expire', seconds: 300 }],
    ['negative earning', { ...event, kind: 'task_reward', seconds: -60, refId: 't1' }],
    ['earning above the daily cap', { ...event, kind: 'task_reward', seconds: 9_999_999 }],
    ['spend longer than a day', { ...event, kind: 'usage_spend', seconds: -86_401 }],
  ])('rejects %s', (_label, value) => {
    expect(LedgerEventSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ['earning at the cap', { ...event, kind: 'task_reward', seconds: 7_200, refId: 't1' }],
    ['zero-second capped reward', { ...event, kind: 'math_reward', seconds: 0, refId: 'a1' }],
    ['debt repayment', { ...event, kind: 'borrow_repay', seconds: -600, refId: 'r1' }],
    ['negative correction', { ...event, kind: 'correction', seconds: -120 }],
    ['positive correction', { ...event, kind: 'correction', seconds: 120 }],
  ])('accepts %s', (_label, value) => {
    expect(LedgerEventSchema.safeParse(value).success).toBe(true);
  });
});

describe('LedgerEventBatchSchema', () => {
  it('rejects empty and oversized batches', () => {
    expect(LedgerEventBatchSchema.safeParse({ events: [] }).success).toBe(false);
    const big = { events: Array.from({ length: 501 }, () => event) };
    expect(LedgerEventBatchSchema.safeParse(big).success).toBe(false);
  });

  it('accepts a normal batch', () => {
    expect(LedgerEventBatchSchema.safeParse({ events: [event] }).success).toBe(true);
  });
});

describe('PlanSchema', () => {
  it('parses a plan into the domain type and exports a JSON schema for LLMs', () => {
    const plan: Plan = PlanSchema.parse({ day: '2026-10-09', status: 'draft', tasks: [taskSpec] });
    expect(plan.tasks).toHaveLength(1);
    expect(z.toJSONSchema(PlanSchema)).toMatchObject({ type: 'object' });
  });

  it('rejects a task worth more than the daily cap', () => {
    const greedy = { ...taskSpec, full: { ...taskSpec.full, seconds: 7201 } };
    expect(
      PlanSchema.safeParse({ day: '2026-10-09', status: 'draft', tasks: [greedy] }).success,
    ).toBe(false);
  });
});

describe('envelope', () => {
  const Response = envelope(z.object({ balance: z.number() }));

  it('accepts success and error shapes', () => {
    expect(Response.safeParse({ ok: true, data: { balance: 5 }, error: null }).success).toBe(true);
    expect(
      Response.safeParse({
        ok: false,
        data: null,
        error: { code: 'not_found', message: 'No plan' },
      }).success,
    ).toBe(true);
  });

  it('rejects an error response that also carries data', () => {
    expect(
      Response.safeParse({ ok: false, data: { balance: 5 }, error: { code: 'x', message: 'y' } })
        .success,
    ).toBe(false);
  });
});
