import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { formatDayLabel, formatTime, localOffsetMinutes } from '@/lib/format';
import { lockProblems, taskProblems } from '@/lib/plan-draft';
import { space, usePalette } from '@/theme';
import { TaskEditor } from './task-editor';
import { usePlan } from './use-plan';

const SOURCE_LABEL = { ai: 'Suggested by your coach', template: 'From your roadmap' } as const;

export function PlanScreen() {
  const c = usePalette();
  const plan = usePlan();
  const [picking, setPicking] = useState(false);
  const { day, saved, tasks, busy, dirty } = plan;
  const locked = saved?.status === 'locked';

  const confirmLock = () =>
    Alert.alert(
      'Lock this plan?',
      "A locked plan can't change. Tasks pay only once the plan is locked.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Lock', onPress: () => void plan.lock() },
      ],
    );

  const sizeProblems = lockProblems(tasks).filter((p) => p.taskId === null);
  const canSave = dirty && taskProblems(tasks).length === 0 && !busy;
  const canLock = lockProblems(tasks).length === 0 && !busy;

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.body}>
      <View style={styles.switcher}>
        {(['today', 'tomorrow'] as const).map((which) => (
          <View key={which} style={styles.switch}>
            <Button
              testID={`plan-${which}`}
              label={which === 'today' ? 'Today' : 'Tomorrow'}
              variant={plan.target === which ? 'primary' : 'secondary'}
              disabled={dirty}
              onPress={() => plan.setTarget(which)}
            />
          </View>
        ))}
      </View>
      <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>
        {plan.target === 'today' ? 'Plan today' : 'Plan tomorrow'}
      </Text>
      {day !== null && (
        <Text style={[styles.muted, { color: c.muted }]}>{formatDayLabel(day)}</Text>
      )}
      {plan.message !== null && <Banner tone="warning" message={plan.message} />}

      {plan.loading ? (
        <ActivityIndicator color={c.accent} />
      ) : day === null ? null : plan.loadFailed ? (
        <Button
          testID="reload-plan"
          label="Try again"
          variant="secondary"
          onPress={() => void plan.reload()}
        />
      ) : saved === null && tasks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No plan yet</Text>
          <Text style={[styles.muted, { color: c.muted }]}>
            Your coach suggests 3 to 5 tasks from your roadmap. You can change every one.
          </Text>
          <Button
            testID="propose"
            label={busy ? 'Proposing…' : 'Propose a plan'}
            disabled={busy}
            onPress={() => void plan.propose()}
          />
        </View>
      ) : (
        <View style={styles.list}>
          {locked && saved?.lockedAt !== undefined && (
            <Text style={[styles.caption, { color: c.muted }]}>
              Locked at {formatTime(saved.lockedAt, localOffsetMinutes(saved.lockedAt))}
            </Text>
          )}
          {!locked && plan.source !== null && (
            <Text style={[styles.caption, { color: c.muted }]}>{SOURCE_LABEL[plan.source]}</Text>
          )}
          {tasks.map((task, index) => (
            <TaskEditor
              key={task.id}
              task={task}
              index={index}
              locked={locked}
              onEdit={(edit) => plan.edit(task.id, edit)}
              onRemove={() => plan.remove(task.id)}
            />
          ))}
          {!locked && (
            <>
              <Button
                testID="add-task"
                label="Add a task"
                variant="secondary"
                onPress={() => setPicking((p) => !p)}
              />
              {picking &&
                (plan.skills.length === 0 ? (
                  <Text style={[styles.muted, { color: c.muted }]}>
                    Add skills to your roadmap first.
                  </Text>
                ) : (
                  plan.skills.map((skill) => (
                    <Button
                      key={skill.id}
                      label={skill.name}
                      variant="secondary"
                      onPress={() => {
                        plan.add(skill);
                        setPicking(false);
                      }}
                    />
                  ))
                ))}
              {sizeProblems.map((p) => (
                <Text key={p.message} style={[styles.muted, { color: c.dangerText }]}>
                  {p.message}
                </Text>
              ))}
              {dirty && (
                <View style={styles.row}>
                  <Text style={[styles.caption, { color: c.warningText }]}>Unsaved changes</Text>
                  <Button
                    testID="discard"
                    label="Discard"
                    variant="secondary"
                    onPress={plan.discard}
                  />
                </View>
              )}
              <Button
                testID="save-plan"
                label="Save"
                variant="secondary"
                disabled={!canSave}
                onPress={() => void plan.save()}
              />
              <Button
                testID="lock-plan"
                label="Lock plan"
                disabled={!canLock}
                onPress={confirmLock}
              />
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  switcher: { flexDirection: 'row', gap: space.sm },
  switch: { flex: 1 },
  heading: { fontSize: 22, fontWeight: '700' },
  muted: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 14, fontWeight: '500' },
  empty: { gap: space.sm },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
});
