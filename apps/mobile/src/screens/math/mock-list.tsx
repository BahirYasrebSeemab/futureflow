import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { useApp } from '@/lib/app';
import {
  DEFAULT_REGISTRY,
  type LevelId,
  type MockResult,
  ONTARIO_GRAPH,
  recommendedMockSize,
} from '@/lib/math/engine';
import { gateProgress, MOCK_LEVELS, MS_PER_QUESTION } from '@/lib/math/mocks';
import { radius, space, usePalette } from '@/theme';

const LEVEL_NAME: Readonly<Record<string, string>> = {
  L0: 'Arithmetic',
  L1: 'Grade 9 (MTH1W)',
  L2: 'Grade 10 (MPM2D)',
};

export function MockListScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const [results, setResults] = useState<MockResult[]>([]);

  // Every visit, so a mock just finished shows in the best score and Gate A.
  useFocusEffect(
    useCallback(() => {
      void services.store.mockResults().then(setResults);
    }, [services]),
  );

  const best = (level: LevelId) => {
    const scores = results.filter((r) => r.level === level).map((r) => r.score);
    return scores.length === 0 ? null : Math.round(Math.max(...scores) * 100);
  };
  const gate = gateProgress(results);
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
    >
      <Text style={[styles.muted, { color: c.muted }]}>
        A mock covers every topic of a level at every difficulty, two minutes a question. It
        doesn&apos;t earn time and shows answers only at the end.
      </Text>
      <Text style={[styles.gate, { color: c.text }]}>
        {gate.passed
          ? 'Gate A passed: ready for the TDSB math placement'
          : `Gate A: ${gate.passes} of ${gate.required} passing L2 mocks (75%+), on different days`}
      </Text>
      {MOCK_LEVELS.map((level) => {
        const topics = ONTARIO_GRAPH.topics.filter((t) => t.level === level).length;
        const size = recommendedMockSize(ONTARIO_GRAPH, DEFAULT_REGISTRY, level);
        const score = best(level);
        return (
          <Pressable
            key={level}
            testID={`mock-${level}`}
            accessibilityRole="button"
            onPress={() => router.push(`/mock?level=${level}`)}
            style={({ pressed }) => [
              styles.row,
              { borderColor: c.border, backgroundColor: c.surface },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.title, { color: c.text }]}>
              {level} · {LEVEL_NAME[level]}
            </Text>
            <Text style={[styles.muted, { color: c.muted }]}>
              {topics} topics · {size} problems · {(size * MS_PER_QUESTION) / 60_000} min
              {score === null ? '' : ` · Best: ${score}%`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  muted: { fontSize: 15, lineHeight: 21 },
  gate: { fontSize: 16, fontWeight: '600' },
  row: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.xs, minHeight: 48 },
  title: { fontSize: 17, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
