import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { displayAnswer } from '@/lib/math/display';
import { checkAnswer, ONTARIO_GRAPH } from '@/lib/math/engine';
import { exampleProblem, fadedSteps } from '@/lib/math/examples';
import { randomSeed } from '@/lib/math/session';
import { space, usePalette } from '@/theme';
import { AnswerInput } from './answer-input';

type Props = Readonly<{ topicId: string; onDone: () => void }>;
type Faded = { kind: 'correct' | 'incorrect' | 'unreadable' } | null;

/** Worked example, then a faded one; neither is recorded, rated or paid (ADR 0014). */
export function ExampleFlow({ topicId, onDone }: Props) {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  // Seeds of their own, so the example never repeats the practice problem waiting behind it.
  const [worked] = useState(() => exampleProblem(topicId, randomSeed() ^ 0x5bd1e995));
  const [faded] = useState(() => exampleProblem(topicId, randomSeed() ^ 0x2545f491));
  const [stage, setStage] = useState<'worked' | 'faded'>('worked');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Faded>(null);
  const title = ONTARIO_GRAPH.topics.find((t) => t.id === topicId)?.title ?? topicId;
  const body = [styles.body, bottomPadding];
  const muted = [styles.muted, { color: c.muted }];

  if (stage === 'worked') {
    return (
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={body}>
        <Text accessibilityRole="header" style={[styles.caption, { color: c.muted }]}>
          Worked example · {title}
        </Text>
        <Text style={[styles.prompt, { color: c.text }]}>{worked.prompt}</Text>
        {worked.steps.map((step, index) => (
          <Text key={index} style={muted}>
            {step}
          </Text>
        ))}
        <Text style={[styles.result, { color: c.text }]}>Answer: {displayAnswer(worked)}</Text>
        <Button testID="try-faded" label="Try one like it" onPress={() => setStage('faded')} />
        <Button
          testID="skip-example"
          label="Skip to practice"
          variant="secondary"
          onPress={onDone}
        />
      </ScrollView>
    );
  }

  const { shown } = fadedSteps(faded.steps);
  const answered = result !== null && result.kind !== 'unreadable';
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={body}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.caption, { color: c.muted }]}>Your turn · {title}</Text>
      <Text style={[styles.prompt, { color: c.text }]}>{faded.prompt}</Text>
      {shown.map((step, index) => (
        <Text key={index} style={muted}>
          {step}
        </Text>
      ))}
      <Text style={[styles.result, { color: c.text }]}>Finish the last step</Text>
      <AnswerInput
        value={input}
        onChange={(text) => {
          setInput(text);
          if (result?.kind === 'unreadable') setResult(null);
        }}
        editable={!answered}
      />
      {result?.kind === 'unreadable' && (
        <Text accessibilityLiveRegion="polite" style={[styles.muted, { color: c.warningText }]}>
          I couldn&apos;t read that. Write it like 3/4, 2.5 or 2x+1.
        </Text>
      )}
      {result?.kind === 'correct' && (
        <Text style={[styles.result, { color: c.text }]}>Correct</Text>
      )}
      {result?.kind === 'incorrect' && (
        <View style={styles.feedback}>
          <Text style={[styles.result, { color: c.text }]}>
            Not quite. The answer is {displayAnswer(faded)}
          </Text>
          {faded.steps.map((step, index) => (
            <Text key={index} style={muted}>
              {step}
            </Text>
          ))}
        </View>
      )}
      {answered ? (
        <Button testID="start-practice" label="Start practising" onPress={onDone} />
      ) : (
        <>
          <Button
            testID="check-faded"
            label="Check"
            disabled={input.trim() === ''}
            onPress={() => setResult({ kind: checkAnswer(faded.answer, input) })}
          />
          <Button
            testID="skip-example"
            label="Skip to practice"
            variant="secondary"
            onPress={onDone}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  caption: { fontSize: 14, fontWeight: '600' },
  prompt: { fontSize: 22, lineHeight: 30, fontWeight: '500' },
  muted: { fontSize: 15, lineHeight: 21 },
  result: { fontSize: 17, fontWeight: '600' },
  feedback: { gap: space.xs },
});
