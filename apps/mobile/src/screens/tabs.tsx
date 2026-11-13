import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import { radius, usePalette } from '@/theme';

/** Each tab: route, title, icon, and the test id the Today buttons used to carry. */
const TABS: readonly [string, string, IconName, string][] = [
  ['index', 'Today', 'home', 'tab-today'],
  ['plan', 'Plan', 'event-note', 'open-plan'],
  ['math', 'Math', 'calculate', 'open-math'],
  ['coach', 'Coach', 'forum', 'open-coach'],
  ['more', 'More', 'apps', 'open-more'],
];

/**
 * The five places used every day sit in a bottom bar; everything else opens on top of it. Back
 * walks the tabs in the order they were visited, so the system back gesture feels like before.
 */
export function TabsLayout() {
  const c = usePalette();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 22 },
        headerShadowVisible: false,
        tabBarActiveTintColor: c.accentSoftText,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: c.background },
      }}
    >
      {TABS.map(([name, title, icon, testID]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarButtonTestID: testID,
            tabBarIcon: ({ color, focused }) => (
              <View
                style={[styles.pill, focused && { backgroundColor: c.accentSoft }]}
                accessibilityElementsHidden
              >
                <Icon name={icon} color={color} size={24} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // The active tab sits in a soft pill, as on Material 3 navigation bars.
  pill: {
    width: 56,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
