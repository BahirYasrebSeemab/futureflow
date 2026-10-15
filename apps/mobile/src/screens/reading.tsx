import { addDays } from '@futureflow/core';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Banner } from '@/components/banner';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import type { ApiFailure } from '@/lib/api/client';
import { useApp } from '@/lib/app';
import { currentDayKey } from '@/lib/format';
import { radius, space, usePalette } from '@/theme';

type Source = 'book' | 'pdf' | 'article';
const SOURCES: readonly [Source, string][] = [
  ['book', 'Book'],
  ['pdf', 'PDF'],
  ['article', 'Article'],
];
const MAX_TITLE = 200;
const MAX_SUMMARY = 2000;

/** A whole number within bounds, or undefined when empty; NaN marks an invalid entry. */
const countOf = (text: string, max: number): number | undefined => {
  if (text.trim() === '') return undefined;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : Number.NaN;
};

function failure(error: ApiFailure): string {
  if (error.kind === 'network') return 'Saving needs a connection.';
  if (error.kind === 'rejected' && error.code === 'day_out_of_range') {
    return "You can log today's or yesterday's reading.";
  }
  if (error.kind === 'invalid_response')
    return 'This app is out of date for the server. Update the app.';
  return error.kind === 'server' || error.kind === 'rejected' ? error.message : 'Could not save.';
}

/** "What did you learn?" is the evidence: the judge scores it tonight (spec §6.3). */
export function ReadingScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const [id, setId] = useState(() => services.ids.newId()); // kept for retries
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<Source>('book');
  const [pages, setPages] = useState('');
  const [minutes, setMinutes] = useState('');
  const [summary, setSummary] = useState('');
  const [yesterday, setYesterday] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'warning' | 'ok'; text: string } | null>(null);

  const pageCount = countOf(pages, 2000);
  const minuteCount = countOf(minutes, 1440);
  const countsValid =
    !Number.isNaN(pageCount ?? 0) &&
    !Number.isNaN(minuteCount ?? 0) &&
    (pageCount !== undefined || minuteCount !== undefined);
  const valid =
    title.trim().length > 0 &&
    title.trim().length <= MAX_TITLE &&
    summary.trim().length > 0 &&
    summary.trim().length <= MAX_SUMMARY &&
    countsValid;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const today = currentDayKey(services.now());
      const result = await services.api.sendReading({
        id,
        day: yesterday ? addDays(today, -1) : today,
        title: title.trim(),
        source,
        ...(pageCount === undefined ? {} : { pages: pageCount }),
        ...(minuteCount === undefined ? {} : { minutes: minuteCount }),
        summary: summary.trim(),
      });
      if (!result.ok) {
        setMessage({ tone: 'warning', text: failure(result.error) });
        return;
      }
      setMessage({ tone: 'ok', text: "Saved. It's checked tonight; the result shows on Today." });
      setId(services.ids.newId());
      setTitle('');
      setPages('');
      setMinutes('');
      setSummary('');
      setYesterday(false);
    } finally {
      setBusy(false);
    }
  };

  const input = [
    styles.input,
    { color: c.text, borderColor: c.border, backgroundColor: c.surface },
  ];
  const chip = (on: boolean) => [
    styles.chip,
    { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.surface },
  ];
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
      keyboardShouldPersistTaps="handled"
    >
      {message !== null &&
        (message.tone === 'warning' ? (
          <Banner tone="warning" message={message.text} />
        ) : (
          <Text accessibilityLiveRegion="polite" style={[styles.ok, { color: c.text }]}>
            {message.text}
          </Text>
        ))}
      <Text style={[styles.label, { color: c.text }]}>What did you read?</Text>
      <TextInput
        testID="reading-title"
        accessibilityLabel="Title"
        value={title}
        onChangeText={setTitle}
        maxLength={MAX_TITLE}
        style={input}
      />
      <View style={styles.row}>
        {SOURCES.map(([value, label]) => (
          <Pressable
            key={value}
            testID={`source-${value}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: source === value }}
            onPress={() => setSource(value)}
            style={chip(source === value)}
          >
            <Text style={{ color: source === value ? c.accentText : c.text }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={[styles.label, { color: c.text }]}>Pages</Text>
          <TextInput
            testID="reading-pages"
            accessibilityLabel="Pages"
            keyboardType="number-pad"
            value={pages}
            onChangeText={setPages}
            style={input}
          />
        </View>
        <View style={styles.half}>
          <Text style={[styles.label, { color: c.text }]}>Minutes</Text>
          <TextInput
            testID="reading-minutes"
            accessibilityLabel="Minutes"
            keyboardType="number-pad"
            value={minutes}
            onChangeText={setMinutes}
            style={input}
          />
        </View>
      </View>
      <Text style={[styles.label, { color: c.text }]}>What did you learn?</Text>
      <TextInput
        testID="reading-summary"
        accessibilityLabel="What did you learn?"
        value={summary}
        onChangeText={setSummary}
        maxLength={MAX_SUMMARY}
        multiline
        style={[input, styles.summary]}
      />
      <Pressable
        testID="read-yesterday"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: yesterday }}
        onPress={() => setYesterday((y) => !y)}
        style={chip(yesterday)}
      >
        <Text style={{ color: yesterday ? c.accentText : c.text }}>I read this yesterday</Text>
      </Pressable>
      <Button
        testID="submit-reading"
        label={busy ? 'Saving…' : 'Save'}
        disabled={!valid || busy}
        onPress={() => void submit()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  label: { fontSize: 15, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  summary: { minHeight: 120, paddingVertical: space.sm, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  half: { flex: 1, gap: space.xs },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  ok: { fontSize: 15, lineHeight: 21 },
});
