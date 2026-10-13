import type { Rules } from './rules';

export type Beat = Readonly<{
  at: number;
  bootId: string;
  uptimeSeconds: number;
  guardEnabled: boolean;
}>;
export type GuardGapKind = 'phone_off' | 'guard_disabled';
export type GuardGap = Readonly<{ kind: GuardGapKind; from: number; to: number }>;

/** A silence longer than this many heartbeat intervals is a gap; one late beat is not. */
export const GAP_FACTOR = 2;

const MS_PER_SECOND = 1_000;

/**
 * Spec §6.5. A gap that ends with a new boot (new boot id, or uptime shorter than the silence)
 * means the phone was off: not a miss. A gap without a reboot, or time after a beat that reported
 * the guard off, means the guard was disabled: a miss. Adjacent gaps of one kind are merged.
 */
export function analyzeBeats(beats: readonly Beat[], rules: Rules): GuardGap[] {
  const sorted = [...beats].sort((a, b) => a.at - b.at);
  const limit = GAP_FACTOR * rules.heartbeatSeconds * MS_PER_SECOND;
  const gaps: GuardGap[] = [];
  const push = (gap: GuardGap) => {
    const last = gaps.at(-1);
    if (last !== undefined && last.kind === gap.kind && last.to === gap.from) {
      gaps[gaps.length - 1] = { ...last, to: gap.to };
    } else {
      gaps.push(gap);
    }
  };
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (a === undefined || b === undefined) continue;
    const silence = b.at - a.at;
    if (silence > limit) {
      const rebooted = b.bootId !== a.bootId || b.uptimeSeconds * MS_PER_SECOND < silence;
      push({ kind: rebooted ? 'phone_off' : 'guard_disabled', from: a.at, to: b.at });
    } else if (!a.guardEnabled) {
      push({ kind: 'guard_disabled', from: a.at, to: b.at });
    }
  }
  return gaps;
}

/** Milliseconds of [from, to) covered by gaps of `kind`. */
export function overlapMs(
  gaps: readonly GuardGap[],
  kind: GuardGapKind,
  from: number,
  to: number,
): number {
  return gaps
    .filter((g) => g.kind === kind)
    .reduce((sum, g) => sum + Math.max(0, Math.min(g.to, to) - Math.max(g.from, from)), 0);
}
