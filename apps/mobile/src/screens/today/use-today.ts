import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApp } from '@/lib/app';
import { projectBalance } from '@/lib/ledger';
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
  lastSync: SyncReport | null;
}>;

const INITIAL: TodayView = {
  loaded: false,
  syncing: false,
  tried: false,
  saved: null,
  ledgerComplete: false,
  balanceSeconds: 0,
  lastSync: null,
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
    setView((v) => ({ ...v, loaded: true, saved, ledgerComplete, balanceSeconds, lastSync }));
  }, [services]);

  const refresh = useCallback(async () => {
    setView((v) => ({ ...v, syncing: true }));
    try {
      await services.syncer.sync();
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      console.error(JSON.stringify({ event: 'sync_failed', name }));
    }
    await reload();
    if (live.current) setView((v) => ({ ...v, syncing: false, tried: true }));
  }, [services, reload]);

  useEffect(() => {
    live.current = true;
    void reload().then(refresh);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      live.current = false;
      subscription.remove();
    };
  }, [reload, refresh]);

  return { ...view, refresh };
}
