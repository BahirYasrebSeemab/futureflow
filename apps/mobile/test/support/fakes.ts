import type { LedgerEvent } from '@futureflow/core';
import type { Today } from '@/lib/api/client';

export const NOW = Date.UTC(2026, 9, 14, 12); // Wednesday 14 October 2026, 12:00 UTC

export const jsonResponse = (status: number, body: unknown): Response =>
  ({ status, json: async () => body }) as unknown as Response;

export const okBody = (data: unknown) => ({ ok: true, data, error: null });
export const errBody = (code: string, message: string) => ({
  ok: false,
  data: null,
  error: { code, message },
});

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');

/** A valid phone-side spend event; `i` keeps ids unique and ordered. */
export const ledgerEvent = (i: number, overrides: Partial<LedgerEvent> = {}): LedgerEvent => ({
  id: `01920000-0000-7000-8000-${hex(i, 12)}`,
  day: '2026-10-14',
  at: NOW - 60_000 + i,
  kind: 'usage_spend',
  seconds: -60,
  ...overrides,
});

const task = (n: number, title: string) => ({
  id: `01920000-0000-7000-8000-00000000a00${n}`,
  skillId: 'math',
  when: 'after breakfast',
  verifier: 'math' as const,
  full: { title, criteria: 'Finish the set with 80% correct', seconds: 1800 },
  twoMinute: { title: 'One problem', criteria: 'Solve one problem', seconds: 120 },
});

export const sampleToday = (overrides: Partial<Today> = {}): Today => ({
  day: '2026-10-14',
  serverTime: NOW,
  plan: {
    day: '2026-10-14',
    status: 'locked',
    tasks: [task(1, 'Fractions practice'), task(2, 'Read chapter 3')],
    lockedAt: NOW - 3_600_000,
  },
  dayRecord: null,
  balanceSeconds: 3900,
  earnedTodaySeconds: 1500,
  verdicts: [
    {
      day: '2026-10-14',
      taskId: task(1, '').id,
      outcome: 'pass',
      confidence: 1,
      by: 'code',
      evidenceIds: [],
    },
  ],
  ...overrides,
});
