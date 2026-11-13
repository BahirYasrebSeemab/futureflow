import { StyleSheet, Text, View } from 'react-native';
import type { Today } from '@/lib/api/client';
import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { formatDuration } from '@/lib/format';
import { type Palette, radius, shadow, space, usePalette } from '@/theme';

type Task = NonNullable<Today['plan']>['tasks'][number];
type Verdict = Today['verdicts'][number];

/** How the day type changes a task: bad days count the 2-minute version; away days excuse some. */
export type TaskMode = 'full' | 'small' | 'excused';

const STATUS: Record<Verdict['outcome'], string> = {
  pass: 'Passed',
  fail: 'Not passed',
  pending: 'Checking',
};

type Props = Readonly<{
  task: Task;
  verdict: Verdict | undefined;
  mode: TaskMode;
  /** Progress toward the task's target (math tasks), shown under the reward line. */
  detail?: string;
  /** False while another task follows on the path, so the rail continues to it. */
  last?: boolean;
  /** Present only when the owner may answer for this task. */
  onDecide?: (outcome: 'pass' | 'fail') => void;
}>;

const SUGGESTION = {
  pass: 'The checker thinks: done',
  fail: 'The checker thinks: not done',
} as const;

/** The dot on the path: icon and colours for each state. */
function marker(c: Palette, status: string): { icon: IconName; fg: string; bg: string } {
  switch (status) {
    case 'Passed':
      return { icon: 'check', fg: c.accentText, bg: c.success };
    case 'Not passed':
      return { icon: 'close', fg: c.dangerText, bg: c.dangerBg };
    case 'Checking':
      return { icon: 'hourglass-top', fg: c.gold, bg: c.goldSoft };
    case 'Excused':
      return { icon: 'remove', fg: c.muted, bg: c.track };
    default:
      return { icon: 'radio-button-unchecked', fg: c.accentSoftText, bg: c.accentSoft };
  }
}

export function TaskRow({ task, verdict, mode, detail, last = true, onDecide }: Props) {
  const c = usePalette();
  const version = mode === 'small' ? task.twoMinute : task.full;
  const status =
    mode === 'excused' ? 'Excused' : verdict ? STATUS[verdict.outcome] : 'Not checked yet';
  const dot = marker(c, status);
  return (
    <View style={[styles.step, mode === 'excused' && styles.excused]}>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: dot.bg }]}>
          <Icon name={dot.icon} color={dot.fg} size={20} />
        </View>
        {!last && <View style={[styles.line, { backgroundColor: c.border }]} />}
      </View>
      <View
        style={[
          styles.card,
          { backgroundColor: c.surface, borderColor: c.border, boxShadow: shadow.card },
        ]}
      >
        {mode === 'small' && (
          <Text style={[styles.tag, { color: c.accentSoftText }]}>2-minute version</Text>
        )}
        <Text style={[styles.title, { color: c.text }]}>{version.title}</Text>
        <Text style={[styles.criteria, { color: c.muted }]}>{version.criteria}</Text>
        <View style={styles.meta}>
          <View style={[styles.pill, { backgroundColor: c.goldSoft }]}>
            <Icon name="bolt" color={c.gold} size={16} />
            <Text style={[styles.pillText, { color: c.text }]}>
              Earns {formatDuration(version.seconds)}
            </Text>
          </View>
          <Text style={[styles.status, { color: c.muted }]}>{status}</Text>
        </View>
        {detail !== undefined && (
          <Text style={[styles.metaText, { color: c.muted }]}>{detail}</Text>
        )}
        {onDecide !== undefined && (
          <View style={[styles.decide, { borderTopColor: c.border }]}>
            <Text style={[styles.metaText, { color: c.text }]}>Waiting for your answer</Text>
            {verdict?.suggestion !== undefined && (
              <Text style={[styles.metaText, { color: c.muted }]}>
                {SUGGESTION[verdict.suggestion]}
              </Text>
            )}
            <View style={styles.buttons}>
              <View style={styles.button}>
                <Button
                  testID={`did-it-${task.id}`}
                  label="I did it"
                  icon="check"
                  variant="success"
                  haptic={false}
                  onPress={() => onDecide('pass')}
                />
              </View>
              <View style={styles.button}>
                <Button
                  testID={`not-done-${task.id}`}
                  label="Not done"
                  variant="secondary"
                  onPress={() => onDecide('fail')}
                />
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: space.md },
  // The rail runs from each dot to the next, so the day reads as one path.
  rail: { alignItems: 'center', width: 36 },
  dot: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  line: { width: 3, flex: 1, borderRadius: 2, marginTop: space.xs },
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: space.md,
    gap: space.xs,
    marginBottom: space.md,
  },
  excused: { opacity: 0.6 },
  tag: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: 17, fontWeight: '700' },
  criteria: { fontSize: 15, lineHeight: 21 },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
  },
  pillText: { fontSize: 13, fontWeight: '700' },
  status: { fontSize: 14, fontWeight: '700' },
  metaText: { fontSize: 14 },
  decide: {
    gap: space.sm,
    marginTop: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  buttons: { flexDirection: 'row', gap: space.sm },
  button: { flex: 1 },
});
