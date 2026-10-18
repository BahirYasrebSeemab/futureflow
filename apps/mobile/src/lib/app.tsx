import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, usePalette } from '@/theme';
import type { Api } from './api/client';
import { StartupError } from './config';
import type { Ids } from './ids';
import type { Guard } from './guard/types';
import type { Locator } from './location';
import { forgetPairing, readSession, TOKEN_KEY, type Session } from './pairing';
import type { SecretStore } from './secrets';
import type { LocalStore } from './store/types';
import type { Syncer } from './sync';

export type AppServices = Readonly<{
  api: Api;
  store: LocalStore;
  secrets: SecretStore;
  ids: Ids;
  syncer: Syncer;
  locator: Locator;
  guard: Guard;
  now: () => number;
  apiUrl: string;
  /** Blocked on top of the owner's list: Settings in the emulator build, nothing elsewhere. */
  extraBlocked: readonly string[];
  /** 600 in every store build; the emulator build waits a few seconds. */
  unlockWaitSeconds: number;
}>;

type AppValue = Readonly<{
  services: AppServices;
  session: Session;
  setPaired: (deviceId: string) => void;
  forgetPairing: () => Promise<void>;
}>;

type State =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; services: AppServices; session: Session };

const AppContext = createContext<AppValue | null>(null);
const GENERIC_FAILURE =
  'The app could not open its storage. Restart it; if this keeps happening, reinstall.';

/** Loads the services and the saved session before any screen renders, so nothing flashes or misroutes. */
export function AppProvider({
  load,
  children,
}: {
  load: () => Promise<AppServices>;
  children: ReactNode;
}) {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const services = await load();
        const session = await readSession(services.secrets);
        if (live) setState({ phase: 'ready', services, session });
      } catch (error) {
        const name = error instanceof Error ? error.name : 'unknown';
        console.error(JSON.stringify({ event: 'startup_failed', name }));
        const message = error instanceof StartupError ? error.message : GENERIC_FAILURE;
        if (live) setState({ phase: 'failed', message });
      }
    })();
    return () => {
      live = false;
    };
  }, [load]);

  const setPaired = useCallback((deviceId: string) => {
    setState((s) => (s.phase === 'ready' ? { ...s, session: { status: 'paired', deviceId } } : s));
  }, []);

  const services = state.phase === 'ready' ? state.services : null;
  const sessionStatus = state.phase === 'ready' ? state.session.status : null;

  // The guard's heartbeat runs without React Native, so it keeps its own copy of the token.
  useEffect(() => {
    if (services === null || sessionStatus === null) return;
    void (async () => {
      try {
        const token = sessionStatus === 'paired' ? await services.secrets.get(TOKEN_KEY) : null;
        if (token === null) await services.guard.unlink();
        else await services.guard.link(services.apiUrl, token);
      } catch (error) {
        const name = error instanceof Error ? error.name : 'unknown';
        console.error(JSON.stringify({ event: 'guard_link_failed', name }));
      }
    })();
  }, [services, sessionStatus]);
  const forget = useCallback(async () => {
    if (services === null) return;
    await services.syncer.idle(); // a running sync must not write after the wipe
    await forgetPairing(services.secrets, services.store);
    setState((s) => (s.phase === 'ready' ? { ...s, session: { status: 'unpaired' } } : s));
  }, [services]);

  const value = useMemo<AppValue | null>(
    () =>
      state.phase === 'ready'
        ? { services: state.services, session: state.session, setPaired, forgetPairing: forget }
        : null,
    [state, setPaired, forget],
  );

  if (state.phase === 'loading') return null;
  if (state.phase === 'failed') return <StartupFailure message={state.message} />;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (value === null) throw new Error('useApp must be used inside AppProvider');
  return value;
}

function StartupFailure({ message }: { message: string }) {
  const c = usePalette();
  return (
    <View style={[styles.failure, { backgroundColor: c.background }]}>
      <Text accessibilityRole="header" style={[styles.failureTitle, { color: c.text }]}>
        Future Flow can&apos;t start
      </Text>
      <Text style={[styles.failureBody, { color: c.muted }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  failure: { flex: 1, justifyContent: 'center', padding: space.lg, gap: space.sm },
  failureTitle: { fontSize: 22, fontWeight: '600' },
  failureBody: { fontSize: 16, lineHeight: 22 },
});
