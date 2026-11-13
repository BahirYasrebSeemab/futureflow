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
import { useGuardStatus } from '@/lib/guard/use-guard-status';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { FadeIn } from '@/components/fade-in';
import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { ProgressBar } from '@/components/progress-bar';
import { useApp } from '@/lib/app';
import { mathTarget } from '@/lib/math/tasks';
import { formatDayLabel, formatDuration, formatTime, localOffsetMinutes } from '@/lib/format';
import type { Today } from '@/lib/api/client';
import type { SyncReport } from '@/lib/store/types';
import { radius, shadow, space, type, usePalette } from '@/theme';
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
  const { status: guard } = useGuardStatus();
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
  // Excused tasks (away days) aren't part of the count.
  const counted = tasks.filter((t) => modeFor(record, t.id) !== 'excused');
  const passed = counted.filter((t) =>
    today.verdicts.some((v) => v.taskId === t.id && v.outcome === 'pass'),
  ).length;
  // How much of today's time is still there: what's left over what could have been spent.
  const ofToday = balanceSeconds / Math.max(1, view.allowanceSeconds + view.earnedSeconds);
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
      refreshControl={
        <RefreshControl
          refreshing={syncing}
          onRefresh={() => void refresh()}
          colors={[c.accent]}
          progressBackgroundColor={c.surface}
        />
      }
    >
      {notice !== null && <Banner tone="warning" message={notice} />}
      {actions.message !== null && <Banner tone="warning" message={actions.message} />}
      {guard?.available === true && (!guard.enabled || !guard.connected) && (
        <Banner
          tone="warning"
          message={guard.enabled ? "The guard isn't running" : 'The guard is off'}
          action={{
            testID: 'open-guard',
            label: guard.enabled ? 'Fix it' : 'Turn it on',
            onPress: () => router.push('/guard'),
          }}
        />
      )}
      <FadeIn>
        <View style={[styles.hero, { backgroundColor: c.heroBg, boxShadow: shadow.raised }]}>
          <View style={styles.heroTop}>
            <Text style={[styles.heroLabel, { color: c.heroMuted }]}>Time left</Text>
            <Icon name="hourglass-bottom" color={c.heroMuted} size={22} />
          </View>
          <Text testID="balance" style={[type.display, { color: c.heroText }]}>
            {formatDuration(balanceSeconds)}
          </Text>
          <ProgressBar
            value={ofToday}
            fill={c.heroText}
            track={c.heroTrack}
            height={10}
            label="Time left today"
          />
          {caption !== null && (
            // The kind of day changes what every task needs, so it sits with the time left.
            <View style={[styles.dayKind, { backgroundColor: c.heroText }]}>
              <Icon
                name={record?.kind === 'away' ? 'flight-takeoff' : 'spa'}
                color={c.heroBg}
                size={18}
              />
              <Text style={[styles.dayKindText, { color: c.heroBg }]}>{caption}</Text>
            </View>
          )}
          <View style={styles.heroStats}>
            <View style={[styles.stat, { backgroundColor: c.heroChip }]}>
              <Icon name="bolt" color={c.heroText} size={18} />
              <Text style={[styles.statText, { color: c.heroText }]}>
                Earned today {formatDuration(view.earnedSeconds)}
              </Text>
            </View>
            <View style={[styles.stat, { backgroundColor: c.heroChip }]}>
              <Icon name="wb-sunny" color={c.heroText} size={18} />
              <Text style={[styles.statText, { color: c.heroText }]}>
                Daily allowance {formatDuration(view.allowanceSeconds)}
              </Text>
            </View>
          </View>
        </View>
      </FadeIn>
      <FadeIn delay={80}>
        <View style={styles.tiles}>
          <Tile
            testID="open-away"
            icon="flight-takeoff"
            label="Away"
            detail="Away from home today"
            onPress={() => router.push('/away')}
          />
          {(record === null || record.kind === 'normal') && (
            <Tile
              testID="bad-day"
              icon="spa"
              label="Bad day"
              detail="2-minute versions count"
              disabled={actions.busy}
              onPress={actions.declareBadDay}
            />
          )}
        </View>
      </FadeIn>
      <FadeIn delay={160}>
        <View style={styles.section}>
          <View style={styles.dayRow}>
            <Text accessibilityRole="header" style={[type.heading, { color: c.text }]}>
              {formatDayLabel(today.day)}
            </Text>
            {counted.length > 0 && (
              <Text
                style={[styles.count, { color: c.accentSoftText, backgroundColor: c.accentSoft }]}
              >
                {passed} of {counted.length} done
              </Text>
            )}
          </View>
          {tasks.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={[styles.emptyIcon, { backgroundColor: c.accentSoft }]}>
                <Icon name="event-note" color={c.accentSoftText} size={28} />
              </View>
              <Text style={[type.headline, { color: c.text }]}>No plan for today</Text>
              <Text style={[styles.muted, { color: c.muted }]}>
                Plans you lock for a day show up here with what each task earns.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {today.plan?.status === 'draft' && (
                <Text style={[styles.caption, { color: c.muted }]}>Draft plan, not locked yet</Text>
              )}
              {tasks.map((task, index) => {
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
                    last={index === tasks.length - 1}
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
        </View>
      </FadeIn>
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

type TileProps = Readonly<{
  testID: string;
  icon: IconName;
  label: string;
  detail: string;
  disabled?: boolean;
  onPress: () => void;
}>;

/** A day action: an icon on a soft square, its name and what it does. */
function Tile({ testID, icon, label, detail, disabled, onPress }: TileProps) {
  const c = usePalette();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      containerStyle={styles.tileSlot}
      style={[
        styles.tile,
        { backgroundColor: c.surface, borderColor: c.border },
        disabled === true && styles.disabled,
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: c.accentSoft }]}>
        <Icon name={icon} color={c.accentSoftText} size={22} />
      </View>
      <Text style={[type.headline, { color: c.text }]}>{label}</Text>
      <Text style={[styles.caption, { color: c.muted }]}>{detail}</Text>
    </PressableScale>
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
  hero: {
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    padding: space.lg,
    gap: space.md,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { fontSize: 15, fontWeight: '700' },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  statText: { fontSize: 13, fontWeight: '700' },
  dayKind: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    // A long caption wraps inside the pill instead of running off the card.
    maxWidth: '100%',
    gap: space.xs,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  dayKindText: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
  tiles: { flexDirection: 'row', gap: space.sm },
  // The touch area takes an equal share of the row; the face fills it.
  tileSlot: { flex: 1 },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: space.md,
    gap: space.xs,
    minHeight: 48,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  disabled: { opacity: 0.45 },
  section: { gap: space.md },
  caption: { fontSize: 14, lineHeight: 19 },
  muted: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  count: {
    fontSize: 13,
    fontWeight: '700',
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  heading: { fontSize: 20, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 0 },
  link: { fontSize: 15, fontWeight: '600', paddingVertical: space.md, textAlign: 'center' },
});
