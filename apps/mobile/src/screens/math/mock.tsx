import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { useApp } from '@/lib/app';
import { currentDayKey } from '@/lib/format';
import { displayAnswer } from '@/lib/math/display';
import {
  checkAnswer,
  type CheckOutcome,
  type LevelId,
  type MockResult,
  warmChecker,
} from '@/lib/math/engine';
import { finishMock, MOCK_LEVELS, type RunningMock, startMock } from '@/lib/math/mocks';
import { randomSeed } from '@/lib/math/session';
import { space, usePalette } from '@/theme';
import { AnswerInput } from './answer-input';

const pad = (n: number) => String(n).padStart(2, '0');
const clockText = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
};

/** A timed mock exam: no feedback until the end; leaving early saves nothing (spec §10.7). */
export function MockScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const params = useLocalSearchParams<{ level?: string }>();
  const level: LevelId = MOCK_LEVELS.find((l) => l === params.level) ?? 'L0';
  const [mock] = useState<RunningMock>(() => startMock(level, randomSeed(), services.now()));
  const outcomes = useRef<(CheckOutcome | null)[]>([]);
  const saved = useRef(false);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [unreadable, setUnreadable] = useState(false);
  const [result, setResult] = useState<MockResult | null>(null);
  const [, setTick] = useState(0);

  const finish = useCallback(() => {
    if (saved.current) return;
    saved.current = true;
    const now = services.now();
    const final = finishMock(mock, outcomes.current, currentDayKey(now));
    setResult(final);
    void services.store.saveMockResult(services.ids.newId(now), final);
  }, [mock, services]);

  useEffect(() => {
    void warmChecker();
    const timer = setInterval(() => {
      if (services.now() >= mock.endsAt) finish();
      else setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [finish, mock.endsAt, services]);

  const next = () => {
    if (result !== null) return;
    if (services.now() >= mock.endsAt) {
      finish(); // time is up: this answer and the rest count as wrong
      return;
    }
    const problem = mock.problems[index];
    if (problem === undefined) return;
    const outcome = checkAnswer(problem.answer, input);
    if (outcome === 'unreadable') {
      setUnreadable(true);
      return;
    }
    outcomes.current[index] = outcome;
    setUnreadable(false);
    setInput('');
    if (index + 1 >= mock.problems.length) finish();
    else setIndex(index + 1);
  };

  const body = [styles.body, bottomPadding];
  if (result !== null) {
    const total = mock.problems.length;
    const right = Math.round(result.score * total);
    const wrong = mock.problems.filter((_, i) => outcomes.current[i] !== 'correct');
    return (
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={body}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>
          You scored {right} of {total} ({Math.round(result.score * 100)}%)
        </Text>
        {wrong.map((p, i) => (
          <View key={i} style={styles.review}>
            <Text style={[styles.prompt, { color: c.text }]}>{p.prompt}</Text>
            <Text style={[styles.answer, { color: c.text }]}>Answer: {displayAnswer(p)}</Text>
            {p.steps.map((step, j) => (
              <Text key={j} style={[styles.muted, { color: c.muted }]}>
                {step}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    );
  }

  const problem = mock.problems[index];
  if (problem === undefined) return null;
  const last = index + 1 >= mock.problems.length;
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={body}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.row}>
        <Text style={[styles.caption, { color: c.muted }]}>
          Question {index + 1} of {mock.problems.length}
        </Text>
        <Text accessibilityLabel="Time left" style={[styles.caption, { color: c.text }]}>
          {clockText(mock.endsAt - services.now())}
        </Text>
      </View>
      <Text style={[styles.prompt, { color: c.text }]}>{problem.prompt}</Text>
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
        testID={last ? 'mock-finish' : 'mock-next'}
        label={last ? 'Finish' : 'Next'}
        disabled={input.trim() === ''}
        onPress={next}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  heading: { fontSize: 22, fontWeight: '700' },
  caption: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  prompt: { fontSize: 20, lineHeight: 28, fontWeight: '500' },
  answer: { fontSize: 16, fontWeight: '600' },
  muted: { fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  review: { gap: space.xs },
});
