import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import type { GuardStatus } from '@/lib/guard/types';
import type { GuardStep } from '@/lib/store/types';
import { radius, space, usePalette } from '@/theme';

type Item = Readonly<{
  id: 'notifications' | GuardStep;
  title: string;
  detail: string;
  done: boolean;
  fix?: Readonly<{ label: string; onPress: () => void }>;
  /** Steps Android can't report: the owner ticks them. */
  tickable?: boolean;
}>;

/**
 * What keeps the guard running on a real phone (spec §7 "Staying alive"). Ticks come from Android
 * where it can tell, and from the owner where it can't (Xiaomi's own settings).
 */
export function GuardChecklist({
  status,
  refresh,
}: {
  status: GuardStatus;
  refresh: () => Promise<void>;
}) {
  const c = usePalette();
  const { services } = useApp();
  const [ticked, setTicked] = useState<readonly GuardStep[]>([]);

  useEffect(() => {
    let live = true;
    services.store
      .guardSteps()
      .then((steps) => live && setTicked(steps))
      .catch(logFailure);
    return () => {
      live = false;
    };
  }, [services]);

  const tick = useCallback(
    async (step: GuardStep) => {
      const done = !ticked.includes(step);
      await services.store.markGuardStep(step, done);
      setTicked(await services.store.guardSteps());
    },
    [services, ticked],
  );

  const open = (kind: 'battery' | 'autostart') => () =>
    void services.guard.openSettings(kind).catch(logFailure);
  const items: Item[] = [
    {
      id: 'notifications',
      title: 'Notifications',
      detail: 'Shows the minutes left and tells you when the guard is off.',
      done: status.notifications,
      fix: {
        label: 'Allow notifications',
        onPress: () => void services.guard.requestNotifications().then(refresh).catch(logFailure),
      },
    },
    {
      id: 'battery',
      title: 'No battery limits',
      detail: status.xiaomi
        ? 'In Battery saver, choose “No restrictions” for Future Flow.'
        : 'Lets the guard keep running in the background.',
      done: status.batteryUnrestricted || (status.xiaomi && ticked.includes('battery')),
      fix: { label: 'Remove battery limits', onPress: open('battery') },
      // Ticked only where Android doesn't already say so.
      tickable: status.xiaomi && !status.batteryUnrestricted,
    },
  ];
  if (status.xiaomi) {
    items.push(
      {
        id: 'autostart',
        title: 'Autostart',
        detail: 'Turn on Autostart for Future Flow, so the guard comes back after a restart.',
        done: ticked.includes('autostart'),
        fix: { label: 'Open Autostart', onPress: open('autostart') },
        tickable: true,
      },
      {
        id: 'recents',
        title: 'Lock in recent apps',
        detail: 'Open recent apps, press and hold Future Flow, and tap the lock.',
        done: ticked.includes('recents'),
        tickable: true,
      },
    );
  }

  return (
    <View style={styles.list}>
      <Text style={[styles.label, { color: c.muted }]}>Keep it running</Text>
      {items.map((item) => (
        <View
          key={item.id}
          testID={`check-${item.id}`}
          style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}
        >
          <View style={styles.row}>
            <Text style={[styles.title, { color: c.text }]}>{item.title}</Text>
            <Text style={[styles.state, { color: item.done ? c.text : c.muted }]}>
              {item.done ? 'Done' : 'To do'}
            </Text>
          </View>
          <Text style={[styles.detail, { color: c.muted }]}>{item.detail}</Text>
          {!item.done && item.fix !== undefined && (
            <Button testID={`fix-${item.id}`} label={item.fix.label} onPress={item.fix.onPress} />
          )}
          {item.tickable === true && item.id !== 'notifications' && (
            <Button
              testID={`done-${item.id}`}
              variant="secondary"
              label={ticked.includes(item.id) ? 'Not done yet' : 'I did this'}
              onPress={() => void tick(item.id as GuardStep).catch(logFailure)}
            />
          )}
        </View>
      ))}
    </View>
  );
}

function logFailure(error: unknown) {
  const name = error instanceof Error ? error.name : 'unknown';
  console.error(JSON.stringify({ event: 'guard_checklist_failed', name }));
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  label: { fontSize: 13, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  title: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  state: { fontSize: 15, fontWeight: '600' },
  detail: { fontSize: 15, lineHeight: 21 },
});
