import { useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { motion } from "@/theme";

export const springs = motion.springs;
export const durations = motion.durations;

const PRESSED_SCALE = 0.97;

export function usePressScale(toScale = PRESSED_SCALE) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  function onPressIn() {
    scale.value = reducedMotion ? 1 : withSpring(toScale, springs.snap);
  }
  function onPressOut() {
    scale.value = reducedMotion ? 1 : withSpring(1, springs.snap);
  }
  return { animatedStyle, onPressIn, onPressOut };
}

export function useFadeInFromBottom(delay = 0) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: durations.base }));
    translateY.value = reducedMotion ? 0 : withDelay(delay, withSpring(0, springs.smooth));
  }, [delay, opacity, reducedMotion, translateY]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}

export function usePulse(duration = 800) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.4, { duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [duration, opacity, reducedMotion]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export function useSlideInFromRight() {
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateX.value = reducedMotion ? 0 : withSpring(0, springs.smooth);
    opacity.value = withTiming(1, { duration: durations.fast });
  }, [opacity, reducedMotion, translateX]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));
}
