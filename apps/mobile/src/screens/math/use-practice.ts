import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/app';
import { currentDayKey } from '@/lib/format';
import { newProgress, ONTARIO_GRAPH, startPlacement, warmChecker } from '@/lib/math/engine';
import { giveUp, gradeAttempt, type Graded, type Served } from '@/lib/math/practice';
import { nextProblem, recordGraded } from '@/lib/math/session';

export type Feedback =
  | { kind: 'unreadable' }
  | { kind: 'correct'; reward: string | null }
  | { kind: 'incorrect'; answer: string; steps: readonly string[] };

type Phase = 'loading' | 'choose' | 'practice' | 'finished';

const logFailure = (event: string, error: unknown) => {
  const name = error instanceof Error ? error.name : 'unknown';
  console.error(JSON.stringify({ event, name }));
};

export function usePractice() {
  const { services } = useApp();
  const [phase, setPhase] = useState<Phase>('loading');
  const [served, setServed] = useState<Served | null>(null);
  const [streak, setStreak] = useState(0);
  const [input, setInput] = useState('');
  const [hints, setHints] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // a ref, so two taps in one frame can't both grade
  const [mastered, setMastered] = useState(false);
  const [pausedPlacement, setPausedPlacement] = useState(false);

  const serve = useCallback(async () => {
    const next = await nextProblem(services);
    if (next === null) {
      setPhase('finished');
      return;
    }
    const progress = await services.store.mathProgress();
    setStreak(progress.get(next.topicId)?.streak ?? 0);
    setMastered(progress.get(next.topicId)?.mastered ?? false);
    setServed(next);
    setInput('');
    setHints(0);
    setFeedback(null);
    setPhase('practice');
  }, [services]);

  useEffect(() => {
    void warmChecker(); // the CAS's first check is slow; do it before the owner answers
  }, []);

  // On every visit (e.g. back from the placement test), decide again what to show.
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const [placement, progress] = await Promise.all([
          services.store.placement(),
          services.store.mathProgress(),
        ]);
        const paused = placement !== null && !placement.done;
        setPausedPlacement(paused);
        if ((placement === null && progress.size === 0) || paused) setPhase('choose');
        else await serve();
      })();
    }, [services, serve]),
  );

  const skipPlacement = async () => {
    await services.store.savePlacement({
      state: startPlacement(ONTARIO_GRAPH.topics.length),
      done: true,
    });
    await serve();
  };

  const finish = async (graded: Exclude<Graded, { outcome: 'unreadable' }>, current: Served) => {
    const reward = await recordGraded(services, current, graded);
    setStreak(graded.progress.streak);
    setMastered(graded.progress.mastered);
    setFeedback(
      graded.outcome === 'correct'
        ? { kind: 'correct', reward }
        : { kind: 'incorrect', answer: graded.answer, steps: current.problem.steps },
    );
  };

  const context = async (current: Served) => {
    const now = services.now();
    const progress = await services.store.mathProgress();
    return {
      usedHints: hints > 0,
      seenBefore: await services.store.hasSeen(current.key),
      today: currentDayKey(now),
      at: now,
      id: services.ids.newId(now),
      current: progress.get(current.topicId) ?? newProgress(current.topicId),
    };
  };

  const run = async (task: (current: Served) => Promise<void>) => {
    const answered = feedback !== null && feedback.kind !== 'unreadable';
    if (served === null || busyRef.current || answered) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task(served);
    } catch (error) {
      logFailure('practice_failed', error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const check = () =>
    run(async (current) => {
      const graded = gradeAttempt(current, input, await context(current));
      if (graded.outcome === 'unreadable') setFeedback({ kind: 'unreadable' });
      else await finish(graded, current);
    });

  const showAnswer = () =>
    run(async (current) => {
      await finish(
        giveUp(current, await context(current)) as Exclude<Graded, { outcome: 'unreadable' }>,
        current,
      );
    });

  return {
    phase,
    served,
    streak,
    mastered,
    pausedPlacement,
    input,
    hints,
    feedback,
    busy,
    setInput: (text: string) => {
      setInput(text);
      if (feedback?.kind === 'unreadable') setFeedback(null);
    },
    showHint: () => setHints((h) => Math.min(h + 1, served?.problem.hints.length ?? 0)),
    check,
    showAnswer,
    next: () => void serve(),
    skipPlacement: () => void skipPlacement(),
  };
}
