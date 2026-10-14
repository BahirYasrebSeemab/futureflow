import { addDays, type TaskSpec } from '@futureflow/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import type { ApiFailure } from '@/lib/api/client';
import { useApp } from '@/lib/app';
import { readHome, saveHome } from '@/lib/away';
import { formatDayLabel } from '@/lib/format';
import { radius, space, usePalette } from '@/theme';

const START_CHOICES = 14;
const MAX_DAYS = 30;
const MAX_PLACE = 80;
const MAX_KEPT = 10;

const REFUSALS: Readonly<Record<string, string>> = {
  already_declared: 'Some of those days already have a day type.',
  day_out_of_range: 'Pick a start within the next 60 days.',
};

function awayMessage(error: ApiFailure): string {
  switch (error.kind) {
    case 'network':
      return 'Declaring away needs a connection.';
    case 'invalid_response':
      return 'This app is out of date for the server. Update the app.';
    case 'server':
      return 'The server had a problem. Try again soon.';
    case 'rejected':
      return REFUSALS[error.code] ?? error.message;
  }
}

const startLabel = (index: number, day: string) =>
  index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : formatDayLabel(day);

export function AwayScreen() {
  const c = usePalette();
  const { services } = useApp();
  const [id] = useState(() => services.ids.newId()); // reused by retries
  const [today, setToday] = useState<string | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [days, setDays] = useState(1);
  const [place, setPlace] = useState('');
  const [tasks, setTasks] = useState<TaskSpec[]>([]);
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const [hasHome, setHasHome] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [saved, home] = await Promise.all([
        services.store.savedToday(),
        readHome(services.secrets),
      ]);
      setToday(saved?.today.day ?? null);
      setHasHome(home !== null);
    })();
  }, [services]);

  const from = today === null ? null : addDays(today, startIndex);

  const loadTasks = useCallback(
    async (day: string) => {
      const plan = await services.api.getPlan(day);
      setTasks(plan.ok ? (plan.data?.tasks ?? []).slice(0, MAX_KEPT) : []);
      setKept(new Set());
    },
    [services],
  );

  useEffect(() => {
    if (from !== null) void loadTasks(from);
  }, [from, loadTasks]);

  const setHome = async () => {
    setMessage(null);
    const here = await services.locator.coarse();
    if (here === null) {
      setMessage('Could not get your location.');
      return;
    }
    await saveHome(services.secrets, here);
    setHasHome(true);
  };

  const toggle = (taskId: string) =>
    setKept((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  const trimmed = place.trim();
  const canDeclare = from !== null && trimmed.length > 0 && trimmed.length <= MAX_PLACE && !busy;

  const declare = async () => {
    if (from === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const to = addDays(from, days - 1);
      const keptTaskIds = tasks.filter((t) => kept.has(t.id)).map((t) => t.id);
      const result = await services.api.declareAway({ id, from, to, place: trimmed, keptTaskIds });
      if (!result.ok) {
        setMessage(awayMessage(result.error));
        return;
      }
      await services.store.saveAwayWindow({ id, from, to });
      if (router.canGoBack()) router.back();
      else router.replace('/'); // opened directly (e.g. a link): land on Today
    } finally {
      setBusy(false);
    }
  };

  const chip = (selected: boolean) => [
    styles.chip,
    {
      borderColor: selected ? c.accent : c.border,
      backgroundColor: selected ? c.accent : c.surface,
    },
  ];
  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.body}>
      <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>
        Going away
      </Text>
      <Text style={[styles.muted, { color: c.muted }]}>
        Tasks you don&apos;t keep are excused. On away days the phone checks how far you are from
        home; only the distance, rounded to 10 km, leaves the phone.
      </Text>
      {message !== null && <Banner tone="warning" message={message} />}

      <View style={styles.section}>
        <Text style={[styles.label, { color: c.text }]}>Home</Text>
        {hasHome ? (
          <Text style={[styles.muted, { color: c.muted }]}>Home is set</Text>
        ) : (
          <Text style={[styles.muted, { color: c.muted }]}>
            Set your home first. Do this at home; the place stays on this phone. Without it, away
            days count as unverified.
          </Text>
        )}
        <Button
          testID="set-home"
          label={hasHome ? 'Move home to here' : 'Set home to here'}
          variant="secondary"
          onPress={() => void setHome()}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: c.text }]}>Where are you going?</Text>
        <TextInput
          testID="place"
          accessibilityLabel="Where are you going?"
          value={place}
          onChangeText={setPlace}
          maxLength={MAX_PLACE}
          style={[
            styles.input,
            { color: c.text, borderColor: c.border, backgroundColor: c.surface },
          ]}
        />
      </View>

      {today !== null && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: c.text }]}>Starting</Text>
          <View style={styles.chips}>
            {Array.from({ length: START_CHOICES }, (_, i) => (
              <Pressable
                key={i}
                testID={`start-${i}`}
                accessibilityRole="button"
                accessibilityState={{ selected: i === startIndex }}
                onPress={() => setStartIndex(i)}
                style={({ pressed }) => [...chip(i === startIndex), pressed && styles.pressed]}
              >
                <Text style={{ color: i === startIndex ? c.accentText : c.text }}>
                  {startLabel(i, addDays(today, i))}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.label, { color: c.text }]}>How many days?</Text>
        <View style={styles.stepper}>
          <Button
            testID="days-minus"
            label="−"
            variant="secondary"
            onPress={() => setDays((d) => Math.max(1, d - 1))}
          />
          <Text testID="days-count" style={[styles.count, { color: c.text }]}>
            {days}
          </Text>
          <Button
            testID="days-plus"
            label="+"
            variant="secondary"
            onPress={() => setDays((d) => Math.min(MAX_DAYS, d + 1))}
          />
        </View>
      </View>

      {tasks.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: c.text }]}>Keep these tasks</Text>
          {tasks.map((task, i) => (
            <Pressable
              key={task.id}
              testID={`keep-${i}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: kept.has(task.id) }}
              onPress={() => toggle(task.id)}
              style={({ pressed }) => [
                ...chip(kept.has(task.id)),
                styles.keep,
                pressed && styles.pressed,
              ]}
            >
              <Text style={{ color: kept.has(task.id) ? c.accentText : c.text }}>
                {task.full.title}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Button
        testID="declare-away"
        label={busy ? 'Declaring…' : 'Declare away'}
        disabled={!canDeclare}
        onPress={() => void declare()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.lg },
  heading: { fontSize: 22, fontWeight: '700' },
  muted: { fontSize: 15, lineHeight: 21 },
  section: { gap: space.sm },
  label: { fontSize: 15, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  keep: { alignSelf: 'stretch' },
  pressed: { opacity: 0.7 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  count: {
    fontSize: 20,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
