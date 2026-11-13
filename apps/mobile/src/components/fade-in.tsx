import { useEffect, useRef, type ReactNode } from 'react';
import { Animated } from 'react-native';
import { useReducedMotion } from '@/lib/reduced-motion';
import { motion } from '@/theme';

/** Fades and lifts its children in once, `delay` ms after mounting, so a screen arrives in order. */
export function FadeIn({ children, delay = 0 }: Readonly<{ children: ReactNode; delay?: number }>) {
  const reduced = useReducedMotion();
  const shown = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      shown.setValue(1);
      return;
    }
    Animated.timing(shown, {
      toValue: 1,
      duration: motion.base,
      delay,
      useNativeDriver: true,
    }).start();
  }, [delay, reduced, shown]);
  return (
    <Animated.View
      style={{
        opacity: shown,
        transform: [
          { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
