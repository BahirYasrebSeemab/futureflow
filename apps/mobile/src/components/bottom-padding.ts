import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@/theme';

/**
 * Android draws edge to edge, so the end of a scrolling screen sits under the system navigation
 * bar. This pads the content so the last control can always scroll fully into view.
 */
export function useBottomPadding(): { paddingBottom: number } {
  const { bottom } = useSafeAreaInsets();
  return { paddingBottom: bottom + space.xl };
}
