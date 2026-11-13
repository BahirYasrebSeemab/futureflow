import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '@/lib/reduced-motion';

type Props = Readonly<{
  onPress: () => void;
  children: ReactNode;
  disabled?: boolean;
  testID?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  /** How far it shrinks while held; small elements can shrink more. */
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * A pressable that shrinks a little under the finger and springs back on release, so every tap is
 * felt even before the screen changes. Transform only, on the native driver.
 */
export function PressableScale({
  onPress,
  children,
  disabled = false,
  testID,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
  pressedScale = 0.97,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const to = (value: number) => {
    if (reduced) return;
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: value === 1 ? 6 : 0,
    }).start();
  };
  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, ...accessibilityState }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => to(pressedScale)}
      onPressOut={() => to(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
