import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { BLOCKED_APPS } from '@/lib/guard/types';
import { useGuardStatus } from '@/lib/guard/use-guard-status';
import { radius, space, usePalette } from '@/theme';
import { GuardChecklist } from './guard-checklist';

const BLOCKED_NAMES = [...new Set(BLOCKED_APPS.map(([, name]) => name)), 'Games'];

/** Whether the guard runs, how to turn it on, and what it blocks (spec §7). */
export function GuardScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const { status, refresh } = useGuardStatus();
  if (status === null) return null;

  const headline = !status.available
    ? 'The guard needs the Android app'
    : status.enabled
      ? 'The guard is on'
      : 'The guard is off';
  const detail = status.enabled
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
      {status.available && !status.enabled && (
        <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Text style={[styles.step, { color: c.text }]}>
            1. Open Accessibility, choose Future Flow guard, and turn it on.
          </Text>
          <Text style={[styles.step, { color: c.text }]}>
            2. If Android says “Restricted setting”: open App info for Future Flow, tap ⋮, choose
            “Allow restricted settings”, then try step 1 again.
          </Text>
          <Button
            testID="guard-enable"
            label="Open Accessibility settings"
            onPress={() => void services.guard.openSettings('accessibility')}
          />
        </View>
      )}
      {status.available && <GuardChecklist status={status} refresh={refresh} />}
      <Text style={[styles.label, { color: c.muted }]}>Blocked</Text>
      <Text style={[styles.muted, { color: c.text }]}>{BLOCKED_NAMES.join(', ')}</Text>
      <Text style={[styles.muted, { color: c.muted }]}>
        Calls, messages and emergency apps are never blocked. Which apps you open stays on this
        phone: only the minutes you spent and when are sent.
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
