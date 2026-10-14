import { StyleSheet, Text, View } from 'react-native';
import type { Today } from '@/lib/api/client';
import { formatDuration } from '@/lib/format';
import { radius, space, usePalette } from '@/theme';

type Task = NonNullable<Today['plan']>['tasks'][number];
type Verdict = Today['verdicts'][number];

const STATUS: Record<Verdict['outcome'], string> = {
  pass: 'Passed',
  fail: 'Not passed',
  pending: 'Checking',
};

export function TaskRow({ task, verdict }: { task: Task; verdict: Verdict | undefined }) {
  const c = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.title, { color: c.text }]}>{task.full.title}</Text>
      <Text style={[styles.criteria, { color: c.muted }]}>{task.full.criteria}</Text>
      <View style={styles.meta}>
        <Text style={[styles.metaText, { color: c.muted }]}>
          Earns {formatDuration(task.full.seconds)}
        </Text>
        <Text style={[styles.metaText, { color: c.text }]}>
          {verdict ? STATUS[verdict.outcome] : 'Not checked yet'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: space.xs },
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
