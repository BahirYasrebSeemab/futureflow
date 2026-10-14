import { StyleSheet, Text, View } from 'react-native';
import { radius, space, usePalette } from '@/theme';
import { Button } from './button';

type BannerProps = Readonly<{
  tone: 'warning' | 'danger';
  message: string;
  action?: { label: string; onPress: () => void };
}>;

export function Banner({ tone, message, action }: BannerProps) {
  const c = usePalette();
  const [bg, fg] = tone === 'warning' ? [c.warningBg, c.warningText] : [c.dangerBg, c.dangerText];
  return (
    <View accessibilityLiveRegion="polite" style={[styles.box, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{message}</Text>
      {action && <Button label={action.label} onPress={action.onPress} variant="secondary" />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: space.md, gap: space.sm, alignSelf: 'stretch' },
  text: { fontSize: 15, lineHeight: 21 },
});
