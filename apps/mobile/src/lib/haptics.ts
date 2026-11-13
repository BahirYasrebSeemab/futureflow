import * as Haptics from 'expo-haptics';

/** Haptics are a nicety: a phone without a vibrator, or an error, must never break a tap. */
function safely(run: () => Promise<void>): void {
  try {
    run().catch(() => undefined);
  } catch {
    // Ignored on purpose, see above.
  }
}

export const haptics = {
  /** A light tick for primary actions. */
  tap: () => safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A task passed, a plan locked, the phone paired. */
  success: () => safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Something needs attention: a failed check, a refused action. */
  warn: () => safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
} as const;
