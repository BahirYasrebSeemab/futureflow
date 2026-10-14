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
      else setMessage(failureMessage(result.error, messages));
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

  return { message, busy, declareBadDay };
}
