import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, usePalette } from '@/theme';
import { TextField } from '@/components/text-field';

const KEYS: readonly [string, string][] = [
  ['x', 'x'],
  ['^', 'power'],
  ['/', 'fraction'],
  ['(', 'open bracket'],
  [')', 'close bracket'],
  ['π', 'pi'],
];

type Props = Readonly<{ value: string; onChange: (text: string) => void; editable: boolean }>;

/** A plain text answer with keys for the symbols a phone keyboard hides. */
export function AnswerInput({ value, onChange, editable }: Props) {
  const c = usePalette();
  return (
    <View style={styles.box}>
      <TextField
        testID="answer-input"
        accessibilityLabel="Your answer"
        value={value}
        onChangeText={onChange}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Your answer"
        style={styles.input}
      />
      <View style={styles.keys}>
        {KEYS.map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={`Insert ${label}`}
            disabled={!editable}
            onPress={() => onChange(value + key)}
            style={({ pressed }) => [
              styles.key,
              { borderColor: c.border, backgroundColor: c.surface },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.keyText, { color: c.text }]}>{key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  input: {
    minHeight: 52,
    paddingHorizontal: space.md,
    fontSize: 20,
  },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  key: {
    minWidth: 48,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 18, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
