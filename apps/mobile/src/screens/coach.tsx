import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { TextField } from '@/components/text-field';
import { haptics } from '@/lib/haptics';
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

/** Owner chat messages with no coach reply yet: the server keeps them even when the AI fails. */
function unansweredIn(thread: readonly CoachMessage[]): Unanswered[] {
  const replied = new Set(thread.flatMap((m) => (m.replyTo === undefined ? [] : [m.replyTo])));
  return thread
    .filter((m) => m.role === 'owner' && m.kind === 'chat' && !replied.has(m.id))
    .map(({ id, text }) => ({ id, text }));
}

export function CoachScreen() {
  const c = usePalette();
  const headerHeight = useHeaderHeight();
  const { bottom } = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const { services } = useApp();
  const [thread, setThread] = useState<CoachMessage[]>([]);
  // Failed sends the server may not have stored; once synced they come from the thread instead.
  const [unsent, setUnsent] = useState<Unanswered[]>([]);
  const [text, setText] = useState('');
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

  const keepUnsent = (message: Unanswered) =>
    setUnsent((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));

  const deliver = async (message: Unanswered) => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    try {
      const result = await services.api.sendCoachMessage(message);
      if (!result.ok) {
        keepUnsent(message);
        return;
      }
      await services.store.saveCoachMessages([result.data.message, result.data.reply]);
      setUnsent((list) => list.filter((m) => m.id !== message.id));
      await reload();
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      console.error(JSON.stringify({ event: 'coach_send_failed', name }));
      keepUnsent(message);
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

  const inThread = new Set(thread.map((m) => m.id));
  const unanswered = [...unansweredIn(thread), ...unsent.filter((m) => !inThread.has(m.id))];
  const pendingIds = new Set(unanswered.map((m) => m.id));
  const canSend = !sending && text.trim() !== '';
  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      style={[styles.fill, { backgroundColor: c.background }]}
    >
      <ScrollView
        ref={scroller}
        style={styles.fill}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        // New messages arrive at the bottom, so the view follows them like any chat.
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
      >
        {thread.length === 0 && unanswered.length === 0 && (
          <View style={styles.intro}>
            <Avatar size={64} />
            <Text style={[styles.introTitle, { color: c.text }]}>Your coach</Text>
            <Text style={[styles.muted, { color: c.muted }]}>
              Your coach is you, a few years from now. Ask about today, a task, or what got in the
              way.
            </Text>
          </View>
        )}
        {thread
          .filter((m) => !pendingIds.has(m.id))
          .map((m) =>
            m.role === 'owner' ? (
              <Mine key={m.id} text={m.text} />
            ) : (
              <View key={m.id} style={styles.theirsRow}>
                <Avatar size={32} />
                <View
                  style={[
                    styles.bubble,
                    styles.theirs,
                    { backgroundColor: c.surface, borderColor: c.border },
                  ]}
                >
                  {m.kind === 'review' && (
                    <Text style={[styles.tag, { color: c.accentSoftText }]}>Nightly review</Text>
                  )}
                  <Text selectable style={[styles.text, { color: c.text }]}>
                    {m.text}
                  </Text>
                </View>
              </View>
            ),
          )}
        {unanswered.map((m) => (
          <View key={m.id} style={styles.pending}>
            <Mine text={m.text} />
            <View style={styles.pendingLine}>
              <Icon name="error-outline" color={c.muted} size={16} />
              <Text style={[styles.tag, { color: c.muted }]}>Not answered yet</Text>
            </View>
            <View style={styles.retry}>
              <Button
                testID={`retry-${m.id}`}
                label="Try again"
                icon="refresh"
                variant="soft"
                disabled={sending}
                onPress={() => void deliver(m)}
              />
            </View>
          </View>
        ))}
        {unanswered.length > 0 && (
          <Text
            testID="coach-unavailable"
            accessibilityLiveRegion="polite"
            style={[styles.safety, { color: c.warningText, backgroundColor: c.warningBg }]}
          >
            {COACH_UNAVAILABLE}
          </Text>
        )}
      </ScrollView>
      <View
        style={[
          styles.composer,
          {
            backgroundColor: c.surface,
            borderTopColor: c.border,
            paddingBottom: space.sm + bottom,
          },
        ]}
      >
        <TextField
          testID="coach-input"
          accessibilityLabel="Message to your coach"
          value={text}
          onChangeText={setText}
          maxLength={MAX_TEXT}
          multiline
          placeholder="Message your coach"
          style={styles.input}
        />
        <PressableScale
          testID="coach-send"
          accessibilityLabel={sending ? 'Sending' : 'Send'}
          disabled={!canSend}
          onPress={() => {
            haptics.tap();
            send();
          }}
          pressedScale={0.9}
          style={[styles.send, { backgroundColor: canSend ? c.accent : c.track }]}
        >
          <Icon name="arrow-upward" color={canSend ? c.accentText : c.muted} size={24} />
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

/** The coach's face: a soft circle with the "future you" mark. */
function Avatar({ size }: Readonly<{ size: number }>) {
  const c = usePalette();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.heroBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="self-improvement" color={c.heroText} size={size * 0.6} />
    </View>
  );
}

function Mine({ text }: Readonly<{ text: string }>) {
  const c = usePalette();
  return (
    <View style={[styles.bubble, styles.mine, { backgroundColor: c.accent }]}>
      <Text selectable style={[styles.text, { color: c.accentText }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: space.md, gap: space.sm, flexGrow: 1 },
  intro: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  introTitle: { fontSize: 20, fontWeight: '800' },
  muted: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    paddingVertical: 10,
    gap: space.xs,
  },
  // The corner nearest the speaker is tighter, so each bubble points at who said it.
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { borderWidth: 1, borderBottomLeftRadius: 6, flexShrink: 1 },
  theirsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  text: { fontSize: 16, lineHeight: 22 },
  tag: { fontSize: 12, fontWeight: '700' },
  pending: { gap: space.xs },
  pendingLine: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  retry: { alignSelf: 'flex-end' },
  safety: { fontSize: 15, lineHeight: 21, borderRadius: radius.md, padding: space.md },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, maxHeight: 140, borderRadius: radius.lg },
  send: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
