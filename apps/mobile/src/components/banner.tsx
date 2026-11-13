import { StyleSheet, Text, View } from 'react-native';
import { radius, space, usePalette } from '@/theme';
import { Button } from './button';
import { Icon } from './icon';

type BannerProps = Readonly<{
  tone: 'warning' | 'danger';
  message: string;
  action?: { label: string; onPress: () => void; testID?: string };
}>;

export function Banner({ tone, message, action }: BannerProps) {
  const c = usePalette();
  const [bg, fg] = tone === 'warning' ? [c.warningBg, c.warningText] : [c.dangerBg, c.dangerText];
  return (
    <View accessibilityLiveRegion="polite" style={[styles.box, { backgroundColor: bg }]}>
      <View style={styles.line}>
        <Icon name={tone === 'warning' ? 'warning-amber' : 'error-outline'} color={fg} size={22} />
        <Text style={[styles.text, { color: fg }]}>{message}</Text>
      </View>
      {action && (
        <Button
          testID={action.testID}
          label={action.label}
          onPress={action.onPress}
          variant="secondary"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: space.md,
    gap: space.md,
    alignSelf: 'stretch',
  },
  line: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  text: { fontSize: 15, lineHeight: 21, fontWeight: '600', flex: 1 },
});
