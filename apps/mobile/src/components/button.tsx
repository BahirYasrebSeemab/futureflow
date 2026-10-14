import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, space, usePalette } from '@/theme';

type ButtonProps = Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  testID?: string;
}>;

/** Feedback is instant on press-in (no fade), and the touch target is at least 48 dp tall. */
export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  testID,
}: ButtonProps) {
  const c = usePalette();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        primary ? { backgroundColor: c.accent } : { borderColor: c.border, borderWidth: 1 },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, { color: primary ? c.accentText : c.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  label: { fontSize: 16, fontWeight: '600' },
});
