import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { currentDayKey } from '@/lib/format';
import { DEFAULT_BLOCKLIST_STATE, effectiveBlocklist } from '@/lib/guard/blocklist';
import { BLOCKED_APPS } from '@/lib/guard/types';
import { useGuardStatus } from '@/lib/guard/use-guard-status';
import { radius, space, usePalette } from '@/theme';
import { GuardChecklist } from './guard-checklist';

/** What the guard blocks now, by name: the owner's apps, then games. */
function useBlockedNames(): string[] | null {
  const { services } = useApp();
  const [names, setNames] = useState<string[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const stored = (await services.store.blocklist()) ?? DEFAULT_BLOCKLIST_STATE;
        const { current } = effectiveBlocklist(stored, currentDayKey(services.now()));
        const installed = await services.guard.installedApps();
        const label = (pkg: string) =>
          installed.find((a) => a.package === pkg)?.label ??
          BLOCKED_APPS.find(([p]) => p === pkg)?.[1] ??
          pkg;
        // Only what is on this phone, once the phone can say (the defaults list many apps).
        const present =
          installed.length === 0
            ? current.apps
            : current.apps.filter((pkg) => installed.some((a) => a.package === pkg));
        const apps = [...new Set(present.map(label))];
        setNames(current.games ? [...apps, 'Games'] : apps);
      })();
    }, [services]),
  );
  return names;
}

/** Whether the guard runs, how to turn it on, and what it blocks (spec §7). */
export function GuardScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const { status, refresh } = useGuardStatus();
  const blocked = useBlockedNames();
  if (status === null) return null;

  // Android can stop the service and leave it listed as on: then nothing is blocked either.
  const stalled = status.enabled && !status.connected;
  const headline = !status.available
    ? 'The guard needs the Android app'
    : stalled
      ? "The guard isn't running"
      : status.enabled
        ? 'The guard is on'
        : 'The guard is off';
  const detail = stalled
    ? 'Android stopped it, so nothing is blocked.'
    : status.enabled
      ? 'When your time runs out, blocked apps are covered until you earn more.'
      : 'Until it is on, nothing is blocked.';
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
    >
      <Text
        testID="guard-status"
        accessibilityRole="header"
        style={[styles.heading, { color: c.text }]}
      >
        {headline}
      </Text>
      {status.available && <Text style={[styles.muted, { color: c.muted }]}>{detail}</Text>}
      {status.available && (!status.enabled || stalled) && (
        <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
          {stalled ? (
            <Text style={[styles.step, { color: c.text }]}>
              Open Accessibility, then switch Future Flow guard off and on again.
            </Text>
          ) : (
            <>
              <Text style={[styles.step, { color: c.text }]}>
                1. Open Accessibility, choose Future Flow guard, and turn it on.
              </Text>
              <Text style={[styles.step, { color: c.text }]}>
                2. If Android says “Restricted setting”: open App info for Future Flow, tap ⋮,
                choose “Allow restricted settings”, then try step 1 again.
              </Text>
            </>
          )}
          <Button
            testID="guard-enable"
            label="Open Accessibility settings"
            onPress={() => void services.guard.openSettings('accessibility')}
          />
        </View>
      )}
      {status.available && <GuardChecklist status={status} refresh={refresh} />}
      <Text style={[styles.label, { color: c.muted }]}>Blocked</Text>
      <Text testID="blocked-names" style={[styles.muted, { color: c.text }]}>
        {blocked === null ? '' : blocked.length === 0 ? 'Nothing' : blocked.join(', ')}
      </Text>
      <Button
        testID="change-blocked"
        variant="secondary"
        label="Change"
        onPress={() => router.push('/blocked-apps')}
      />
      <Text style={[styles.muted, { color: c.muted }]}>
        Calls, messages and emergency apps are never blocked. The apps and sites you open stay on
        this phone: only the minutes you spent and when are sent.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  heading: { fontSize: 22, fontWeight: '700' },
  muted: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600' },
  step: { fontSize: 15, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
});
