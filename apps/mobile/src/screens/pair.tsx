import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { localOffsetMinutes } from '@/lib/format';
import { pairDevice } from '@/lib/pairing';
import { radius, space, usePalette } from '@/theme';

export function PairScreen() {
  const { services, setPaired } = useApp();
  const c = usePalette();
  const [code, setCode] = useState('');
  const [name, setName] = useState('My phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await pairDevice(
      {
        api: services.api,
        secrets: services.secrets,
        newToken: services.ids.newDeviceToken,
        utcOffsetMinutes: () => localOffsetMinutes(services.now()),
      },
      { code, deviceName: name },
    );
    setBusy(false);
    if (outcome.ok) setPaired(outcome.deviceId);
    else setError(outcome.message);
  };

  const input = [
    styles.input,
    { color: c.text, borderColor: c.border, backgroundColor: c.surface },
  ];
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView behavior="height" style={styles.fill}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>
            Pair this phone
          </Text>
          <Text style={[styles.lead, { color: c.muted }]}>
            Enter the setup code from your server. It works once, for this phone only.
          </Text>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.text }]}>Setup code</Text>
            <TextInput
              testID="setup-code"
              accessibilityLabel="Setup code"
              value={code}
              onChangeText={setCode}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={input}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.text }]}>Phone name</Text>
            <TextInput
              testID="device-name"
              accessibilityLabel="Phone name"
              value={name}
              onChangeText={setName}
              maxLength={64}
              style={input}
            />
          </View>
          {error !== null && (
            <Text accessibilityLiveRegion="polite" style={[styles.error, { color: c.dangerText }]}>
              {error}
            </Text>
          )}
          <Button
            testID="pair-button"
            label={busy ? 'Pairing…' : 'Pair'}
            onPress={submit}
            disabled={busy || code.trim() === ''}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: space.lg, gap: space.md, paddingTop: space.xl },
  title: { fontSize: 28, fontWeight: '700' },
  lead: { fontSize: 16, lineHeight: 22 },
  field: { gap: space.xs },
  label: { fontSize: 15, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  error: { fontSize: 15, lineHeight: 21 },
});
