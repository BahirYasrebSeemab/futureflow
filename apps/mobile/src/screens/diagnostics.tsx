import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { formatTime, localOffsetMinutes } from '@/lib/format';
import type { SyncReport } from '@/lib/store/types';
import { space, usePalette } from '@/theme';

type Facts = { pending: number; dead: number; cursor: number; lastSync: SyncReport | null };
type Row = { label: string; value: string; testID?: string };

export function DiagnosticsScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services, session } = useApp();
  const [facts, setFacts] = useState<Facts | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { store } = services;
    const [counts, cursor, lastSync] = await Promise.all([
      store.counts(),
      store.cursor(),
      store.lastSync(),
    ]);
    setFacts({ ...counts, cursor, lastSync });
  }, [services]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncNow = async () => {
    setBusy(true);
    try {
      await services.syncer.sync();
      await load();
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      console.error(JSON.stringify({ event: 'diagnostics_failed', name }));
    } finally {
      setBusy(false);
    }
  };

  const last = facts?.lastSync;
  const rows: Row[] = [
    { label: 'Server', value: services.apiUrl.replace(/^https?:\/\//, '') },
    {
      label: 'Device',
      value: session.status === 'paired' ? session.deviceId.slice(0, 8) : 'not paired',
    },
    { label: 'Waiting to send', value: String(facts?.pending ?? '…'), testID: 'pending-count' },
    { label: 'Could not send', value: String(facts?.dead ?? '…') },
    { label: 'Ledger position', value: String(facts?.cursor ?? '…') },
    {
      label: 'Last sync',
      value: last
        ? `${formatTime(last.at, localOffsetMinutes(last.at))} · ${last.status}`
        : 'never',
    },
    { label: 'App version', value: Constants.expoConfig?.version ?? 'unknown' },
  ];
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
    >
      {rows.map((row) => (
        <View key={row.label} style={[styles.row, { borderColor: c.border }]}>
          <Text style={[styles.label, { color: c.muted }]}>{row.label}</Text>
          <Text testID={row.testID} style={[styles.value, { color: c.text }]}>
            {row.value}
          </Text>
        </View>
      ))}
      <Button
        testID="sync-now"
        label={busy ? 'Syncing…' : 'Sync now'}
        onPress={syncNow}
        disabled={busy}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
  },
  label: { fontSize: 15 },
  value: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
