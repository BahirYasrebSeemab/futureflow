import { Link, router } from 'expo-router';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Banner } from '@/components/banner';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { mathTarget } from '@/lib/math/tasks';
import { formatDayLabel, formatDuration, formatTime, localOffsetMinutes } from '@/lib/format';
import type { Today } from '@/lib/api/client';
import type { SyncReport } from '@/lib/store/types';
import { space, usePalette } from '@/theme';
import { TaskRow, type TaskMode } from './task-row';
import { useDayActions } from './use-day-actions';
import { useToday } from './use-today';

type DayRecord = NonNullable<Today['dayRecord']>;

function dayCaption(record: DayRecord | null): string | null {
  if (record === null) return null;
  if (record.kind === 'bad') return 'Bad day: 2-minute versions count';
  if (record.kind === 'away') return `Away: ${record.away?.place ?? ''}`;
  return null;
}

function modeFor(record: DayRecord | null, taskId: string): TaskMode {
  if (record?.kind === 'bad') return 'small';
  if (record?.kind === 'away' && !(record.away?.keptTaskIds ?? []).includes(taskId)) {
    return 'excused';
  }
  return 'full';
}

/** Null when the last sync worked; otherwise why the screen shows saved data. */
function staleNotice(report: SyncReport | null, savedAt: number): string | null {
  if (report === null || report.status === 'ok' || report.status === 'unauthorized') return null;
  const reason =
    report.status === 'offline'
      ? 'Offline.'
      : report.status === 'invalid_response'
        ? 'This app is out of date for the server. Update the app.'
        : 'The server had a problem.';
  return `${reason} Showing what was saved at ${formatTime(savedAt, localOffsetMinutes(savedAt))}.`;
}

export function TodayScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { forgetPairing } = useApp();
  const view = useToday();
  const { loaded, syncing, tried, saved, ledgerComplete, balanceSeconds, lastSync, refresh } = view;
  const center = [styles.center, { backgroundColor: c.background }];
  const actions = useDayActions(saved?.today.day ?? '', refresh);

  if (lastSync?.status === 'unauthorized') {
    return (
      <View style={center}>
        <Banner
          tone="danger"
          message="The server no longer knows this phone. Pair it again with a new setup code; time records not yet sent are kept."
          action={{ label: 'Pair again', onPress: () => void forgetPairing() }}
        />
      </View>
    );
  }

  // A balance is shown only once the whole ledger has arrived, never a partial one.
  if (saved === null || !ledgerComplete) {
    if (!loaded || syncing || !tried) {
      return (
        <View style={center}>
          <ActivityIndicator color={c.accent} />
          <Text style={[styles.muted, { color: c.muted }]}>Loading today…</Text>
        </View>
      );
    }
    return (
      <View style={center}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>
          Can&apos;t load today
        </Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          {lastSync?.status === 'invalid_response'
            ? 'Update the app, then try again.'
            : 'Check the connection, then try again.'}
        </Text>
        <Button testID="retry" label="Retry" onPress={() => void refresh()} />
      </View>
    );
  }

  const { today } = saved;
  const notice = staleNotice(lastSync, saved.savedAt);
  const record = today.dayRecord;
  const caption = dayCaption(record);
  const tasks = today.plan?.tasks ?? [];
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void refresh()} />}
    >
      {notice !== null && <Banner tone="warning" message={notice} />}
      {actions.message !== null && <Banner tone="warning" message={actions.message} />}
      <View style={styles.hero}>
        <Text style={[styles.caption, { color: c.muted }]}>Time left</Text>
        <Text testID="balance" style={[styles.balance, { color: c.text }]}>
          {formatDuration(balanceSeconds)}
        </Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          Earned today {formatDuration(view.earnedSeconds)}
        </Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          Daily allowance {formatDuration(view.allowanceSeconds)}
        </Text>
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            testID="open-plan"
            label="Plan"
            variant="secondary"
            onPress={() => router.push('/plan')}
          />
        </View>
        <View style={styles.action}>
          <Button
            testID="open-coach"
            label="Coach"
            variant="secondary"
            onPress={() => router.push('/coach')}
          />
        </View>
        <View style={styles.action}>
          <Button
            testID="open-more"
            label="More"
            variant="secondary"
            onPress={() => router.push('/more')}
          />
        </View>
        <View style={styles.action}>
          <Button
            testID="open-math"
            label="Math"
            variant="secondary"
            onPress={() => router.push('/math')}
          />
        </View>
        <View style={styles.action}>
          <Button
            testID="open-away"
            label="Away"
            variant="secondary"
            onPress={() => router.push('/away')}
          />
        </View>
        {(record === null || record.kind === 'normal') && (
          <View style={styles.action}>
            <Button
              testID="bad-day"
              label="Bad day"
              variant="secondary"
              disabled={actions.busy}
              onPress={actions.declareBadDay}
            />
          </View>
        )}
      </View>
      <View style={styles.dayRow}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>
          {formatDayLabel(today.day)}
        </Text>
        {caption !== null && <Text style={[styles.caption, { color: c.muted }]}>{caption}</Text>}
      </View>
      {tasks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No plan for today</Text>
          <Text style={[styles.muted, { color: c.muted }]}>
            Plans you lock for a day show up here with what each task earns.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {today.plan?.status === 'draft' && (
            <Text style={[styles.caption, { color: c.muted }]}>Draft plan, not locked yet</Text>
          )}
          {tasks.map((task) => {
            const verdict = today.verdicts.find((v) => v.taskId === task.id);
            const mode = modeFor(record, task.id);
            const canDecide =
              today.plan?.status === 'locked' &&
              verdict?.outcome === 'pending' &&
              mode !== 'excused';
            return (
              <TaskRow
                key={task.id}
                task={task}
                verdict={verdict}
                mode={mode}
                detail={
                  task.verifier === 'math' && verdict?.outcome !== 'pass' && mode !== 'excused'
                    ? mathTarget(view.mathAttempts, mode === 'small').label
                    : undefined
                }
                onDecide={canDecide ? (outcome) => actions.decide(task.id, outcome) : undefined}
              />
            );
          })}
        </View>
      )}
      <Link
        href="/diagnostics"
        testID="diagnostics-link"
        style={[styles.link, { color: c.accent }]}
      >
        Diagnostics
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    gap: space.md,
  },
  body: { padding: space.md, gap: space.lg },
  hero: { gap: space.xs, paddingTop: space.sm },
  caption: { fontSize: 14, fontWeight: '500' },
  balance: { fontSize: 44, fontWeight: '700', fontVariant: ['tabular-nums'] },
  muted: { fontSize: 15, lineHeight: 21 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  heading: { fontSize: 20, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: { flexGrow: 1, flexBasis: 100 },
  empty: { gap: space.xs },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  list: { gap: space.sm },
  link: { fontSize: 15, paddingVertical: space.md, textAlign: 'center' },
});
