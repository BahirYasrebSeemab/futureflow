import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApp } from '@/lib/app';
import { checkAway } from '@/lib/away';
import { dayTotals, projectBalance } from '@/lib/ledger';
import type { SavedToday, SyncReport } from '@/lib/store/types';

export type TodayView = Readonly<{
  loaded: boolean;
  syncing: boolean;
  /** A sync attempt finished in this session (it may have failed or thrown). */
  tried: boolean;
  saved: SavedToday | null;
  /** False until a pull has reached the end of the ledger: before that the balance is unknown. */
  ledgerComplete: boolean;
  balanceSeconds: number;
  /** Paid today for work (tasks, the all-done bonus, math). */
  earnedSeconds: number;
  /** The free daily allowance paid today. */
  allowanceSeconds: number;
  lastSync: SyncReport | null;
}>;

const INITIAL: TodayView = {
  loaded: false,
  syncing: false,
  tried: false,
  saved: null,
  ledgerComplete: false,
  balanceSeconds: 0,
  earnedSeconds: 0,
  allowanceSeconds: 0,
  lastSync: null,
};

const logFailure = (event: string, error: unknown) => {
  const name = error instanceof Error ? error.name : 'unknown';
  console.error(JSON.stringify({ event, name }));
};

/** Shows what is saved at once, then syncs on open, on return to the app and on demand. */
export function useToday() {
  const { services } = useApp();
  const [view, setView] = useState<TodayView>(INITIAL);
  const live = useRef(true);

  const reload = useCallback(async () => {
    const { store } = services;
    const [saved, ledgerComplete, confirmed, pending, lastSync] = await Promise.all([
      store.savedToday(),
      store.ledgerComplete(),
      store.confirmed(),
      store.pending(),
      store.lastSync(),
    ]);
    if (!live.current) return;
    const balanceSeconds = projectBalance(confirmed, pending);
    const totals = dayTotals(confirmed, pending, saved?.today.day ?? '');
    setView((v) => ({
      ...v,
      loaded: true,
      saved,
      ledgerComplete,
      balanceSeconds,
      earnedSeconds: totals.earned,
      allowanceSeconds: totals.allowance,
      lastSync,
    }));
  }, [services]);

  const refresh = useCallback(async () => {
    setView((v) => ({ ...v, syncing: true }));
    try {
      // On an away day, measure first (on the phone) so this sync brings back the result.
      const saved = await services.store.savedToday();
      if (saved !== null) await checkAway(services, saved.today);
    } catch (error) {
      logFailure('away_check_failed', error);
    }
    try {
      await services.syncer.sync();
    } catch (error) {
      logFailure('sync_failed', error);
    }
    try {
      await reload();
    } catch (error) {
      logFailure('reload_failed', error);
    } finally {
      if (live.current) setView((v) => ({ ...v, syncing: false, tried: true }));
    }
  }, [services, reload]);

  useEffect(() => {
    live.current = true;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      live.current = false;
      subscription.remove();
    };
  }, [refresh]);

  // Every time Today comes into view (first open, or back from Plan or Diagnostics).
  useFocusEffect(
    useCallback(() => {
      void reload().then(refresh);
    }, [reload, refresh]),
  );

  return { ...view, refresh };
}
