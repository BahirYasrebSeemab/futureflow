import { describe, expect, it } from 'vitest';
import {
  AwayRequestSchema,
  AwayVerdictRequestSchema,
  LedgerQuerySchema,
  MathAttemptBatchSchema,
  PairRequestSchema,
  ReadingLogSchema,
  TodaySchema,
} from '../src';

const ID = '01920000-0000-7000-8000-000000000001';

describe('PairRequestSchema', () => {
  const base = { code: 'x'.repeat(16), deviceName: 'Redmi A5', utcOffsetMinutes: 300 };

  it('accepts a pairing request and the full offset range', () => {
    expect(PairRequestSchema.parse(base)).toEqual(base);
    expect(PairRequestSchema.safeParse({ ...base, utcOffsetMinutes: -720 }).success).toBe(true);
    expect(PairRequestSchema.safeParse({ ...base, utcOffsetMinutes: 840 }).success).toBe(true);
  });

  it.each([
    ['short code', { code: 'x'.repeat(15) }],
    ['blank device name', { deviceName: '   ' }],
    ['offset past UTC+14', { utcOffsetMinutes: 841 }],
    ['fractional offset', { utcOffsetMinutes: 30.5 }],
  ])('rejects %s', (_label, over) => {
    expect(PairRequestSchema.safeParse({ ...base, ...over }).success).toBe(false);
  });
});

describe('LedgerQuerySchema', () => {
  it('defaults to the start with a full page and coerces query strings', () => {
    expect(LedgerQuerySchema.parse({})).toEqual({ since: 0, limit: 500 });
    expect(LedgerQuerySchema.parse({ since: '42', limit: '10' })).toEqual({ since: 42, limit: 10 });
  });

  it.each([{ since: '-1' }, { since: 'abc' }, { limit: '501' }, { limit: '0' }])(
    'rejects %j',
    (query) => {
      expect(LedgerQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

describe('AwayRequestSchema', () => {
  const base = { from: '2026-10-01', to: '2026-10-03', place: 'Dushanbe', keptTaskIds: [ID] };

  it('accepts a window of up to 30 days', () => {
    expect(AwayRequestSchema.safeParse(base).success).toBe(true);
    expect(AwayRequestSchema.safeParse({ ...base, to: '2026-10-30' }).success).toBe(true);
  });

  it('rejects a window longer than 30 days or ending before it starts', () => {
    expect(AwayRequestSchema.safeParse({ ...base, to: '2026-10-31' }).success).toBe(false);
    expect(AwayRequestSchema.safeParse({ ...base, to: '2026-09-30' }).success).toBe(false);
  });

  it('reports invalid days without throwing', () => {
    expect(AwayRequestSchema.safeParse({ ...base, from: '2026-13-01' }).success).toBe(false);
  });
});

describe('AwayVerdictRequestSchema', () => {
  it('accepts distances rounded to 10 km only', () => {
    const base = { day: '2026-10-09', verified: 'yes' };
    expect(AwayVerdictRequestSchema.safeParse({ ...base, distanceKm: 20 }).success).toBe(true);
    expect(AwayVerdictRequestSchema.safeParse({ ...base, distanceKm: 15 }).success).toBe(false);
    expect(AwayVerdictRequestSchema.safeParse({ ...base, verified: 'maybe' }).success).toBe(false);
  });
});

describe('ReadingLogSchema', () => {
  const base = {
    id: ID,
    day: '2026-10-09',
    title: 'Atomic Habits',
    source: 'book',
    pages: 12,
    summary: 'Habits compound like interest.',
  };

  it('accepts a log entry', () => {
    expect(ReadingLogSchema.parse(base)).toEqual(base);
  });

  it('rejects a blank or oversized summary', () => {
    expect(ReadingLogSchema.safeParse({ ...base, summary: '   ' }).success).toBe(false);
    expect(ReadingLogSchema.safeParse({ ...base, summary: 'x'.repeat(2001) }).success).toBe(false);
  });
});

describe('MathAttemptBatchSchema', () => {
  const attempt = (i: number) => ({
    id: `01920000-0000-7000-8000-${String(i).padStart(12, '0')}`,
    day: '2026-10-09',
    at: 1,
    topicId: 'L0.fractions',
    difficulty: 3,
    correct: true,
    answerType: 'typed',
  });

  it('accepts 1 to 500 attempts', () => {
    expect(MathAttemptBatchSchema.safeParse({ attempts: [attempt(1)] }).success).toBe(true);
    const full = Array.from({ length: 500 }, (_, i) => attempt(i));
    expect(MathAttemptBatchSchema.safeParse({ attempts: full }).success).toBe(true);
  });

  it('rejects an empty or oversized batch and a difficulty outside 1–5', () => {
    expect(MathAttemptBatchSchema.safeParse({ attempts: [] }).success).toBe(false);
    const big = Array.from({ length: 501 }, (_, i) => attempt(i));
    expect(MathAttemptBatchSchema.safeParse({ attempts: big }).success).toBe(false);
    const hard = { ...attempt(1), difficulty: 6 };
    expect(MathAttemptBatchSchema.safeParse({ attempts: [hard] }).success).toBe(false);
  });
});

describe('TodaySchema', () => {
  it('round-trips a snapshot', () => {
    const today = {
      day: '2026-10-09',
      serverTime: 1,
      plan: null,
      dayRecord: { day: '2026-10-09', kind: 'bad' },
      balanceSeconds: -60,
      earnedTodaySeconds: 900,
    };
    expect(TodaySchema.parse(today)).toEqual(today);
  });
});
