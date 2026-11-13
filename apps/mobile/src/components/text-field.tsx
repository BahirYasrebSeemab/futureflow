import { useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { radius, space, usePalette } from '@/theme';

/**
 * The one text input style: a soft surface that takes the accent colour while focused, so it is
 * always clear where typing goes. Every TextInput prop passes through; `style` merges last.
 */
export function TextField({ style, onFocus, onBlur, ...props }: TextInputProps) {
  const c = usePalette();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={c.muted}
      selectionColor={c.accent}
      cursorColor={c.accent}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        {
          color: c.text,
          backgroundColor: c.surface,
          borderColor: focused ? c.accent : c.fieldBorder,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 50,
    borderWidth: 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
  },
});
