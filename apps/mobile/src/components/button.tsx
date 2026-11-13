import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptics } from '@/lib/haptics';
import { radius, space, type Palette, usePalette } from '@/theme';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

type Variant = 'primary' | 'secondary' | 'success' | 'soft' | 'danger';

type ButtonProps = Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  icon?: IconName;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}>;

/** Face colour, the darker lip under it, and the label colour of each variant. */
function look(c: Palette, variant: Variant): { face: string; edge: string; ink: string } {
  switch (variant) {
    case 'primary':
      return { face: c.accent, edge: c.accentEdge, ink: c.accentText };
    case 'success':
      return { face: c.success, edge: c.successEdge, ink: c.accentText };
    case 'danger':
      return { face: c.danger, edge: c.dangerText, ink: '#FFFFFF' };
    case 'soft':
      return { face: c.accentSoft, edge: c.accentSoft, ink: c.accentSoftText };
    case 'secondary':
      return { face: c.surface, edge: c.border, ink: c.text };
  }
}

/**
 * A raised button: a solid face on a darker lip that shrinks under the finger. Primary and success
 * actions tick with a light haptic. Touch target at least 48 dp tall.
 */
export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  icon,
  testID,
  style,
}: ButtonProps) {
  const c = usePalette();
  const { face, edge, ink } = look(c, variant);
  const press = () => {
    if (variant === 'primary' || variant === 'success') haptics.tap();
    onPress();
  };
  return (
    <PressableScale testID={testID} disabled={disabled} onPress={press} style={style}>
      <View
        style={[
          styles.base,
          { backgroundColor: face, borderColor: edge },
          variant === 'secondary' && styles.outlined,
          disabled && styles.disabled,
        ]}
      >
        {icon !== undefined && <Icon name={icon} color={ink} size={20} />}
        <Text style={[styles.label, { color: ink }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderBottomWidth: 3,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlined: { borderWidth: 1.5, borderBottomWidth: 3 },
  disabled: { opacity: 0.45 },
  label: { fontSize: 16, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
});
