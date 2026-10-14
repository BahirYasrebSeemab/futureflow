import { useState } from 'react';
import { Alert } from 'react-native';
import type { ApiFailure, ApiResult } from '@/lib/api/client';
import { useApp } from '@/lib/app';

type Messages = Readonly<{ offline: string; refusals: Readonly<Record<string, string>> }>;

const BAD_DAY: Messages = {
  offline: 'Declaring a day needs a connection.',
  refusals: {
    bad_day_limit_reached: "This week's bad day is already used.",
    already_declared: 'Today already has a day type.',
  },
};

const DECIDE: Messages = {
  offline: 'Deciding needs a connection.',
  refusals: { verdict_not_pending: 'This task was already decided.' },
};

function failureMessage(error: ApiFailure, messages: Messages): string {
  switch (error.kind) {
    case 'network':
      return messages.offline;
    case 'invalid_response':
      return 'This app is out of date for the server. Update the app.';
    case 'server':
      return 'The server had a problem. Try again soon.';
    case 'rejected':
      return messages.refusals[error.code] ?? error.message;
  }
}

/** Actions that change today on the server, each behind a confirmation. */
export function useDayActions(day: string, refresh: () => Promise<void>) {
  const { services } = useApp();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (call: () => Promise<ApiResult<unknown>>, messages: Messages) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await call();
      if (result.ok) await refresh();
      else {
        setMessage(failureMessage(result.error, messages));
        // Someone (or the judge) decided first: show the current state.
        if (result.error.kind === 'rejected' && result.error.code === 'verdict_not_pending') {
          await refresh();
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const declareBadDay = () =>
    Alert.alert(
      'Make today a bad day?',
      'Your tasks shrink to their 2-minute versions. You get one bad day a week.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Bad day',
          onPress: () => void run(() => services.api.declareBadDay(day), BAD_DAY),
        },
      ],
    );

  /** The owner answers for a task the judge left pending (ADR 0008: never decided silently). */
  const decide = (taskId: string, outcome: 'pass' | 'fail') => {
    const send = () => void run(() => services.api.decideVerdict(taskId, { day, outcome }), DECIDE);
    if (outcome === 'pass') {
      Alert.alert('Mark it done?', "Only confirm what you really did. This pays the task's time.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, I did it', onPress: send },
      ]);
    } else {
      Alert.alert('Mark it not done?', 'The task pays nothing today.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Not done', onPress: send },
      ]);
    }
  };

  return { message, busy, declareBadDay, decide };
}
