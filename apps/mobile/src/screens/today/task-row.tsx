import { StyleSheet, Text, View } from 'react-native';
import type { Today } from '@/lib/api/client';
import { formatDuration } from '@/lib/format';
import { radius, space, usePalette } from '@/theme';

type Task = NonNullable<Today['plan']>['tasks'][number];
type Verdict = Today['verdicts'][number];

/** How the day type changes a task: bad days count the 2-minute version; away days excuse some. */
export type TaskMode = 'full' | 'small' | 'excused';

const STATUS: Record<Verdict['outcome'], string> = {
  pass: 'Passed',
  fail: 'Not passed',
  pending: 'Checking',
};

type Props = Readonly<{ task: Task; verdict: Verdict | undefined; mode: TaskMode }>;

export function TaskRow({ task, verdict, mode }: Props) {
  const c = usePalette();
  const version = mode === 'small' ? task.twoMinute : task.full;
  const status =
    mode === 'excused' ? 'Excused' : verdict ? STATUS[verdict.outcome] : 'Not checked yet';
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: c.border },
        mode === 'excused' && styles.excused,
      ]}
    >
      {mode === 'small' && <Text style={[styles.tag, { color: c.muted }]}>2-minute version</Text>}
      <Text style={[styles.title, { color: c.text }]}>{version.title}</Text>
      <Text style={[styles.criteria, { color: c.muted }]}>{version.criteria}</Text>
      <View style={styles.meta}>
        <Text style={[styles.metaText, { color: c.muted }]}>
          Earns {formatDuration(version.seconds)}
        </Text>
        <Text style={[styles.metaText, { color: c.text }]}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: space.xs },
  excused: { opacity: 0.6 },
  tag: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '600' },
  criteria: { fontSize: 15, lineHeight: 21 },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
  },
  metaText: { fontSize: 14 },
});
