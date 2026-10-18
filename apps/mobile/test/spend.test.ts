import { spendEvents } from '@/lib/guard/spend';

// Jest runs in UTC, so the day turns at 04:00Z.
const at = (iso: string) => Date.parse(iso);
let n = 0;
const newId = () => `01920000-0000-7000-8000-${String(++n).padStart(12, '0')}`;

test('a session inside one day becomes one usage_spend ending when it ended', () => {
  const start = at('2026-10-17T10:00:00Z');
  const { events, seq } = spendEvents([{ seq: 1, start, ms: 60_000 }], 0, newId);
  expect(events).toEqual([
    {
      id: expect.any(String),
      day: '2026-10-17',
      at: start + 60_000,
      kind: 'usage_spend',
      seconds: -60,
    },
  ]);
  expect(seq).toBe(1);
});

test('a session across 04:00 is charged to each day', () => {
  const start = at('2026-10-17T03:59:00Z');
  const { events } = spendEvents([{ seq: 4, start, ms: 3 * 60_000 }], 0, newId);
  expect(events.map((e) => [e.day, e.seconds, e.at])).toEqual([
    ['2026-10-16', -60, at('2026-10-17T04:00:00Z')],
    ['2026-10-17', -120, at('2026-10-17T04:02:00Z')],
  ]);
});

test('spend already recorded is skipped', () => {
  const start = at('2026-10-17T10:00:00Z');
  const sessions = [1, 2, 3].map((seq) => ({ seq, start: start + seq * 60_000, ms: 10_000 }));
  const { events, seq } = spendEvents(sessions, 2, newId);
  expect(events).toHaveLength(1);
  expect(events[0]?.at).toBe(start + 3 * 60_000 + 10_000);
  expect(seq).toBe(3);
});

test('time under half a second is dropped, but its session still counts as recorded', () => {
  const start = at('2026-10-17T10:00:00Z');
  const { events, seq } = spendEvents(
    [
      { seq: 1, start, ms: 400 },
      { seq: 2, start, ms: 0 },
      { seq: 3, start, ms: 1_500 },
    ],
    0,
    newId,
  );
  expect(events.map((e) => e.seconds)).toEqual([-2]);
  expect(seq).toBe(3);
});

test('nothing new keeps the watermark', () => {
  expect(spendEvents([], 7, newId)).toEqual({ events: [], seq: 7 });
});
