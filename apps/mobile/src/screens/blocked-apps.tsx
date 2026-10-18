import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { useApp } from '@/lib/app';
import { applyBlocklist, blocklistDay } from '@/lib/guard/apply-blocklist';
import {
  changeBlocklist,
  DEFAULT_BLOCKLIST_STATE,
  effectiveBlocklist,
  type Blocklist,
  type BlocklistState,
} from '@/lib/guard/blocklist';
import { BLOCKED_APPS, type InstalledApp } from '@/lib/guard/types';
import { radius, space, usePalette } from '@/theme';

const KNOWN = BLOCKED_APPS.map(([pkg]) => pkg);

/** Known social apps first, in their usual order; then everything else by name. */
const ordered = (apps: readonly InstalledApp[]) =>
  [...apps].sort((a, b) => {
    const [ia, ib] = [KNOWN.indexOf(a.package), KNOWN.indexOf(b.package)];
    if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    return a.label.localeCompare(b.label);
  });

/** The owner's choice: blocking more starts now, unblocking from the next day (spec §8 step 5). */
export function BlockedAppsScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const [apps, setApps] = useState<readonly InstalledApp[] | null>(null);
  const [state, setState] = useState<BlocklistState | null>(null);

  useEffect(() => {
    void (async () => {
      const day = await blocklistDay(services.store, services.now());
      setState(await applyBlocklist(services.store, services.guard, day, services.extraBlocked));
      setApps(ordered(await services.guard.installedApps()));
    })();
  }, [services]);

  // Changes run one after another, each from the stored list, so quick taps build on each other.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const choose = useCallback(
    (update: (chosen: Blocklist) => Blocklist) => {
      queue.current = queue.current
        .then(async () => {
          const day = await blocklistDay(services.store, services.now());
          const stored = (await services.store.blocklist()) ?? DEFAULT_BLOCKLIST_STATE;
          const fresh = effectiveBlocklist(stored, day);
          const next = update(fresh.pending ?? fresh.current);
          await services.store.saveBlocklist(changeBlocklist(fresh, next, day));
          setState(
            await applyBlocklist(services.store, services.guard, day, services.extraBlocked),
          );
        })
        .catch((error: unknown) => {
          const name = error instanceof Error ? error.name : 'unknown';
          console.error(JSON.stringify({ event: 'blocklist_change_failed', name }));
        });
    },
    [services],
  );

  if (state === null || apps === null) return null;
  // The switches show the choice: what applies once any pending change is due.
  const chosen: Blocklist = state.pending ?? state.current;
  const label = (pkg: string) =>
    apps.find((a) => a.package === pkg)?.label ?? BLOCKED_APPS.find(([p]) => p === pkg)?.[1] ?? pkg;
  const unblocking =
    state.pending === null
      ? []
      : [
          ...state.current.apps.filter((p) => !chosen.apps.includes(p)).map(label),
          ...(state.current.games && !chosen.games ? ['Games'] : []),
        ];
  const toggle = (pkg: string, on: boolean) =>
    choose((list) => ({
      ...list,
      apps: on ? [...list.apps.filter((p) => p !== pkg), pkg] : list.apps.filter((p) => p !== pkg),
    }));

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
    >
      <Text style={[styles.muted, { color: c.muted }]}>
        Blocking more starts now. Unblocking starts tomorrow at 04:00, so an impulse can&apos;t undo
        it. This list stays on your phone.
      </Text>
      {unblocking.length > 0 && (
        <View testID="blocklist-pending" style={[styles.card, { backgroundColor: c.warningBg }]}>
          <Text style={[styles.muted, { color: c.warningText }]}>
            Blocked until tomorrow: {unblocking.join(', ')}
          </Text>
        </View>
      )}
      <Row
        label="Games"
        testID="block-games"
        value={chosen.games}
        onChange={(on) => choose((list) => ({ ...list, games: on }))}
      />
      {apps.length === 0 && (
        <Text style={[styles.muted, { color: c.muted }]}>The app list needs the Android app.</Text>
      )}
      {apps.map((app) => (
        <Row
          key={app.package}
          label={app.label}
          testID={`block-app-${app.package}`}
          value={chosen.apps.includes(app.package)}
          onChange={(on) => toggle(app.package, on)}
        />
      ))}
    </ScrollView>
  );
}

function Row(props: {
  label: string;
  testID: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  const c = usePalette();
  return (
    <View style={[styles.row, { borderColor: c.border }]}>
      <Text style={[styles.label, { color: c.text }]}>{props.label}</Text>
      <Switch
        testID={props.testID}
        accessibilityLabel={`Block ${props.label}`}
        value={props.value}
        onValueChange={props.onChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.sm },
  muted: { fontSize: 15, lineHeight: 21 },
  card: { borderRadius: radius.md, padding: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  label: { fontSize: 16, flexShrink: 1 },
});
