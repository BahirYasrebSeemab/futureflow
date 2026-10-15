import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { MASTERY_STREAK, ONTARIO_GRAPH } from '@/lib/math/engine';
import { radius, space, usePalette } from '@/theme';
import { AnswerInput } from './answer-input';
import { ExampleFlow } from './example';
import { usePractice } from './use-practice';

const topicTitle = (id: string) => ONTARIO_GRAPH.topics.find((t) => t.id === id)?.title ?? id;

export function MathScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const p = usePractice();
  const body = [styles.body, bottomPadding];

  if (p.phase === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (p.phase === 'choose') {
    return (
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={body}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>
          Find your level
        </Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          {p.pausedPlacement
            ? 'You started the placement test. Pick up where you left off.'
            : "A short placement test skips what you already know. About 10 problems. It doesn't earn time."}
        </Text>
        <Button
          testID="start-placement"
          label={p.pausedPlacement ? 'Continue the placement test' : 'Take the placement test'}
          onPress={() => router.push('/math-placement')}
        />
        <Button
          testID="skip-placement"
          label="Start from the beginning"
          variant="secondary"
          onPress={p.skipPlacement}
        />
      </ScrollView>
    );
  }

  if (p.phase === 'example' && p.served !== null) {
    return (
      <ExampleFlow
        key={p.served.topicId}
        topicId={p.served.topicId}
        practicePrompt={p.served.problem.prompt}
        onDone={p.finishExample}
      />
    );
  }

  if (p.phase === 'finished' || p.served === null) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.heading, { color: c.text }]}>Everything here is mastered</Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          Reviews come back on their days. New levels arrive in a later update.
        </Text>
      </View>
    );
  }

  const { served, feedback } = p;
  const answered = feedback !== null && feedback.kind !== 'unreadable';
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={body}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.row}>
        <Text style={[styles.caption, { color: c.muted }]}>{topicTitle(served.topicId)}</Text>
        {served.isReview && <Text style={[styles.caption, { color: c.accent }]}>Review</Text>}
      </View>
      <Text testID="problem-prompt" style={[styles.prompt, { color: c.text }]}>
        {served.story ?? served.problem.prompt}
      </Text>
      {!p.mastered && (
        <Text style={[styles.muted, { color: c.muted }]}>
          {p.streak} of {MASTERY_STREAK} in a row
        </Text>
      )}

      {served.problem.hints.slice(0, p.hints).map((hint, index) => (
        <Text
          key={index}
          style={[
            styles.hint,
            { color: c.text, backgroundColor: c.surface, borderColor: c.border },
          ]}
        >
          {hint}
        </Text>
      ))}

      <AnswerInput value={p.input} onChange={p.setInput} editable={!answered} />

      {feedback?.kind === 'unreadable' && (
        <Text accessibilityLiveRegion="polite" style={[styles.muted, { color: c.warningText }]}>
          I couldn&apos;t read that. Write it like 3/4, 2.5 or 2x+1.
        </Text>
      )}
      {feedback?.kind === 'correct' && (
        <View accessibilityLiveRegion="polite" style={styles.feedback}>
          <Text style={[styles.result, { color: c.text }]}>Correct</Text>
          {feedback.reward !== null && (
            <Text style={[styles.muted, { color: c.muted }]}>{feedback.reward}</Text>
          )}
        </View>
      )}
      {feedback?.kind === 'incorrect' && (
        <View accessibilityLiveRegion="polite" style={styles.feedback}>
          <Text style={[styles.result, { color: c.text }]}>
            Not quite. The answer is {feedback.answer}
          </Text>
          {feedback.steps.map((step, index) => (
            <Text key={index} style={[styles.muted, { color: c.muted }]}>
              {step}
            </Text>
          ))}
        </View>
      )}

      {answered ? (
        <Button testID="next" label="Next problem" onPress={p.next} />
      ) : (
        <>
          <Button
            testID="check"
            label="Check"
            disabled={p.busy || p.input.trim() === ''}
            onPress={() => void p.check()}
          />
          <View style={styles.row}>
            <View style={styles.half}>
              <Button
                testID="hint"
                label="Hint"
                variant="secondary"
                disabled={p.hints >= served.problem.hints.length}
                onPress={p.showHint}
              />
            </View>
            <View style={styles.half}>
              <Button
                testID="show-answer"
                label="Show answer"
                variant="secondary"
                onPress={() => void p.showAnswer()}
              />
            </View>
          </View>
        </>
      )}
      <Button
        testID="open-mocks"
        label="Mock exams"
        variant="secondary"
        onPress={() => router.push('/mocks')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    gap: space.md,
  },
  body: { padding: space.md, gap: space.md },
  heading: { fontSize: 22, fontWeight: '700' },
  caption: { fontSize: 14, fontWeight: '600' },
  muted: { fontSize: 15, lineHeight: 21 },
  prompt: { fontSize: 22, lineHeight: 30, fontWeight: '500' },
  hint: {
    fontSize: 15,
    lineHeight: 21,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.sm,
  },
  feedback: { gap: space.xs },
  result: { fontSize: 18, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  half: { flex: 1 },
});
