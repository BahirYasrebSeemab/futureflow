import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import type { CoachMessage } from '@/lib/api/client';
import { useApp } from '@/lib/app';
import { radius, space, usePalette } from '@/theme';

/**
 * Shown, word for word, whenever the coach can't answer. It is fixed text, never AI text, so a
 * hard moment always meets a real way to get help (spec §9.2 distress guardrail).
 */
export const COACH_UNAVAILABLE =
  "The coach can't answer right now. If things feel heavy, you don't have to wait: call or text 9-8-8 (Suicide Crisis Helpline, Canada, 24/7). In an emergency, call 9-1-1.";

const MAX_TEXT = 2000;
const PAGE = 50;
const MAX_PAGES = 20;

type Unanswered = { id: string; text: string };

export function CoachScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const [thread, setThread] = useState<CoachMessage[]>([]);
  const [unanswered, setUnanswered] = useState<Unanswered[]>([]);
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const [sending, setSending] = useState(false);

  const reload = useCallback(async () => setThread(await services.store.coachThread()), [services]);

  // Show the cached thread at once, then fetch anything new (works offline from the cache).
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await reload();
        for (let page = 0; page < MAX_PAGES; page++) {
          const result = await services.api.coachMessages(await services.store.coachCursor(), PAGE);
          if (!result.ok) return;
          await services.store.saveCoachMessages(result.data.messages, result.data.next);
          if (result.data.messages.length < PAGE) break;
        }
        await reload();
      })();
    }, [services, reload]),
  );

  const deliver = async (message: Unanswered) => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    try {
      const result = await services.api.sendCoachMessage(message);
      if (!result.ok) {
        setFailed(true);
        setUnanswered((list) =>
          list.some((m) => m.id === message.id) ? list : [...list, message],
        );
        return;
      }
      await services.store.saveCoachMessages([result.data.message, result.data.reply]);
      setUnanswered((list) => list.filter((m) => m.id !== message.id));
      setFailed(false);
      await reload();
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      console.error(JSON.stringify({ event: 'coach_send_failed', name }));
      setFailed(true);
      setUnanswered((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const send = () => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    setText('');
    void deliver({ id: services.ids.newId(), text: trimmed });
  };

  const bubble = (mine: boolean) => [
    styles.bubble,
    mine
      ? { alignSelf: 'flex-end' as const, backgroundColor: c.accent }
      : {
          alignSelf: 'flex-start' as const,
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
        },
  ];
  const pendingIds = new Set(unanswered.map((m) => m.id));
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
      keyboardShouldPersistTaps="handled"
    >
      {thread.length === 0 && unanswered.length === 0 && (
        <Text style={[styles.muted, { color: c.muted }]}>
          Your coach is you, a few years from now. Ask about today, a task, or what got in the way.
        </Text>
      )}
      {thread
        .filter((m) => !pendingIds.has(m.id))
        .map((m) => (
          <View key={m.id} style={bubble(m.role === 'owner')}>
            {m.kind === 'review' && (
              <Text style={[styles.tag, { color: c.muted }]}>Nightly review</Text>
            )}
            <Text
              style={{
                color: m.role === 'owner' ? c.accentText : c.text,
                fontSize: 16,
                lineHeight: 22,
              }}
            >
              {m.text}
            </Text>
          </View>
        ))}
      {unanswered.map((m) => (
        <View key={m.id} style={styles.pending}>
          <View style={bubble(true)}>
            <Text style={{ color: c.accentText, fontSize: 16, lineHeight: 22 }}>{m.text}</Text>
          </View>
          <Text style={[styles.tag, { color: c.muted, alignSelf: 'flex-end' }]}>
            Not answered yet
          </Text>
          <Button
            testID={`retry-${m.id}`}
            label="Try again"
            variant="secondary"
            disabled={sending}
            onPress={() => void deliver(m)}
          />
        </View>
      ))}
      {failed && (
        <Text
          testID="coach-unavailable"
          accessibilityLiveRegion="polite"
          style={[styles.safety, { color: c.text, backgroundColor: c.warningBg }]}
        >
          {COACH_UNAVAILABLE}
        </Text>
      )}
      <TextInput
        testID="coach-input"
        accessibilityLabel="Message to your coach"
        value={text}
        onChangeText={setText}
        maxLength={MAX_TEXT}
        multiline
        placeholder="Message your coach"
        placeholderTextColor={c.muted}
        style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
      />
      <Button
        testID="coach-send"
        label={sending ? 'Sending…' : 'Send'}
        disabled={sending || text.trim() === ''}
        onPress={send}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.sm },
  muted: { fontSize: 15, lineHeight: 21 },
  bubble: { maxWidth: '85%', borderRadius: radius.md, padding: space.sm, gap: space.xs },
  tag: { fontSize: 12, fontWeight: '600' },
  pending: { gap: space.xs },
  safety: { fontSize: 15, lineHeight: 21, borderRadius: radius.md, padding: space.md },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
  },
});
