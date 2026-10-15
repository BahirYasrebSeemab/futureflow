import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { currentDayKey } from '@/lib/format';
import {
  checkAnswer,
  DEFAULT_REGISTRY,
  ONTARIO_GRAPH,
  type PlacementState,
  placementProbe,
  placementProgress,
  type Problem,
  recordPlacementAnswer,
  startPlacement,
  warmChecker,
} from '@/lib/math/engine';
import { randomSeed } from '@/lib/math/session';
import { space, usePalette } from '@/theme';
import { AnswerInput } from './answer-input';

const PROBE_DIFFICULTY = 3;
const TOPICS = ONTARIO_GRAPH.topics;

type Probe = { index: number; problem: Problem };

/** Binary search over the topics: two right answers mark a topic known, one wrong marks it not. */
export function PlacementScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const [state, setState] = useState<PlacementState | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [input, setInput] = useState('');
  const [unreadable, setUnreadable] = useState(false);
  const [startTopic, setStartTopic] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const busy = useRef(false); // one answer per tap, even on a double tap

  const ask = useCallback((next: PlacementState) => {
    const index = placementProbe(next);
    setState(next);
    setInput('');
    if (index === null) {
      setProbe(null);
      return;
    }
    const generator = DEFAULT_REGISTRY.get(TOPICS[index]?.id ?? '');
    setProbe(
      generator ? { index, problem: generator.generate(randomSeed(), PROBE_DIFFICULTY) } : null,
    );
  }, []);

  const finish = useCallback(
    async (final: PlacementState) => {
      const today = currentDayKey(services.now());
      const progress = placementProgress(ONTARIO_GRAPH, final, today);
      await services.store.saveMathProgress([...progress.values()]);
      await services.store.savePlacement({ state: final, done: true });
      setStartTopic(TOPICS[Math.min(final.low, TOPICS.length - 1)]?.title ?? '');
    },
    [services],
  );

  useEffect(() => {
    void warmChecker();
    void (async () => {
      const [saved, progress] = await Promise.all([
        services.store.placement(),
        services.store.mathProgress(),
      ]);
      const paused = saved !== null && !saved.done;
      // Placement rewrites every topic's progress: never over practice already done.
      if (!paused && progress.size > 0) {
        setBlocked(true);
        return;
      }
      ask(paused ? saved.state : startPlacement(TOPICS.length));
    })();
  }, [services, ask]);

  const check = async () => {
    if (state === null || probe === null || busy.current) return;
    const outcome = checkAnswer(probe.problem.answer, input);
    if (outcome === 'unreadable') {
      setUnreadable(true);
      return;
    }
    setUnreadable(false);
    busy.current = true;
    try {
      await recordAnswer(state, probe, outcome === 'correct');
    } finally {
      busy.current = false;
    }
  };

  const recordAnswer = async (current: PlacementState, asked: Probe, correct: boolean) => {
    const now = services.now();
    await services.store.saveAttempt({
      id: services.ids.newId(now),
      day: currentDayKey(now),
      at: now,
      topicId: asked.problem.topicId,
      difficulty: PROBE_DIFFICULTY,
      correct,
      answerType: 'typed',
    });
    const next = recordPlacementAnswer(current, correct);
    await services.store.savePlacement({ state: next, done: false });
    if (placementProbe(next) === null) await finish(next);
    ask(next);
  };

  const body = [styles.body, bottomPadding];
  if (startTopic !== null) {
    return (
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={body}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>
          Placement done
        </Text>
        <Text style={[styles.prompt, { color: c.text }]}>You start at: {startTopic}</Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          Topics you seem to know come back as quick reviews first, so a lucky guess is caught
          early.
        </Text>
        <Button
          testID="go-practice"
          label="Start practising"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/math'))}
        />
      </ScrollView>
    );
  }
  if (blocked) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.muted, { color: c.text }]}>
          You&apos;ve already started practising, so the placement test would reset your progress.
        </Text>
      </View>
    );
  }
  if (probe === null) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={body}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.caption, { color: c.muted }]}>
        Placement · {TOPICS[probe.index]?.title}
      </Text>
      <Text testID="problem-prompt" style={[styles.prompt, { color: c.text }]}>
        {probe.problem.prompt}
      </Text>
      <AnswerInput
        value={input}
        onChange={(text) => {
          setInput(text);
          setUnreadable(false);
        }}
        editable
      />
      {unreadable && (
        <Text accessibilityLiveRegion="polite" style={[styles.muted, { color: c.warningText }]}>
          I couldn&apos;t read that. Write it like 3/4, 2.5 or 2x+1.
        </Text>
      )}
      <Button
        testID="check"
        label="Next"
        disabled={input.trim() === ''}
        onPress={() => void check()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.md, gap: space.md },
  heading: { fontSize: 22, fontWeight: '700' },
  caption: { fontSize: 14, fontWeight: '600' },
  muted: { fontSize: 15, lineHeight: 21 },
  prompt: { fontSize: 22, lineHeight: 30, fontWeight: '500' },
});
