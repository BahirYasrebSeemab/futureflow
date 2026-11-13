import { useState } from 'react';
import { Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { TextField } from '@/components/text-field';
import { haptics } from '@/lib/haptics';
import { useApp } from '@/lib/app';
import { localOffsetMinutes } from '@/lib/format';
import { pairDevice } from '@/lib/pairing';
import { radius, space, usePalette } from '@/theme';

// Static image imports need require(): Metro bundles the file and returns its asset id.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const APP_ICON = require('../../assets/icon.png') as number;

export function PairScreen() {
  const { services, setPaired } = useApp();
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const [code, setCode] = useState('');
  const [name, setName] = useState('My phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await pairDevice(
        {
          api: services.api,
          secrets: services.secrets,
          newToken: services.ids.newDeviceToken,
          utcOffsetMinutes: () => localOffsetMinutes(services.now()),
        },
        { code, deviceName: name },
      );
      if (outcome.ok) {
        haptics.success();
        setPaired(outcome.deviceId);
      } else {
        haptics.warn();
        setError(outcome.message);
      }
    } catch {
      setError('Could not save the pairing on this phone. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView behavior="height" style={styles.fill}>
        <ScrollView
          contentContainerStyle={[styles.body, bottomPadding]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Image
              source={APP_ICON}
              style={styles.logo}
              accessibilityIgnoresInvertColors
              accessibilityElementsHidden
            />
            <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>
              Pair this phone
            </Text>
            <Text style={[styles.lead, { color: c.muted }]}>
              Enter the setup code from your server. It works once, for this phone only.
            </Text>
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.text }]}>Setup code</Text>
            <TextField
              testID="setup-code"
              accessibilityLabel="Setup code"
              value={code}
              onChangeText={setCode}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.text }]}>Phone name</Text>
            <TextField
              testID="device-name"
              accessibilityLabel="Phone name"
              value={name}
              onChangeText={setName}
              maxLength={64}
            />
          </View>
          {error !== null && (
            <View style={[styles.errorBox, { backgroundColor: c.dangerBg }]}>
              <Icon name="error-outline" color={c.dangerText} size={20} />
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.error, { color: c.dangerText }]}
              >
                {error}
              </Text>
            </View>
          )}
          <Button
            testID="pair-button"
            label={busy ? 'Pairing…' : 'Pair'}
            icon="link"
            haptic={false}
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
  body: { padding: space.lg, gap: space.lg, paddingTop: space.xxl },
  brand: { alignItems: 'center', gap: space.sm, paddingBottom: space.sm },
  logo: { width: 88, height: 88, borderRadius: radius.xl, marginBottom: space.sm },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  lead: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  field: { gap: space.xs },
  label: { fontSize: 15, fontWeight: '700' },
  errorBox: {
    flexDirection: 'row',
    gap: space.sm,
    borderRadius: radius.md,
    padding: space.md,
    alignItems: 'flex-start',
  },
  error: { fontSize: 15, lineHeight: 21, flex: 1 },
});
