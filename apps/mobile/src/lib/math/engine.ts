// The only module that imports the math-engine root (and so the CAS); see ADR 0013.
import { checkAnswer } from '@futureflow/math-engine';

export {
  answerText,
  checkAnswer,
  decimalFixed,
  decimalText,
  DEFAULT_REGISTRY,
  DIFFICULTIES,
  earnsTime,
  expectedScore,
  initialItemRating,
  MASTERY_STREAK,
  moneyText,
  newProgress,
  nextTopic,
  ONTARIO_GRAPH,
  pickDifficulty,
  placementProbe,
  placementProgress,
  QUESTIONS_PER_PROBE,
  recordAttempt,
  recordPlacementAnswer,
  startPlacement,
  toText,
  updateRatings,
} from '@futureflow/math-engine';
export type {
  Answer,
  MockResult,
  CheckOutcome,
  Difficulty,
  PlacementState,
  Problem,
  TopicProgress,
} from '@futureflow/math-engine';

/**
 * The CAS's first check costs ~0.7 s on an emulator (spike); later ones ~17 ms. Practice calls this
 * when it opens, so the owner's first answer is checked at warm speed.
 */
export function warmChecker(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      checkAnswer({ type: 'expression', text: 'x+1' }, '1+x');
      resolve();
    }, 0);
  });
}
