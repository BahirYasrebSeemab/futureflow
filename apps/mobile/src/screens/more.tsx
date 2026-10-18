import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { radius, space, usePalette } from '@/theme';

const ROWS: readonly [string, string, string, string][] = [
  ['more-guard', '/guard', 'Guard', 'Block apps when your time runs out'],
  ['more-roadmap', '/roadmap', 'Roadmap', 'Who you want to become, your skills and milestones'],
  ['more-github', '/github', 'GitHub', 'Link the repos your coding tasks are checked against'],
  ['more-reading', '/reading', 'Reading log', 'Log what you read and what you learned'],
  ['more-diagnostics', '/diagnostics', 'Diagnostics', 'Sync status and what is waiting to send'],
];

export function MoreScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
    >
      {ROWS.map(([testID, href, title, detail]) => (
        <Pressable
          key={testID}
          testID={testID}
          accessibilityRole="button"
          onPress={() => router.push(href as never)}
          style={({ pressed }) => [
            styles.row,
            { borderColor: c.border, backgroundColor: c.surface },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          <Text style={[styles.detail, { color: c.muted }]}>{detail}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.sm },
  row: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.xs, minHeight: 48 },
  title: { fontSize: 17, fontWeight: '600' },
  detail: { fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.7 },
});
