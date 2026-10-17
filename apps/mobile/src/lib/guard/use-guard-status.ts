import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useApp } from '../app';
import type { GuardStatus } from './types';

/** The guard's state, read again on focus and when the owner comes back from Settings. */
export function useGuardStatus(): GuardStatus | null {
  const { services } = useApp();
  const [status, setStatus] = useState<GuardStatus | null>(null);

  const read = useCallback(async () => {
    try {
      setStatus(await services.guard.status());
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      console.error(JSON.stringify({ event: 'guard_status_failed', name }));
    }
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      void read();
    }, [read]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void read();
    });
    return () => subscription.remove();
  }, [read]);

  return status;
}
