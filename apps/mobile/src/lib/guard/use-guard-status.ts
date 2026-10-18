import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useApp } from '../app';
import type { GuardStatus } from './types';

/**
 * The guard's state, read again on focus and when the owner comes back from Settings. `refresh`
 * reads it now (after a permission prompt, which doesn't leave the app).
 */
export function useGuardStatus(): { status: GuardStatus | null; refresh: () => Promise<void> } {
  const { services } = useApp();
  const [status, setStatus] = useState<GuardStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await services.guard.status());
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      console.error(JSON.stringify({ event: 'guard_status_failed', name }));
    }
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { status, refresh };
}
