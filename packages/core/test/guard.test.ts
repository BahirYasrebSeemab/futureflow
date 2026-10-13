import { describe, expect, it } from 'vitest';
import { analyzeBeats, overlapMs, type Beat } from '../src/guard';
import { DEFAULT_RULES } from '../src/rules';

const MIN = 60_000;
const beat = (minute: number, over: Partial<Beat> = {}): Beat => ({
  at: minute * MIN,
  bootId: 'boot-1',
  uptimeSeconds: minute * 60 + 3600,
  guardEnabled: true,
  ...over,
});

describe('analyzeBeats', () => {
  it('treats a late beat (under two intervals) as no gap', () => {
    expect(analyzeBeats([beat(0), beat(15), beat(44)], DEFAULT_RULES)).toEqual([]);
  });

  it('calls a silence that ends with a new boot "phone off"', () => {
    const gaps = analyzeBeats(
      [beat(0), beat(600, { bootId: 'boot-2', uptimeSeconds: 120 })],
      DEFAULT_RULES,
    );
    expect(gaps).toEqual([{ kind: 'phone_off', from: 0, to: 600 * MIN }]);
  });

  it('calls a silence that ends with an uptime shorter than the silence "phone off", even with the same boot id', () => {
    const gaps = analyzeBeats([beat(0), beat(120, { uptimeSeconds: 600 })], DEFAULT_RULES);
    expect(gaps).toEqual([{ kind: 'phone_off', from: 0, to: 120 * MIN }]);
  });

  it('calls a silence without a reboot "guard disabled"', () => {
    expect(analyzeBeats([beat(0), beat(120)], DEFAULT_RULES)).toEqual([
      { kind: 'guard_disabled', from: 0, to: 120 * MIN },
    ]);
  });

  it('counts time after a beat reporting the guard off as "guard disabled", merging neighbours', () => {
    const beats = [
      beat(0),
      beat(15, { guardEnabled: false }),
      beat(30, { guardEnabled: false }),
      beat(45),
      beat(60),
    ];
    expect(analyzeBeats(beats, DEFAULT_RULES)).toEqual([
      { kind: 'guard_disabled', from: 15 * MIN, to: 45 * MIN },
    ]);
  });

  it('phone off overnight, then the guard off for two hours: only the second is a miss', () => {
    const beats = [
      beat(0),
      beat(600, { bootId: 'boot-2', uptimeSeconds: 60 }),
      beat(615, { bootId: 'boot-2', uptimeSeconds: 960 }),
      beat(735, { bootId: 'boot-2', uptimeSeconds: 8160 }),
    ];
    expect(analyzeBeats([...beats].reverse(), DEFAULT_RULES)).toEqual([
      { kind: 'phone_off', from: 0, to: 600 * MIN },
      { kind: 'guard_disabled', from: 615 * MIN, to: 735 * MIN },
    ]);
  });
});

describe('overlapMs', () => {
  it('measures how much of a window a kind of gap covers', () => {
    const gaps = [
      { kind: 'phone_off' as const, from: 0, to: 100 },
      { kind: 'guard_disabled' as const, from: 100, to: 200 },
      { kind: 'phone_off' as const, from: 300, to: 400 },
    ];
    expect(overlapMs(gaps, 'phone_off', 50, 350)).toBe(100);
    expect(overlapMs(gaps, 'guard_disabled', 0, 1000)).toBe(100);
  });
});
