import { DEFAULT_RULES, mergeEvents, type LedgerEvent, type Rules } from '@futureflow/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import { useApp, type AppServices } from '@/lib/app';
import { currentDayKey } from '@/lib/format';
import { projectBalance } from '@/lib/ledger';
import { finishUnlock, startWait, waitLeftMs, type UnlockWait } from '@/lib/unlock';
import { radius, space, usePalette } from '@/theme';

type Phase =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'limit' }
  | { kind: 'form' }
  | { kind: 'waiting'; wait: UnlockWait; leftMs: number; restarted: boolean }
  | { kind: 'done' };

const TICK_MS = 1_000;

/** Today's events as the phone sees them: confirmed plus not yet sent. */
async function todayEvents(services: AppServices): Promise<LedgerEvent[]> {
  const { store, now } = services;
  const day = currentDayKey(now());
  const merged = mergeEvents(await store.confirmed(), await store.pending()).events;
  return merged.filter((e) => e.day === day);
}

const countdown = (ms: number) => {
  const seconds = Math.ceil(ms / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * Emergency unlock (spec §6.1, §7): a reason, a 10-minute wait on the monotonic clock that no
 * button skips, then 10 borrowed minutes that tomorrow's earnings repay first.
 */
export function UnlockScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const rules: Rules = useMemo(
    () => ({ ...DEFAULT_RULES, unlockWaitSeconds: services.unlockWaitSeconds }),
    [services],
  );
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [reason, setReason] = useState('');
  /** An unlock is a ledger event (spec §4.3): debt takes its share first. */
  const [owed, setOwed] = useState(0);

  /** Where the wait stands now; a reboot starts it again with the same reason. */
  const check = useCallback(
    async (wait: UnlockWait, restarted = false) => {
      const clock = await services.guard.clock();
      if (clock === null) return setPhase({ kind: 'unavailable' });
      const left = waitLeftMs(wait, clock, rules);
      if (left === 'restart') {
        const again = startWait(wait.reason, clock, services.now());
        await services.store.saveUnlockWait(again);
        return setPhase({
          kind: 'waiting',
          wait: again,
          leftMs: rules.unlockWaitSeconds * 1_000,
          restarted: true,
        });
      }
      setPhase({ kind: 'waiting', wait, leftMs: left, restarted });
    },
    [services, rules],
  );

  useEffect(() => {
    void (async () => {
      if ((await services.guard.clock()) === null) return setPhase({ kind: 'unavailable' });
      const balance = projectBalance(
        await services.store.confirmed(),
        await services.store.pending(),
      );
      setOwed(Math.max(0, -balance));
      const used = (await todayEvents(services)).filter((e) => e.kind === 'unlock_borrow').length;
      if (used >= rules.unlockMaxPerDay) return setPhase({ kind: 'limit' });
      const wait = await services.store.unlockWait();
      if (wait === null) setPhase({ kind: 'form' });
      else await check(wait);
    })();
  }, [services, rules, check]);

  const waiting = phase.kind === 'waiting' ? phase : null;
  useEffect(() => {
    if (waiting === null || waiting.leftMs === 0) return;
    const timer = setInterval(() => void check(waiting.wait, waiting.restarted), TICK_MS);
    return () => clearInterval(timer);
  }, [waiting, check]);

  const start = async () => {
    const clock = await services.guard.clock();
    if (clock === null) return setPhase({ kind: 'unavailable' });
    const wait = startWait(reason, clock, services.now());
    await services.store.saveUnlockWait(wait);
    setPhase({ kind: 'waiting', wait, leftMs: rules.unlockWaitSeconds * 1_000, restarted: false });
  };

  const cancel = async () => {
    await services.store.saveUnlockWait(null);
    setPhase({ kind: 'form' });
  };

  // One confirm at a time: a double tap must not spend one wait twice.
  const busy = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const confirm = async (wait: UnlockWait) => {
    if (busy.current) return;
    busy.current = true;
    setConfirming(true);
    try {
      const clock = await services.guard.clock();
      if (clock === null) return setPhase({ kind: 'unavailable' });
      const now = services.now();
      const ctx = { day: currentDayKey(now), at: now, newId: services.ids.newId };
      const result = finishUnlock(await todayEvents(services), wait, clock, ctx, rules);
      if (!result.ok) {
        if (result.error === 'daily_limit_reached') setPhase({ kind: 'limit' });
        else await check(wait);
        return;
      }
      // The wait is used up in the same transaction that queues the unlock.
      if (!(await services.store.enqueueUnlock(result.value))) return setPhase({ kind: 'form' });
      await services.guard.grant(result.value.id, result.value.seconds);
      setPhase({ kind: 'done' });
      void services.syncer.sync();
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      console.error(JSON.stringify({ event: 'unlock_failed', name }));
    } finally {
      busy.current = false;
      setConfirming(false);
    }
  };

  const text = { color: c.text };
  const muted = { color: c.muted };
  const enough = reason.trim().length >= rules.unlockMinReasonLength;
  const owedMinutes = Math.ceil(owed / 60);
  const leavesMinutes = Math.max(0, Math.floor((rules.unlockGrantSeconds - owed) / 60));
  const debtNote = owed > 0 && (phase.kind === 'form' || phase.kind === 'waiting') && (
    <Text testID="unlock-debt" style={[styles.body15, { color: c.warningText }]}>
      You owe {owedMinutes} min, so this unlock leaves you {leavesMinutes} min.
    </Text>
  );
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
    >
      <Text accessibilityRole="header" style={[styles.heading, text]}>
        Emergency unlock
      </Text>
      {debtNote}
      {phase.kind === 'unavailable' && (
        <Text style={[styles.body15, muted]}>Emergency unlock needs the Android app.</Text>
      )}
      {phase.kind === 'limit' && (
        <Text testID="unlock-limit" style={[styles.body15, text]}>
          You&apos;ve used both emergency unlocks today. Earn time by finishing a task.
        </Text>
      )}
      {phase.kind === 'form' && (
        <>
          <Text style={[styles.body15, muted]}>
            Say why you need it. Then wait 10 minutes; after that you get 10 minutes, borrowed from
            tomorrow&apos;s earnings. Two a day at most.
          </Text>
          <TextInput
            testID="unlock-reason"
            accessibilityLabel="Why you need it"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={500}
            style={[
              styles.input,
              { borderColor: c.border, backgroundColor: c.surface, color: c.text },
            ]}
          />
          <Text style={[styles.small, muted]}>
            {reason.trim().length} of at least {rules.unlockMinReasonLength} characters
          </Text>
          <Button
            testID="unlock-start"
            label="Start the 10-minute wait"
            disabled={!enough}
            onPress={() => void start()}
          />
        </>
      )}
      {waiting !== null && (
        <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
          {waiting.restarted && (
            <Text style={[styles.body15, text]}>
              The phone restarted, so the wait starts again.
            </Text>
          )}
          <Text style={[styles.body15, muted]}>“{waiting.wait.reason}”</Text>
          {waiting.leftMs > 0 ? (
            <Text testID="unlock-countdown" style={[styles.countdown, text]}>
              {countdown(waiting.leftMs)}
            </Text>
          ) : (
            <Button
              testID="unlock-confirm"
              label="Unlock 10 minutes"
              disabled={confirming}
              onPress={() => void confirm(waiting.wait)}
            />
          )}
          <Button
            testID="unlock-cancel"
            variant="secondary"
            label="Cancel"
            onPress={() => void cancel()}
          />
        </View>
      )}
      {phase.kind === 'done' && (
        <View testID="unlock-done" style={styles.done}>
          <Text style={[styles.heading, text]}>10 min unlocked</Text>
          <Text style={[styles.body15, muted]}>It comes off tomorrow&apos;s earnings first.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  heading: { fontSize: 22, fontWeight: '700' },
  body15: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    minHeight: 96,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  countdown: {
    fontSize: 44,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  done: { gap: space.sm },
});
