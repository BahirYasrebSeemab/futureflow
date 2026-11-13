import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ColorValue } from 'react-native';
import { useReducedMotion } from '@/lib/reduced-motion';
import { motion, radius } from '@/theme';

type Props = Readonly<{
  /** 0 to 1; values outside are clamped. */
  value: number;
  fill: ColorValue;
  track: ColorValue;
  height?: number;
  label: string;
}>;

/** A thick rounded bar that grows to its value. Width animates, so it runs on the JS driver. */
export function ProgressBar({ value, fill, track, height = 12, label }: Props) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const reduced = useReducedMotion();
  const width = useRef(new Animated.Value(reduced ? clamped : 0)).current;
  useEffect(() => {
    if (reduced) {
      width.setValue(clamped);
      return;
    }
    Animated.timing(width, {
      toValue: clamped,
      duration: motion.slow,
      useNativeDriver: false,
    }).start();
  }, [clamped, reduced, width]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, backgroundColor: track, borderRadius: height / 2 }]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: fill,
            borderRadius: height / 2,
            width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', alignSelf: 'stretch', borderRadius: radius.full },
  fill: { height: '100%' },
});
