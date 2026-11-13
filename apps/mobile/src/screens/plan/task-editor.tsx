import type { TaskSpec } from '@futureflow/core';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/button';
import { formatDuration } from '@/lib/format';
import { minutesOf, taskProblems, type TaskEdit } from '@/lib/plan-draft';
import { radius, space, usePalette } from '@/theme';
import { TextField } from '@/components/text-field';

type Props = Readonly<{
  task: TaskSpec;
  index: number;
  locked: boolean;
  onEdit: (edit: TaskEdit) => void;
  onRemove: () => void;
}>;

export function TaskEditor({ task, index, locked, onEdit, onRemove }: Props) {
  const c = usePalette();
  const card = [styles.card, { backgroundColor: c.surface, borderColor: c.border }];

  if (locked) {
    return (
      <View style={card} testID={`task-${index}`}>
        <Text style={[styles.title, { color: c.text }]}>{task.full.title}</Text>
        <Text style={[styles.body, { color: c.muted }]}>Done when: {task.full.criteria}</Text>
        <Text style={[styles.body, { color: c.muted }]}>When: {task.when}</Text>
        <Text style={[styles.body, { color: c.text }]}>
          Earns {formatDuration(task.full.seconds)}
        </Text>
      </View>
    );
  }

  const field = (label: string, value: string, key: keyof TaskEdit, testID?: string) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      <TextField
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onEdit({ [key]: text })}
        multiline // long plan text wraps instead of hiding its start on a narrow phone
      />
    </View>
  );
  return (
    <View style={card} testID={`task-${index}`}>
      {field('Task', task.full.title, 'title', `title-${index}`)}
      {field('Done when', task.full.criteria, 'criteria', `criteria-${index}`)}
      {field('When', task.when, 'when', `when-${index}`)}
      <View style={styles.field}>
        <Text style={[styles.label, { color: c.muted }]}>Minutes</Text>
        <TextField
          testID={`minutes-${index}`}
          accessibilityLabel="Minutes"
          keyboardType="number-pad"
          value={String(minutesOf(task))}
          onChangeText={(text) => {
            const minutes = Number.parseInt(text, 10);
            if (Number.isFinite(minutes)) onEdit({ minutes });
          }}
        />
      </View>
      {field('2-minute version', task.twoMinute.title, 'smallTitle', `small-${index}`)}
      {taskProblems([task]).map((p) => (
        <Text key={p.message} style={[styles.problem, { color: c.dangerText }]}>
          {p.message}
        </Text>
      ))}
      <Button testID={`remove-${index}`} label="Remove" variant="secondary" onPress={onRemove} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: space.sm },
  title: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  field: { gap: space.xs },
  label: { fontSize: 13, fontWeight: '600' },
  problem: { fontSize: 14 },
});
