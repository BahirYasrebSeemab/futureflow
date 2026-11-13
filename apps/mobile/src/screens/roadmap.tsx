import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from '@/components/banner';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import type { Roadmap } from '@/lib/api/client';
import { useApp } from '@/lib/app';
import {
  addIdentity,
  addMilestone,
  addSkill,
  editIdentity,
  editMilestone,
  editSkill,
  emptyRoadmap,
  removeIdentity,
  removeMilestone,
  removeSkill,
  roadmapProblems,
  TEXT_LIMITS,
} from '@/lib/roadmap-draft';
import { radius, space, usePalette } from '@/theme';
import { TextField } from '@/components/text-field';

type Verifier = Roadmap['skills'][number]['verifier'];
const VERIFIERS: readonly [Verifier, string][] = [
  ['github', 'GitHub'],
  ['math', 'Math'],
  ['reading', 'Reading'],
  ['usage', 'Phone use'],
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Who you want to become, the skills that get you there, and their milestones (spec §9.1). */
export function RoadmapScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const [saved, setSaved] = useState<Roadmap | null>(null);
  const [draft, setDraft] = useState<Roadmap>(emptyRoadmap());
  const [load, setLoad] = useState<'loading' | 'failed' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Saving replaces the whole server roadmap, so the editor only opens once it has loaded.
  const fetchRoadmap = useCallback(async () => {
    setLoad('loading');
    setMessage(null);
    const result = await services.api.getRoadmap();
    if (!result.ok) {
      setMessage({ ok: false, text: 'Loading the roadmap needs a connection.' });
      setLoad('failed');
      return;
    }
    if (result.data !== null) {
      setSaved(result.data);
      setDraft(result.data);
    }
    setLoad('ready');
  }, [services]);

  useEffect(() => {
    void fetchRoadmap();
  }, [fetchRoadmap]);

  const problems = roadmapProblems(draft);
  const changed = JSON.stringify(saved ?? emptyRoadmap()) !== JSON.stringify(draft);
  const newId = () => services.ids.newId();

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await services.api.saveRoadmap(draft);
      if (result.ok) {
        setSaved(result.data);
        setDraft(result.data);
        setMessage({ ok: true, text: 'Roadmap saved.' });
      } else if (result.error.kind === 'network') {
        setMessage({ ok: false, text: 'Saving needs a connection.' });
      } else if (result.error.kind === 'invalid_response') {
        setMessage({ ok: false, text: 'This app is out of date for the server. Update the app.' });
      } else {
        setMessage({ ok: false, text: result.error.message });
      }
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) => [
    styles.chip,
    { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.surface },
  ];
  const chipText = (on: boolean) => ({ color: on ? c.accentText : c.text });
  const field = (
    testID: string,
    label: string,
    value: string,
    onChange: (t: string) => void,
    maxLength: number,
    multiline = false,
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      <TextField
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        maxLength={maxLength}
        multiline={multiline}
      />
    </View>
  );

  if (load === 'loading') return null;
  if (load === 'failed') {
    return (
      <View style={[styles.body, { flex: 1, backgroundColor: c.background }]}>
        {message !== null && <Banner tone="warning" message={message.text} />}
        <Button testID="retry-roadmap" label="Try again" onPress={() => void fetchRoadmap()} />
      </View>
    );
  }
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
      keyboardShouldPersistTaps="handled"
    >
      {message !== null &&
        (message.ok ? (
          <Text accessibilityLiveRegion="polite" style={[styles.muted, { color: c.text }]}>
            {message.text}
          </Text>
        ) : (
          <Banner tone="warning" message={message.text} />
        ))}
      {draft.identities.length === 0 && (
        <Text style={[styles.muted, { color: c.muted }]}>
          Who do you want to become? Up to 3 identities, each with the skills that get you there.
        </Text>
      )}
      {draft.identities.map((identity, i) => (
        <View
          key={identity.id}
          style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}
        >
          {field(
            `identity-title-${i}`,
            'I want to become',
            identity.title,
            (t) => setDraft((r) => editIdentity(r, identity.id, { title: t })),
            TEXT_LIMITS.identityTitle,
          )}
          {field(
            `identity-why-${i}`,
            'Why',
            identity.why,
            (t) => setDraft((r) => editIdentity(r, identity.id, { why: t })),
            TEXT_LIMITS.why,
            true,
          )}
          {field(
            `identity-deadline-${i}`,
            'By (optional, like 2027-06-30)',
            identity.deadline ?? '',
            (t) => setDraft((r) => editIdentity(r, identity.id, { deadline: t === '' ? null : t })),
            10,
          )}
          {draft.skills.map((skill, j) =>
            skill.identityId !== identity.id ? null : (
              <View key={skill.id} style={[styles.inner, { borderColor: c.border }]}>
                {field(
                  `skill-name-${j}`,
                  'Skill',
                  skill.name,
                  (t) => setDraft((r) => editSkill(r, skill.id, { name: t })),
                  TEXT_LIMITS.skillName,
                )}
                {field(
                  `skill-rubric-${j}`,
                  'How it is judged',
                  skill.rubric,
                  (t) => setDraft((r) => editSkill(r, skill.id, { rubric: t })),
                  TEXT_LIMITS.rubric,
                )}
                <View style={styles.chips}>
                  {VERIFIERS.map(([value, label]) => (
                    <Pressable
                      key={value}
                      testID={`skill-${j}-verifier-${value}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: skill.verifier === value }}
                      onPress={() => setDraft((r) => editSkill(r, skill.id, { verifier: value }))}
                      style={chip(skill.verifier === value)}
                    >
                      <Text style={chipText(skill.verifier === value)}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.label, { color: c.muted }]}>Rest day</Text>
                <View style={styles.chips}>
                  {DAYS.map((day, d) => (
                    <Pressable
                      key={day}
                      testID={`skill-${j}-rest-${d}`}
                      accessibilityRole="radio"
                      accessibilityLabel={`Rest on ${day}`}
                      accessibilityState={{ selected: skill.restWeekday === d }}
                      onPress={() =>
                        setDraft((r) =>
                          editSkill(r, skill.id, {
                            restWeekday: skill.restWeekday === d ? null : d,
                          }),
                        )
                      }
                      style={chip(skill.restWeekday === d)}
                    >
                      <Text style={chipText(skill.restWeekday === d)}>{day}</Text>
                    </Pressable>
                  ))}
                </View>
                {draft.milestones.map((m, k) =>
                  m.skillId !== skill.id ? null : (
                    <View key={m.id} style={styles.milestone}>
                      <View style={styles.grow}>
                        {field(
                          `milestone-title-${k}`,
                          'Milestone',
                          m.title,
                          (t) => setDraft((r) => editMilestone(r, m.id, { title: t })),
                          TEXT_LIMITS.milestoneTitle,
                        )}
                      </View>
                      <Pressable
                        testID={`done-${k}`}
                        accessibilityRole="checkbox"
                        accessibilityLabel="Done"
                        accessibilityState={{ checked: m.done }}
                        onPress={() => setDraft((r) => editMilestone(r, m.id, { done: !m.done }))}
                        style={chip(m.done)}
                      >
                        <Text style={chipText(m.done)}>Done</Text>
                      </Pressable>
                      <Button
                        label="Remove"
                        variant="secondary"
                        onPress={() => setDraft((r) => removeMilestone(r, m.id))}
                      />
                    </View>
                  ),
                )}
                <Button
                  testID={`add-milestone-${j}`}
                  label="Add a milestone"
                  variant="secondary"
                  onPress={() => setDraft((r) => addMilestone(r, skill.id, newId()))}
                />
                <Button
                  label="Remove skill"
                  variant="secondary"
                  onPress={() => setDraft((r) => removeSkill(r, skill.id))}
                />
              </View>
            ),
          )}
          <Button
            testID={`add-skill-${i}`}
            label="Add a skill"
            variant="secondary"
            onPress={() => setDraft((r) => addSkill(r, identity.id, newId(), 'reading'))}
          />
          <Button
            testID={`remove-identity-${i}`}
            label="Remove identity"
            variant="secondary"
            onPress={() => setDraft((r) => removeIdentity(r, identity.id))}
          />
        </View>
      ))}
      <Button
        testID="add-identity"
        label="Add an identity"
        variant="secondary"
        disabled={draft.identities.length >= 3}
        onPress={() => setDraft((r) => addIdentity(r, newId()))}
      />
      {problems.map((p) => (
        <Text key={p} style={[styles.muted, { color: c.dangerText }]}>
          {p}
        </Text>
      ))}
      <Button
        testID="save-roadmap"
        label={busy ? 'Saving…' : 'Save roadmap'}
        disabled={busy || !changed || problems.length > 0}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  muted: { fontSize: 15, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  inner: { borderTopWidth: 1, paddingTop: space.sm, gap: space.sm },
  field: { gap: space.xs },
  label: { fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 44,
    minWidth: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestone: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 160 },
});
