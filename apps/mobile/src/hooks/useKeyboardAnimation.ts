import { useEffect } from "react";
import { Keyboard, Platform } from "react-native";
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Drives a Reanimated `SharedValue<number>` that tracks the keyboard's visible
 * height (in layout points, minus the bottom safe-area inset) and animates in
 * lock-step with the keyboard's own show/hide curve.
 *
 * We listen to `keyboardWillShow/Hide` on iOS (pre-animation) so the timing
 * matches the native curve exactly. Android only fires `keyboardDidShow/Hide`
 * (post-animation), so we fall back to a reasonable duration there.
 *
 * The returned `height` value can be used as a translate/bottom/marginBottom
 * offset — callers subtract the safe-area bottom inset themselves so the hook
 * stays layout-agnostic.
 *
 * `isOpen` is a derived shared value that the caller can read from a worklet
 * (e.g. a pan gesture handler) to decide whether the keyboard is up.
 */
export function useKeyboardAnimation(): {
  height: SharedValue<number>;
  targetHeight: SharedValue<number>;
} {
  const height = useSharedValue(0);
  // Target is the resting keyboard height (what `height` animates toward when
  // no gesture is dragging it). Pan gestures drive `height` manually and then
  // spring back to `targetHeight`.
  const targetHeight = useSharedValue(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (e) => {
      const next = e.endCoordinates.height;
      targetHeight.value = next;
      cancelAnimation(height);
      height.value = withTiming(next, {
        duration: e.duration ?? 250,
        // iOS uses a custom curve ~ easeInOutQuad; Reanimated's bezier close
        // enough for the eye to read as "matches the keyboard".
        easing: Easing.bezier(0.17, 0.59, 0.4, 0.77),
      });
    });

    const hide = Keyboard.addListener(hideEvent, (e) => {
      targetHeight.value = 0;
      cancelAnimation(height);
      height.value = withTiming(0, {
        duration: e.duration ?? 250,
        easing: Easing.bezier(0.17, 0.59, 0.4, 0.77),
      });
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [height, targetHeight]);

  return { height, targetHeight };
}
