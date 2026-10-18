import type { Rules } from './rules';

export type Beat = Readonly<{
  at: number;
  bootId: string;
  uptimeSeconds: number;
  guardEnabled: boolean;
  /** Uptime when the guard's service last connected; null when it isn't connected. */
  guardSinceUptimeSeconds?: number | null;
}>;
export type GuardGapKind = 'phone_off' | 'guard_disabled';
export type GuardGap = Readonly<{ kind: GuardGapKind; from: number; to: number }>;

/** A silence longer than this many heartbeat intervals is a gap; one late beat is not. */
export const GAP_FACTOR = 2;

const MS_PER_SECOND = 1_000;

/**
 * Spec §6.5. A gap that ends with a new boot (new boot id, or uptime shorter than the silence)
 * means the phone was off: not a miss. A gap without a reboot, or time after a beat that reported
 * the guard off (or on but not running), means the guard was disabled: a miss. Adjacent gaps of one kind are merged.
 * Doze can hold a beat back for hours: a silence isn't a gap when the next beat shows the guard
 * connected since before the previous beat on the same boot.
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
      if (rebooted) push({ kind: 'phone_off', from: a.at, to: b.at });
      else if (!stayedOn(a, b)) push({ kind: 'guard_disabled', from: a.at, to: b.at });
    } else if (!isOn(a)) {
      push({ kind: 'guard_disabled', from: a.at, to: b.at });
    }
  }
  return gaps;
}

/**
 * Switched on in Settings and, where the beat says, actually running: a service Android stopped
 * but left listed as on blocks nothing. Beats without the field (older senders) count as before.
 */
function isOn(beat: Beat): boolean {
  return beat.guardEnabled && beat.guardSinceUptimeSeconds !== null;
}

function stayedOn(a: Beat, b: Beat): boolean {
  const since = b.guardSinceUptimeSeconds;
  return isOn(a) && since !== undefined && since !== null && since <= a.uptimeSeconds;
}

/** Milliseconds of [from, to) covered by gaps of `kind`; overlapping gaps count once. */
export function overlapMs(
  gaps: readonly GuardGap[],
  kind: GuardGapKind,
  from: number,
  to: number,
): number {
  const clipped = gaps
    .filter((g) => g.kind === kind)
    .map((g) => [Math.max(g.from, from), Math.min(g.to, to)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of clipped) {
    const start = Math.max(a, end);
    if (b > start) total += b - start;
    end = Math.max(end, b);
  }
  return total;
}
