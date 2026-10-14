import { Link } from 'expo-router';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { formatDayLabel, formatDuration, formatTime, localOffsetMinutes } from '@/lib/format';
import type { SyncReport } from '@/lib/store/types';
import { space, usePalette } from '@/theme';
import { TaskRow } from './task-row';
import { useToday } from './use-today';

const DAY_KIND: Readonly<Record<string, string>> = { bad: 'Bad day', away: 'Away' };

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
  const { forgetPairing } = useApp();
  const view = useToday();
  const { loaded, syncing, tried, saved, ledgerComplete, balanceSeconds, lastSync, refresh } = view;
  const center = [styles.center, { backgroundColor: c.background }];

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
  const dayKind = today.dayRecord ? DAY_KIND[today.dayRecord.kind] : undefined;
  const tasks = today.plan?.tasks ?? [];
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.body}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void refresh()} />}
    >
      {notice !== null && <Banner tone="warning" message={notice} />}
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
      <View style={styles.dayRow}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>
          {formatDayLabel(today.day)}
        </Text>
        {dayKind !== undefined && (
          <Text style={[styles.caption, { color: c.muted }]}>{dayKind}</Text>
        )}
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
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              verdict={today.verdicts.find((v) => v.taskId === task.id)}
            />
          ))}
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
  empty: { gap: space.xs },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  list: { gap: space.sm },
  link: { fontSize: 15, paddingVertical: space.md, textAlign: 'center' },
});
